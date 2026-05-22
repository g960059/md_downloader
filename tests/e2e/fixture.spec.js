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
    expect(text).not.toContain("チャットを検索");
    expect(text).not.toContain("新しいチャット");
    expect(text).not.toContain("コピーする");
    await expect(popup.getByRole("status")).toContainText("Downloaded");
  } finally {
    await context.close();
  }
});
