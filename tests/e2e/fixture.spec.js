import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchExtensionContext, openPopup, repoRoot, saveDownload } from "./helpers.js";

test("downloads Markdown from a sanitized ChatGPT conversation fixture via popup", async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath("chrome-profile");
  const { context, extensionId } = await launchExtensionContext(userDataDir);

  try {
    const fixturePath = path.join(repoRoot, "tests/fixtures/chatgpt-sanitized.html");
    await context.route("https://chatgpt.com/c/fixture", async (route) => {
      await route.fulfill({
        path: fixturePath,
        contentType: "text/html; charset=utf-8"
      });
    });

    const page = await context.newPage();
    await page.goto("https://chatgpt.com/c/fixture");
    await expect(page.locator("section[data-testid^='conversation-turn-']")).toHaveCount(2);

    const popup = await openPopup(context, extensionId);
    const downloadPromise = page.waitForEvent("download");
    await popup.getByRole("button", { name: "Download Markdown" }).click();
    const download = await downloadPromise;
    const { filename, text } = await saveDownload(download, testInfo);

    expect(filename).toMatch(/^古典力学と作用-\d{8}-\d{6}\.md$/);
    expect(text).toContain("# 古典力学と作用");
    expect(text).toContain("Source: https://chatgpt.com/c/fixture");
    expect(text).toContain("## User");
    expect(text).toContain("なぜ「作用」を最小にする");
    expect(text).toContain("## Assistant");
    expect(text).toContain("### 基本式");
    expect(text).toContain("$S = \\int L(q,\\dot q,t)\\,dt$");
    expect(text).toContain("```js");
    expect(text).toContain("const action = integrate(lagrangian);");
    expect(text).toContain("| 記号 | 意味 |");
    expect(text).toContain("[参考](https://example.com/lagrangian)");
    expect(text).toContain("同じターン内の追加回答も保存します。");
    expect((text.match(/## Assistant/g) || []).length).toBe(2);
    expect(text).not.toContain("チャットを検索");
    expect(text).not.toContain("新しいチャット");
    expect(text).not.toContain("コピーする");
    await expect(popup.getByRole("status")).toContainText("Downloaded");
  } finally {
    await context.close();
  }
});

test("prefers the conversation API payload so non-rendered history is not lost", async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath("api-chrome-profile");
  const { context, extensionId } = await launchExtensionContext(userDataDir);
  const conversationId = "11111111-1111-4111-8111-111111111111";

  try {
    const fixturePath = path.join(repoRoot, "tests/fixtures/chatgpt-sanitized.html");
    await context.route(`https://chatgpt.com/c/${conversationId}`, async (route) => {
      await route.fulfill({
        path: fixturePath,
        contentType: "text/html; charset=utf-8"
      });
    });
    await context.route(`https://chatgpt.com/backend-api/conversation/${conversationId}`, async (route) => {
      await route.fulfill({
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          title: "API 完全履歴",
          current_node: "u2",
          mapping: {
            root: { id: "root", parent: null, children: ["u1"] },
            u1: {
              id: "u1",
              parent: "root",
              children: ["a1"],
              message: {
                id: "msg-user-1",
                create_time: 1779400000,
                author: { role: "user" },
                content: {
                  content_type: "text",
                  parts: ["DOMには表示されていない最初の質問です。"]
                }
              }
            },
            a1: {
              id: "a1",
              parent: "u1",
              children: ["u2"],
              message: {
                id: "msg-assistant-1",
                create_time: 1779400010,
                author: { role: "assistant" },
                content: {
                  content_type: "text",
                  parts: ["APIだけにある回答です。\n\n```python\nprint('api history')\n```"]
                }
              }
            },
            u2: {
              id: "u2",
              parent: "a1",
              children: [],
              message: {
                id: "msg-user-2",
                create_time: 1779400020,
                author: { role: "user" },
                metadata: {
                  attachments: [{ name: "notes.pdf", mime_type: "application/pdf" }]
                },
                content: {
                  content_type: "multimodal_text",
                  parts: [
                    "添付画像も含む質問です。",
                    {
                      content_type: "image_asset_pointer",
                      asset_pointer: "file-service://api-image",
                      alt_text: "作用の図"
                    }
                  ]
                }
              }
            }
          }
        })
      });
    });

    const page = await context.newPage();
    await page.goto(`https://chatgpt.com/c/${conversationId}`);

    const popup = await openPopup(context, extensionId);
    const downloadPromise = page.waitForEvent("download");
    await popup.getByRole("button", { name: "Download Markdown" }).click();
    const download = await downloadPromise;
    const { text } = await saveDownload(download, testInfo);

    expect(text).toContain("# API 完全履歴");
    expect(text).toContain("DOMには表示されていない最初の質問です。");
    expect(text).toContain("APIだけにある回答です。");
    expect(text).toContain("```python\nprint('api history')\n```");
    expect(text).toContain("[Image: 作用の図]");
    expect(text).toContain("Attachments:");
    expect(text).toContain("- notes.pdf (application/pdf)");
    expect(text).toContain("<!-- message_id: msg-user-1; created_at:");
    expect(text).not.toContain("なぜ「作用」を最小にする");
  } finally {
    await context.close();
  }
});

test("downloads a temporary chat without a conversation id using DOM fallback", async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath("temporary-chrome-profile");
  const { context, extensionId } = await launchExtensionContext(userDataDir);

  try {
    const fixturePath = path.join(repoRoot, "tests/fixtures/chatgpt-temporary.html");
    await context.route("https://chatgpt.com/?temporary-chat=true", async (route) => {
      await route.fulfill({
        path: fixturePath,
        contentType: "text/html; charset=utf-8"
      });
    });

    const page = await context.newPage();
    await page.goto("https://chatgpt.com/?temporary-chat=true");
    await expect(page.locator("[data-testid^='conversation-turn-']")).toHaveCount(2);

    const popup = await openPopup(context, extensionId);
    const downloadPromise = page.waitForEvent("download");
    await popup.getByRole("button", { name: "Download Markdown" }).click();
    const download = await downloadPromise;
    const { filename, text } = await saveDownload(download, testInfo);

    expect(filename).toMatch(/^Temporary Chat - temporary chatでも この内容をMarkdownとして欠落な-\d{8}-\d{6}\.md$/);
    expect(text).toContain("# Temporary Chat - temporary chatでも この内容をMarkdownとして欠落な");
    expect(text).toContain("Source: https://chatgpt.com/?temporary-chat=true");
    expect(text).toContain("temporary chatでも、この内容をMarkdownとして欠落なく保存したいです。");
    expect(text).toContain("Temporary chat は保存済み会話IDがないため");
    expect(text).toContain("1. ユーザー発話を保存します。");
    expect(text).toContain("2. アシスタント発話も保存します。");
  } finally {
    await context.close();
  }
});

test("injects scripts on demand when an existing ChatGPT tab has no exporter", async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath("inject-chrome-profile");
  const { context, extensionId } = await launchExtensionContext(userDataDir);

  try {
    const fixturePath = path.join(repoRoot, "tests/fixtures/chatgpt-sanitized.html");
    await context.route("https://chatgpt.com/c/existing-tab", async (route) => {
      await route.fulfill({
        path: fixturePath,
        contentType: "text/html; charset=utf-8"
      });
    });

    const page = await context.newPage();
    await page.goto("https://chatgpt.com/c/existing-tab");
    await page.evaluate(() => {
      delete window.ChatGPTMarkdownExporter;
    });

    const popup = await openPopup(context, extensionId);
    const downloadPromise = page.waitForEvent("download");
    await popup.getByRole("button", { name: "Download Markdown" }).click();
    const download = await downloadPromise;
    const { text } = await saveDownload(download, testInfo);

    expect(text).toContain("# 古典力学と作用");
    expect(text).toContain("同じターン内の追加回答も保存します。");
    await expect(popup.getByRole("status")).toContainText("Downloaded");
  } finally {
    await context.close();
  }
});

test("downloads Markdown from a sanitized Claude conversation fixture via popup", async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath("claude-chrome-profile");
  const { context, extensionId } = await launchExtensionContext(userDataDir);

  try {
    const fixturePath = path.join(repoRoot, "tests/fixtures/claude-sanitized.html");
    await context.route("https://claude.ai/chat/fixture", async (route) => {
      await route.fulfill({
        path: fixturePath,
        contentType: "text/html; charset=utf-8"
      });
    });

    const page = await context.newPage();
    await page.goto("https://claude.ai/chat/fixture");
    await expect(page.locator('[data-testid="user-message"]')).toHaveCount(1);
    await expect(page.locator(".font-claude-response")).toHaveCount(1);

    const popup = await openPopup(context, extensionId);
    const downloadPromise = page.waitForEvent("download");
    await popup.getByRole("button", { name: "Download Markdown" }).click();
    const download = await downloadPromise;
    const { filename, text } = await saveDownload(download, testInfo);

    expect(filename).toMatch(/^Claudeモデル改善相談-\d{8}-\d{6}\.md$/);
    expect(text).toContain("# Claudeモデル改善相談");
    expect(text).toContain("Source: https://claude.ai/chat/fixture");
    expect(text).toContain("## User");
    expect(text).toContain("Attachments:");
    expect(text).toContain("Pasted Text, pasted, 182行");
    expect(text).toContain("[https://github.com/g960059/0DSimDemo](https://github.com/g960059/0DSimDemo)");
    expect(text).toContain("## Assistant");
    expect(text).toContain("GitHubのレポを実際に確認しながら");
    expect(text).toContain("### 1. 根本原因");
    expect(text).toContain("**period-2** を検出します。");
    expect(text).toContain("```ts");
    expect(text).toContain("const Kd = Kd0 * Math.exp(-ldaArg);");
    expect(text).not.toContain("コピー");
    await expect(popup.getByRole("status")).toContainText("Downloaded");
  } finally {
    await context.close();
  }
});
