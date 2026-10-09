#!/usr/bin/env python3
"""Generate a metadata-only RSS feed of new chapters for one KadoComi series."""
from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

SERIES_ID = "KC_005844_S"
TITLE = "怠惰な悪辱貴族に転生した俺、シナリオをぶっ壊したら規格外の魔力で最凶になった"
OFFICIAL = f"https://comic-walker.com/detail/{SERIES_ID}?episodeType=latest"
ANTENNA = f"https://webcomics.jp/comic-walker/{SERIES_ID}"
SOURCES = (OFFICIAL, f"https://comic-walker.com/detail/{SERIES_ID}", ANTENNA)
RSS_PATH = Path(__file__).resolve().parents[1] / "rss" / f"comic-walker-{SERIES_ID}.xml"
JST = timezone(timedelta(hours=9))
UA = "comic-walker-chapter-rss/1.0 (+https://github.com/g960059/md_downloader)"
CHAPTER = re.compile(r"(第\s*[0-9０-９]+話[^\s　、。<>]*|最終話[^\s　、。<>]*)")
DATE_YMD = re.compile(r"(20\d\d)[/-](\d{1,2})[/-](\d{1,2})")
DATE_JP = re.compile(r"(20\d\d)年\s*(\d{1,2})月\s*(\d{1,2})日")
DATE_MD = re.compile(r"(?<!\d)(\d{1,2})月\s*(\d{1,2})日")
EPISODE_PATH = re.compile(rf"^/detail/{SERIES_ID}/episodes/KC_005844[^/?#]*_E$")


@dataclass(frozen=True)
class Chapter:
    title: str
    link: str
    published: datetime


def parse_date(text: str, now: datetime) -> datetime | None:
    for pattern in (DATE_YMD, DATE_JP):
        m = pattern.search(text)
        if m:
            try:
                return datetime(*(int(x) for x in m.groups()), tzinfo=JST)
            except ValueError:
                pass
    m = DATE_MD.search(text)
    if m:
        month, day = map(int, m.groups())
        try:
            dt = datetime(now.year, month, day, tzinfo=JST)
            return dt.replace(year=now.year - 1) if dt > now + timedelta(days=2) else dt
        except ValueError:
            pass
    m = re.search(r"(\d+)\s*(分|時間|日)前", text)
    if m:
        value = int(m.group(1))
        unit = {"分": "minutes", "時間": "hours", "日": "days"}[m.group(2)]
        dt = now - timedelta(**{unit: value})
        return dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return None


def parse_html(html: str, now: datetime, source_url: str = OFFICIAL) -> list[Chapter]:
    soup = BeautifulSoup(html, "html.parser")
    result: dict[str, Chapter] = {}
    for a in soup.find_all("a", href=True):
        href = urljoin(source_url, a.get("href", ""))
        parsed = urlparse(href)
        if parsed.netloc not in ("comic-walker.com", "www.comic-walker.com"):
            continue
        if not EPISODE_PATH.fullmatch(parsed.path):
            continue
        episode_url = urlunparse(("https", "comic-walker.com", parsed.path, "", "", ""))
        raw = a.get_text(" ", strip=True)
        hit = CHAPTER.search(raw)
        if not hit:
            continue  # Exclude book promos, commemorative art, hiatus notices, etc.
        chapter_title = re.sub(r"\s+", "", hit.group(1))
        published = parse_date(raw, now)
        if published is None:
            parent = a
            for _ in range(5):
                parent = parent.parent
                if parent is None:
                    break
                nearby = parent.get_text(" ", strip=True)
                if len(nearby) > 600:
                    break
                published = parse_date(nearby, now)
                if published:
                    break
        if published is None:
            published = now.replace(hour=0, minute=0, second=0, microsecond=0)
        result[episode_url] = Chapter(chapter_title, episode_url, published)
    return list(result.values())


def existing_chapters(path: Path) -> dict[str, Chapter]:
    if not path.exists():
        return {}
    root = ET.parse(path).getroot()
    out = {}
    for item in root.findall("./channel/item"):
        link = item.findtext("guid") or item.findtext("link")
        title = item.findtext("title")
        date = item.findtext("pubDate")
        if link and title and date:
            out[link] = Chapter(title, link, parsedate_to_datetime(date))
    return out


def write_feed(items: list[Chapter], output: Path, now: datetime) -> None:
    rss = ET.Element("rss", version="2.0")
    channel = ET.SubElement(rss, "channel")
    for tag, value in (("title", f"{TITLE}｜最新話RSS"),
                       ("link", OFFICIAL),
                       ("description", "新しい本編エピソードのみ。漫画本文・画像は配信せず公式サイトへリンクします。"),
                       ("language", "ja"),
                       ("lastBuildDate", format_datetime(now))):
        ET.SubElement(channel, tag).text = value
    for chapter in items:
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = f"{chapter.title}｜{TITLE}"
        ET.SubElement(item, "link").text = chapter.link
        ET.SubElement(item, "guid", isPermaLink="true").text = chapter.link
        ET.SubElement(item, "pubDate").text = format_datetime(chapter.published)
        ET.SubElement(item, "description").text = f"{chapter.title} が公開されました。カドコミの公式サイトで読む。"
    ET.indent(rss, space="  ")
    output.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(rss).write(output, encoding="utf-8", xml_declaration=True, short_empty_elements=False)


def main() -> int:
    now = datetime.now(JST)
    known = existing_chapters(RSS_PATH)
    observed: dict[str, Chapter] = {}
    successes = 0
    for url in SOURCES:
        try:
            r = requests.get(url, timeout=25, headers={"User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9"})
            r.raise_for_status()
            latest = parse_html(r.text, now, url)
            print(f"Source {url}: {len(latest)} chapter(s) found")
            if latest:
                successes += 1
            for entry in latest:
                observed.setdefault(entry.link, entry)
        except requests.RequestException as exc:
            print(f"Source unavailable: {url} ({exc})", file=sys.stderr)
    if not successes:
        print("No episodes could be extracted: keep existing RSS untouched.", file=sys.stderr)
        return 1

    new = {url: entry for url, entry in observed.items() if url not in known}
    if not new and RSS_PATH.exists():
        print(f"No new chapters. Retaining {len(known)} existing item(s).")
        return 0
    merged = {**new, **known}
    entries = sorted(merged.values(), key=lambda x: (x.published, x.link), reverse=True)[:50]
    write_feed(entries, RSS_PATH, now)
    print(f"Wrote {RSS_PATH} with {len(entries)} chapter(s); {len(new)} newly discovered.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
