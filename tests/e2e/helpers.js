import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "../..");
export const chromeExecutablePath = process.env.CHROME_EXECUTABLE_PATH || "";

export function ensureChromeExists() {
  if (chromeExecutablePath && !fs.existsSync(chromeExecutablePath)) {
    throw new Error(`Google Chrome was not found at ${chromeExecutablePath}`);
  }
}

export async function launchExtensionContext(userDataDir) {
  ensureChromeExists();
  const extensionPath = repoRoot;
  const executableOptions = chromeExecutablePath ? { executablePath: chromeExecutablePath } : {};
  const context = await chromium.launchPersistentContext(userDataDir, {
    ...executableOptions,
    ignoreDefaultArgs: ["--disable-extensions"],
    headless: false,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--no-default-browser-check"
    ]
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;
  return { context, extensionId };
}

export async function openPopup(context, extensionId) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
  return popup;
}

export async function saveDownload(download, testInfo) {
  const filename = download.suggestedFilename();
  const outputPath = testInfo.outputPath(filename);
  await download.saveAs(outputPath);
  return { filename, outputPath, text: fs.readFileSync(outputPath, "utf8") };
}
