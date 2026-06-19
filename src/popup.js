(() => {
  const button = document.getElementById("download");
  const status = document.getElementById("status");
  const targetKind = document.getElementById("target-kind");
  const targetHost = document.getElementById("target-host");
  const targetTitle = document.getElementById("target-title");
  let selectedTab = null;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? "var(--danger)" : "";
  }

  function setTarget(tab) {
    selectedTab = tab;
    const details = supportedPageDetails(tab?.url);

    button.disabled = !tab?.id;
    targetKind.textContent = details?.label || "Not ready";
    targetKind.classList.toggle("is-muted", !details);
    targetHost.textContent = details?.host || "";
    targetTitle.textContent = tab?.title || (details ? "Untitled page" : "No supported page selected");
    setStatus(details ? "Ready to save this page." : "No supported page found.");
  }

  function parseTabIdFromUrl() {
    const value = new URLSearchParams(location.search).get("tabId");
    if (!value) return null;
    const tabId = Number(value);
    return Number.isInteger(tabId) ? tabId : null;
  }

  async function queryTabs(query) {
    return chrome.tabs.query(query);
  }

  async function findTargetTab() {
    const explicitTabId = parseTabIdFromUrl();
    if (explicitTabId !== null) {
      const tab = await chrome.tabs.get(explicitTabId);
      return isSupportedChatUrl(tab?.url) ? tab : null;
    }

    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (isSupportedChatUrl(activeTab?.url)) {
      return activeTab;
    }

    const [chatgptTabs, claudeTabs, noteTabs, noteSubdomainTabs] = await Promise.all([
      queryTabs({ url: "https://chatgpt.com/*" }),
      queryTabs({ url: "https://claude.ai/*" }),
      queryTabs({ url: "https://note.com/*" }),
      queryTabs({ url: "https://*.note.com/*" })
    ]);
    return chatgptTabs[0] ?? claudeTabs[0] ?? noteTabs[0] ?? noteSubdomainTabs[0] ?? null;
  }

  function isSupportedChatUrl(url) {
    return Boolean(supportedPageDetails(url));
  }

  function supportedPageDetails(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return null;
      if (parsed.hostname === "chatgpt.com") return { label: "ChatGPT", host: parsed.hostname };
      if (parsed.hostname === "claude.ai") return { label: "Claude", host: parsed.hostname };
      if (parsed.hostname === "note.com" || parsed.hostname.endsWith(".note.com")) {
        return { label: "note", host: parsed.hostname };
      }
      return null;
    } catch (_error) {
      return null;
    }
  }

  async function sendExportMessage(tabId) {
    return chrome.tabs.sendMessage(tabId, {
      type: "CHATGPT_MARKDOWN_DOWNLOAD"
    });
  }

  async function injectContentScripts(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/markdown.js", "src/content.js"]
    });
  }

  function shouldInjectAndRetry(errorOrResult) {
    const message =
      typeof errorOrResult === "string"
        ? errorOrResult
        : errorOrResult?.message || errorOrResult?.error || "";
    return /Receiving end does not exist|Could not establish connection|Markdown exporter is not available/i.test(
      message
    );
  }

  async function exportFromTab(tabId) {
    try {
      const result = await sendExportMessage(tabId);
      if (result?.ok) return result;
      if (!shouldInjectAndRetry(result)) {
        throw new Error(result?.error || "Could not export this page.");
      }
    } catch (error) {
      if (!shouldInjectAndRetry(error)) throw error;
    }

    await injectContentScripts(tabId);
    const retryResult = await sendExportMessage(tabId);
    if (!retryResult?.ok) {
      throw new Error(retryResult?.error || "Could not export this page.");
    }
    return retryResult;
  }

  async function refreshTarget() {
    try {
      setTarget(await findTargetTab());
    } catch (_error) {
      setTarget(null);
    }
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    setStatus("Preparing Markdown...");

    try {
      const tab = selectedTab?.id ? selectedTab : await findTargetTab();
      if (!tab?.id) {
        throw new Error("No ChatGPT, Claude, or note.com tab found.");
      }

      setTarget(tab);
      button.disabled = true;
      setStatus("Preparing Markdown...");
      const result = await exportFromTab(tab.id);

      setStatus(`Downloaded ${result.filename}`);
    } catch (error) {
      setStatus(error.message || "Download failed.", true);
    } finally {
      button.disabled = !selectedTab?.id || !isSupportedChatUrl(selectedTab.url);
    }
  });

  refreshTarget();
})();
