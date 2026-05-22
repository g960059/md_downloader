(() => {
  const BLOCK_TAGS = new Set([
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "DIV",
    "FIGURE",
    "FOOTER",
    "HEADER",
    "LI",
    "MAIN",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "TABLE",
    "UL"
  ]);

  const SKIP_SELECTORS = [
    "button",
    "script",
    "style",
    "svg",
    "textarea",
    "[aria-hidden='true']",
    "[data-testid*='copy']",
    "[data-testid*='feedback']",
    "[data-testid*='turn-action']",
    ".sr-only",
    ".katex-html"
  ];

  function normalizeText(text) {
    return text.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n");
  }

  function compactMarkdown(markdown) {
    return normalizeText(markdown)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function escapePipe(text) {
    return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
  }

  function sanitizeFilenamePart(value) {
    const cleaned = normalizeText(value)
      .replace(/[\\/:*?"<>|#%{}^~[\]`;\n\r\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return (cleaned || "chatgpt-conversation").slice(0, 80);
  }

  function timestampForFilename(date = new Date()) {
    const pad = (number) => String(number).padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "-",
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join("");
  }

  function cloneWithoutUi(node) {
    const clone = node.cloneNode(true);
    for (const selector of SKIP_SELECTORS) {
      clone.querySelectorAll(selector).forEach((element) => element.remove());
    }
    return clone;
  }

  function textContentMarkdown(node) {
    return compactMarkdown(cloneWithoutUi(node).textContent || "");
  }

  function getLanguage(element) {
    const code = element.matches("code") ? element : element.querySelector("code");
    const className = code?.className || element.className || "";
    const match = String(className).match(/(?:language|lang)-([a-z0-9_+-]+)/i);
    return match?.[1] || element.getAttribute("data-language") || "";
  }

  function fenceFor(code) {
    const longestTicks = Math.max(0, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length));
    return "`".repeat(Math.max(3, longestTicks + 1));
  }

  function renderChildren(element, context) {
    return Array.from(element.childNodes)
      .map((child) => renderNode(child, context))
      .join("");
  }

  function renderList(element, context) {
    const ordered = element.tagName === "OL";
    const items = Array.from(element.children).filter((child) => child.tagName === "LI");
    const start = Number(element.getAttribute("start") || "1");
    return items
      .map((item, index) => {
        const marker = ordered ? `${start + index}. ` : "- ";
        const itemText = renderChildren(item, { ...context, listDepth: context.listDepth + 1 }).trim();
        const indent = "  ".repeat(context.listDepth);
        const nested = itemText.replace(/\n/g, `\n${indent}  `);
        return `${indent}${marker}${nested}`;
      })
      .join("\n");
  }

  function renderTable(element, context) {
    const rows = Array.from(element.querySelectorAll("tr")).map((row) =>
      Array.from(row.children)
        .filter((cell) => cell.matches("th,td"))
        .map((cell) => escapePipe(renderChildren(cell, context)))
    );

    if (!rows.length) return "";

    const width = Math.max(...rows.map((row) => row.length));
    const normalized = rows.map((row) => {
      const next = [...row];
      while (next.length < width) next.push("");
      return next;
    });
    const separator = Array.from({ length: width }, () => "---");
    const [head, ...body] = normalized;
    return [head, separator, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
  }

  function renderPre(element) {
    const codeElement = element.querySelector("code") || element;
    const code = (codeElement.textContent || "").replace(/\n+$/g, "");
    const fence = fenceFor(code);
    const language = getLanguage(codeElement || element);
    return `\n\n${fence}${language}\n${code}\n${fence}\n\n`;
  }

  function renderKatex(element) {
    const annotation = element.querySelector("annotation[encoding='application/x-tex']");
    const tex = annotation?.textContent?.trim();
    if (!tex) return "";
    const display = element.classList.contains("katex-display") || element.closest(".katex-display");
    return display ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
  }

  function renderElement(element, context) {
    if (element.matches(SKIP_SELECTORS.join(","))) return "";
    if (element.matches(".katex, .katex-display")) return renderKatex(element);

    const tag = element.tagName;
    switch (tag) {
      case "BR":
        return "\n";
      case "HR":
        return "\n\n---\n\n";
      case "PRE":
        return renderPre(element);
      case "CODE":
        if (element.closest("pre")) return element.textContent || "";
        return `\`${normalizeText(element.textContent || "").replace(/`/g, "\\`")}\``;
      case "A": {
        const text = compactMarkdown(renderChildren(element, context));
        const href = element.getAttribute("href");
        return href && text ? `[${text}](${href})` : text;
      }
      case "STRONG":
      case "B":
        return `**${compactMarkdown(renderChildren(element, context))}**`;
      case "EM":
      case "I":
        return `*${compactMarkdown(renderChildren(element, context))}*`;
      case "DEL":
      case "S":
        return `~~${compactMarkdown(renderChildren(element, context))}~~`;
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6": {
        const level = Number(tag.slice(1));
        return `\n\n${"#".repeat(level)} ${compactMarkdown(renderChildren(element, context))}\n\n`;
      }
      case "P":
        return `\n\n${compactMarkdown(renderChildren(element, context))}\n\n`;
      case "BLOCKQUOTE":
        return `\n\n${compactMarkdown(renderChildren(element, context))
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}\n\n`;
      case "UL":
      case "OL":
        return `\n\n${renderList(element, context)}\n\n`;
      case "TABLE":
        return `\n\n${renderTable(element, context)}\n\n`;
      default: {
        const rendered = renderChildren(element, context);
        return BLOCK_TAGS.has(tag) ? `\n${rendered}\n` : rendered;
      }
    }
  }

  function renderNode(node, context = { listDepth: 0 }) {
    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeText(node.nodeValue || "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }
    return renderElement(node, context);
  }

  function htmlToMarkdown(node) {
    return compactMarkdown(renderNode(cloneWithoutUi(node)));
  }

  function getConversationTitle(doc) {
    const activeSidebarTitle = doc.querySelector("a[data-active] span[dir='auto']")?.textContent;
    const heading = doc.querySelector("main h1, [data-testid='conversation-title']")?.textContent;
    const title = activeSidebarTitle || heading || doc.title || "ChatGPT conversation";
    return normalizeText(title).trim() || "ChatGPT conversation";
  }

  function titleFromTurns(doc, turns) {
    const existingTitle = getConversationTitle(doc);
    if (
      existingTitle &&
      !/^chatgpt(?: conversation)?$/i.test(existingTitle) &&
      !/ready when you are/i.test(existingTitle)
    ) {
      return existingTitle;
    }

    const firstUser = turns.find((turn) => turn.role === "user")?.markdown || "";
    const derived = compactMarkdown(firstUser)
      .replace(/[#*_`~>\[\]().!?,:;'"、。！？「」『』（）【】]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 36);
    return derived ? `Temporary Chat - ${derived}` : "Temporary Chat";
  }

  function conversationIdFromUrl(url) {
    const match = new URL(url).pathname.match(/^\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    return match?.[1] || "";
  }

  function contentNodeFromMessageNode(messageNode, role) {
    if (role === "assistant") {
      return messageNode.querySelector(".markdown") || messageNode;
    }
    return messageNode.querySelector(".whitespace-pre-wrap") || messageNode;
  }

  function turnElementToTurn(turnElement) {
    const role = turnElement.getAttribute("data-turn");
    if (role !== "user" && role !== "assistant") return null;

    const contentNode =
      role === "assistant"
        ? turnElement.querySelector(".markdown") || turnElement
        : turnElement.querySelector(".whitespace-pre-wrap") || turnElement;
    const markdown = role === "assistant" ? htmlToMarkdown(contentNode) : textContentMarkdown(contentNode);
    return markdown ? { role, markdown } : null;
  }

  function extractTurns(doc) {
    const messageTurns = Array.from(doc.querySelectorAll("[data-message-author-role]"))
      .map((messageNode) => {
        const role = messageNode.getAttribute("data-message-author-role");
        if (role !== "user" && role !== "assistant") return null;

        const contentNode = contentNodeFromMessageNode(messageNode, role);
        if (!contentNode) return null;

        const markdown = role === "assistant" ? htmlToMarkdown(contentNode) : textContentMarkdown(contentNode);
        return markdown ? { role, markdown } : null;
      })
      .filter(Boolean);

    if (messageTurns.length) return messageTurns;

    return Array.from(doc.querySelectorAll("[data-testid^='conversation-turn-'], [data-turn]"))
      .map(turnElementToTurn)
      .filter(Boolean);
  }

  function plainTextFromParts(parts) {
    if (!Array.isArray(parts)) return "";
    return parts
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return String(part ?? "");
        if (part.text) return part.text;
        if (part.content_type === "image_asset_pointer") {
          const label = part.alt_text || part.asset_pointer || part.file_id || "image";
          return `[Image: ${label}]`;
        }
        return `\n\n\`\`\`json\n${JSON.stringify(part, null, 2)}\n\`\`\`\n\n`;
      })
      .join("\n");
  }

  function contentToMarkdown(content) {
    if (!content || typeof content !== "object") return "";

    switch (content.content_type) {
      case "text":
      case "multimodal_text":
        return compactMarkdown(plainTextFromParts(content.parts));
      case "code": {
        const text = content.text || plainTextFromParts(content.parts);
        const language = content.language || "";
        const fence = fenceFor(text);
        return `${fence}${language}\n${text.replace(/\n+$/g, "")}\n${fence}`;
      }
      case "execution_output":
        return compactMarkdown(content.text || content.result || plainTextFromParts(content.parts));
      default:
        if (Array.isArray(content.parts)) {
          return compactMarkdown(plainTextFromParts(content.parts));
        }
        if (typeof content.text === "string") return compactMarkdown(content.text);
        return `\`\`\`json\n${JSON.stringify(content, null, 2)}\n\`\`\``;
    }
  }

  function attachmentMarkdown(message) {
    const attachments = message?.metadata?.attachments;
    if (!Array.isArray(attachments) || !attachments.length) return "";
    const lines = attachments.map((attachment) => {
      const name = attachment.name || attachment.file_name || attachment.id || "attachment";
      const mime = attachment.mime_type || attachment.content_type || "unknown type";
      return `- ${name} (${mime})`;
    });
    return `\n\nAttachments:\n${lines.join("\n")}`;
  }

  function pathFromConversationPayload(payload) {
    const mapping = payload?.mapping;
    if (!mapping || typeof mapping !== "object") return [];

    if (payload.current_node && mapping[payload.current_node]) {
      const path = [];
      const seen = new Set();
      let nodeId = payload.current_node;
      while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
        seen.add(nodeId);
        path.push(mapping[nodeId]);
        nodeId = mapping[nodeId].parent;
      }
      return path.reverse();
    }

    return Object.values(mapping)
      .filter((node) => node?.message)
      .sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0));
  }

  function extractTurnsFromConversationPayload(payload) {
    return pathFromConversationPayload(payload)
      .map((node) => {
        const message = node.message;
        const role = message?.author?.role;
        if (role !== "user" && role !== "assistant") return null;
        const markdown = compactMarkdown(`${contentToMarkdown(message.content)}${attachmentMarkdown(message)}`);
        if (!markdown) return null;
        return {
          role,
          markdown,
          messageId: message.id || node.id,
          createdAt: message.create_time ? new Date(message.create_time * 1000).toISOString() : ""
        };
      })
      .filter(Boolean);
  }

  async function fetchConversationPayload(doc) {
    const conversationId = conversationIdFromUrl(doc.location.href);
    if (!conversationId) return null;

    const endpoint = new URL(`/backend-api/conversation/${conversationId}`, doc.location.origin);
    const response = await fetch(endpoint.href, {
      credentials: "include",
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Conversation API returned HTTP ${response.status}.`);
    }

    return response.json();
  }

  function buildMarkdown({ title, url, turns }) {
    const lines = [
      `# ${title}`,
      "",
      `Source: ${url}`,
      `Exported: ${new Date().toISOString()}`,
      ""
    ];

    for (const turn of turns) {
      lines.push(`## ${turn.role === "assistant" ? "Assistant" : "User"}`);
      if (turn.createdAt || turn.messageId) {
        lines.push("");
        lines.push(`<!-- message_id: ${turn.messageId || "unknown"}${turn.createdAt ? `; created_at: ${turn.createdAt}` : ""} -->`);
      }
      lines.push("");
      lines.push(turn.markdown);
      lines.push("");
    }

    return `${compactMarkdown(lines.join("\n"))}\n`;
  }

  function resultFromTurns(doc, title, turns) {
    const markdown = buildMarkdown({
      title,
      url: doc.location.href,
      turns
    });
    const filename = `${sanitizeFilenamePart(title)}-${timestampForFilename()}.md`;

    return { filename, markdown, title, turns };
  }

  function exportConversation(doc = document) {
    if (doc.location?.hostname !== "chatgpt.com") {
      throw new Error("This extension only exports ChatGPT pages.");
    }

    const turns = extractTurns(doc);
    if (!turns.length) {
      throw new Error("No ChatGPT conversation turns were found on this page.");
    }

    return resultFromTurns(doc, titleFromTurns(doc, turns), turns);
  }

  async function exportConversationAccurate(doc = document) {
    if (doc.location?.hostname !== "chatgpt.com") {
      throw new Error("This extension only exports ChatGPT pages.");
    }

    try {
      const payload = await fetchConversationPayload(doc);
      if (payload) {
        const turns = extractTurnsFromConversationPayload(payload);
        if (turns.length) {
          return resultFromTurns(doc, payload.title || getConversationTitle(doc), turns);
        }
      }
    } catch (_error) {
      // Fall back to DOM extraction for shared, unauthenticated, or API-blocked pages.
    }

    return exportConversation(doc);
  }

  window.ChatGPTMarkdownExporter = {
    exportConversation,
    exportConversationAccurate,
    htmlToMarkdown,
    extractTurns,
    extractTurnsFromConversationPayload,
    sanitizeFilenamePart
  };
})();
