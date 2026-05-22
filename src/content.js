(() => {
  const MESSAGE_TYPE = "CHATGPT_MARKDOWN_DOWNLOAD";

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.documentElement.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MESSAGE_TYPE) return false;

    try {
      const exporter = window.ChatGPTMarkdownExporter;
      if (!exporter) {
        throw new Error("Markdown exporter is not available.");
      }

      const result = exporter.exportConversation(document);
      downloadTextFile(result.filename, result.markdown);
      sendResponse({ ok: true, filename: result.filename });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error?.message || "Unable to export this page."
      });
    }

    return true;
  });
})();
