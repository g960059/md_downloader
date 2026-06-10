# Chat Markdown Downloader

Chrome extension that downloads the currently open ChatGPT or Claude conversation as a Markdown file.

For authenticated ChatGPT conversation URLs, the extension first exports from ChatGPT's conversation JSON payload so long conversations and non-rendered turns are not lost. If that API is unavailable, including temporary chats without a saved conversation ID, it falls back to the visible DOM.

## Install locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose "Load unpacked".
4. Select this repository directory.
5. Open a ChatGPT conversation and click the extension icon.

## Development

```sh
npm install
npx playwright install chromium
npm run check
npm test
```

Run the live ChatGPT E2E test with a dedicated browser profile:

```sh
npm run test:live
```

The live test uses `.e2e/chatgpt-profile`. If ChatGPT asks you to log in, complete login in the opened browser window and rerun the command.
