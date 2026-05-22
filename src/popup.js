(() => {
  const button = document.getElementById("download");
  const status = document.getElementById("status");

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? "#b91c1c" : "";
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
      return tab;
    }

    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (activeTab?.url?.startsWith("https://chatgpt.com/")) {
      return activeTab;
    }

    const chatgptTabs = await queryTabs({ url: "https://chatgpt.com/*" });
    return chatgptTabs[0] ?? null;
  }

  async function sendExportMessage(tabId) {
    return chrome.tabs.sendMessage(tabId, {
      type: "CHATGPT_MARKDOWN_DOWNLOAD"
    });
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    setStatus("Preparing Markdown...");

    try {
      const tab = await findTargetTab();
      if (!tab?.id) {
        throw new Error("No ChatGPT conversation tab found.");
      }

      const result = await sendExportMessage(tab.id);
      if (!result?.ok) {
        throw new Error(result?.error || "Could not export this conversation.");
      }

      setStatus(`Downloaded ${result.filename}`);
    } catch (error) {
      setStatus(error.message || "Download failed.", true);
    } finally {
      button.disabled = false;
    }
  });
})();
