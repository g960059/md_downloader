# カドコミ最新話RSS (KC_005844_S)

対象: 『怠惰な悪辱貴族に転生した俺、シナリオをぶっ壊したら規格外の魔力で最凶になった』。

## フィードURL

https://raw.githubusercontent.com/g960059/md_downloader/main/rss/comic-walker-KC_005844_S.xml

この URL を RSS リーダーに登録します。漫画の本文や画像は含めず、**新着エピソードのタイトル・公開日・公式へのリンク**のみ配信します。

## 更新の仕組み

GitHub Actions が UTC 00:17, 04:17, 08:17, 12:17, 16:17, 20:17 に
公式カドコミ作品ページおよび Web漫画アンテナを確認し、本編エピソードだけを追加します。

- エピソード URL を GUID にして重複を防ぎます。
- 既存の配信日を保持します。
- コミックス発売告知・記念イラスト等は除外します。
- 更新がなければ XML ファイルは変更しません。
- 公式ページが変更されて取得できない場合は、既存のフィードを保護し、GitHub Actions のログにエラーが記録されます。

## 運用確認

https://github.com/g960059/md_downloader/actions/workflows/update-comic-walker-rss.yml

登録後に Actions タブで最初の動作結果を確認してください。
GitHub の設定によっては Actions を有効化する操作が必要です。
