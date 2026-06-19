import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchExtensionContext, openPopup, repoRoot, saveDownload } from "./helpers.js";

const liveUrl =
  process.env.CHATGPT_LIVE_URL || "https://chatgpt.com/c/6a0f85a1-e074-8320-9781-6ee2a50ee934";
const expectedText = process.env.CHATGPT_LIVE_EXPECTED_TEXT || "古典力学と作用";

test.skip(process.env.CHATGPT_LIVE_E2E !== "1", "Set CHATGPT_LIVE_E2E=1 to run the live ChatGPT E2E test.");

test("downloads Markdown from the live ChatGPT conversation page via popup", async ({}, testInfo) => {
  const userDataDir =
    process.env.CHATGPT_USER_DATA_DIR || path.join(repoRoot, ".e2e/chatgpt-profile");
  const { context, extensionId } = await launchExtensionContext(userDataDir);

  try {
    const page = await context.newPage();
    await page.goto(liveUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });

    const loginRequired = page
      .getByText(/Log in to get answers based on saved chats|ログインすると保存済みチャット|Ready when you are\./i)
      .first();
    const loginButton = page.getByRole("button", { name: /ログイン|Log in|Login/i }).first();
    if (
      (await loginRequired.isVisible({ timeout: 5_000 }).catch(() => false)) ||
      (await loginButton.isVisible({ timeout: 1_000 }).catch(() => false))
    ) {
      throw new Error(
        "Live ChatGPT page requires login in .e2e/chatgpt-profile. Run npm run test:live, complete login in the opened browser window, then rerun it."
      );
    }

    const firstTurn = page.locator("section[data-testid^='conversation-turn-']").first();
    try {
      await expect(firstTurn).toBeVisible({ timeout: 90_000 });
    } catch (error) {
      const visibleText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
      throw new Error(
        [
          "Live ChatGPT conversation was not accessible in the dedicated profile.",
          `Current URL: ${page.url()}`,
          `Visible text: ${visibleText.slice(0, 240).replace(/\s+/g, " ")}`,
          "Log in to .e2e/chatgpt-profile or set CHATGPT_USER_DATA_DIR to an authenticated profile, then rerun npm run test:live."
        ].join("\n"),
        { cause: error }
      );
    }

    const popup = await openPopup(context, extensionId);
    const downloadPromise = page.waitForEvent("download");
    await popup.getByRole("button", { name: "Markdownを保存" }).click();
    const download = await downloadPromise;
    const { text } = await saveDownload(download, testInfo);

    expect(text).toContain(expectedText);
    expect(text).toContain("Source: https://chatgpt.com/c/6a0f85a1-e074-8320-9781-6ee2a50ee934");
    expect(text).toContain("## User");
    expect(text).toContain("## Assistant");
    expect(text.length).toBeGreaterThan(300);
  } finally {
    await context.close();
  }
});
