import { DEFAULT_PROMPT_TEMPLATE } from "./promptTemplateDefault.js";

(async function () {
  const compressWebsiteButton = document.getElementById('compressWebsiteButton');
  const exportPromptButton = document.getElementById('exportPromptButton');
  const statusDiv = document.getElementById('status');
  const openOptions = document.getElementById('openOptions');

  const TEMPLATE_KEY = "promptTemplate";

  function showStatus(message, type = 'success') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type} show`;
    setTimeout(() => statusDiv.classList.remove('show'), 3500);
  }

  function setButtonState(button, executing, originalText) {
    if (!button) return;
    if (executing) {
      button.classList.add('executing');
      button.textContent = '⏳ Executing...';
      button.disabled = true;
    } else {
      button.classList.remove('executing');
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  function sanitizeFilename(name) {
    return (name || "untitled")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  function fillTemplate(tpl, vars) {
    return tpl
      .replaceAll("{{URL}}", vars.url || "")
      .replaceAll("{{TITLE}}", vars.title || "")
      .replaceAll("{{TIME}}", vars.time || "")
      .replaceAll("{{SCREENSHOT_FILENAME}}", vars.screenshotFilename || "")
      .replaceAll("{{TRUNCATED_HTML}}", vars.truncatedHtml || "");
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found");
    return tab;
  }

  async function compressWebsite(tabId) {
    // Step 1: ping
    const ready = await pingContentScript(tabId);

    if (!ready) {
        throw new Error(
        "Content script not ready.\n\n" +
        "If you just reloaded the extension:\n" +
        "→ Please refresh this page (Cmd+R) and try again.\n\n" +
        "Also make sure:\n" +
        "- This is a normal http/https page\n" +
        "- Not a chrome:// or extension page"
        );
    }

    // Step 2: real action
    const res = await chrome.tabs.sendMessage(tabId, {
        action: "compressWebsite"
    });

    if (!res || !res.success) {
        throw new Error(res?.error || "Compression failed");
    }

    return res;
    }

  async function getPromptTemplate() {
  const { promptTemplate } = await chrome.storage.local.get([TEMPLATE_KEY]);
  if (promptTemplate && typeof promptTemplate === "string" && promptTemplate.trim()) {
    return promptTemplate;
  }
  return DEFAULT_PROMPT_TEMPLATE;
}

  async function downloadDataUrl(filename, dataUrl) {
    await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: false
    });
  }

  async function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url,
      filename,
      saveAs: false
    });
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function buildMd({ template, meta, truncatedHtml, screenshotFilename }) {
    // 可选：把 truncated HTML 放进 ```html ``` block，更利于 LLM 解析
    const truncatedWrapped = `\n\`\`\`html\n${truncatedHtml}\n\`\`\`\n`;

    const filled = fillTemplate(template, {
      url: meta.url,
      title: meta.title,
      time: meta.generatedAt || new Date().toISOString(),
      screenshotFilename,
      truncatedHtml: truncatedWrapped
    });

    // 再加一个结构化 header（对你后续 pipeline 很友好）
    const header = `# Dark Pattern Prompt Package

- URL: ${meta.url}
- Title: ${meta.title}
- Time: ${meta.generatedAt || new Date().toISOString()}
- Screenshot: ${screenshotFilename}

---

`;

    return header + filled + "\n";
  }

  async function executeCompressionOnly() {
    try {
      setButtonState(compressWebsiteButton, true, 'Start Compressing Website');

      const tab = await getActiveTab();
      const res = await compressWebsite(tab.id);

      showStatus(
        `✅ Compressed.\noptimizedLength=${res.meta?.stats?.optimizedLength ?? "?"}`,
        'success'
      );
    } catch (error) {
      console.error(error);
      showStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
      setButtonState(compressWebsiteButton, false, 'Start Compressing Website');
    }
  }

  async function captureFullPageScreenshot(tabId) {
    const res = await chrome.runtime.sendMessage({
        action: "captureFullPage",
        tabId,
        download: false
    });
    if (!res?.ok) throw new Error(res?.error || "Full page capture failed");
    return res.dataUrl; // data:image/png;base64,...
    }

  async function pingContentScript(tabId) {
    try {
        const res = await chrome.tabs.sendMessage(tabId, { action: "ping" });
        return !!res?.ok;
    } catch (e) {
        return false;
    }
  }

  async function executeCompressAndExport() {
  try {
    setButtonState(exportPromptButton, true, 'Compress & Export Prompt (.md + .png)');

    const tab = await getActiveTab();

    showStatus("1/3 Compressing HTML…", "success");
    const res = await compressWebsite(tab.id);

    const meta = res.meta || {
      url: tab.url || "",
      title: tab.title || "",
      generatedAt: new Date().toISOString()
    };

    const truncatedHtml = res.optimizedHtml;
    if (!truncatedHtml) throw new Error("No optimizedHtml returned from content script.");

    const domain = (() => {
      try { return new URL(meta.url).hostname; } catch { return "page"; }
    })();

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = sanitizeFilename(`darkpattern_${domain}_${stamp}`);
    const screenshotFilename = `${base}.png`;
    const mdFilename = `${base}.md`;

    showStatus("2/3 Capturing full-page screenshot…", "success");
    // ✅ 让 background 截图并下载，文件名与 md 对齐
    const shotRes = await chrome.runtime.sendMessage({
      action: "captureFullPage",
      tabId: tab.id,
      download: true,
      filename: screenshotFilename
    });
    if (!shotRes?.ok) throw new Error(shotRes?.error || "Full-page screenshot failed");

    showStatus("3/3 Building markdown & downloading…", "success");
    const template = await getPromptTemplate();
    const md = buildMd({ template, meta, truncatedHtml, screenshotFilename });

    await downloadText(mdFilename, md);

    showStatus(`✅ Done!\n${mdFilename}\n${screenshotFilename}`, "success");
  } catch (error) {
    console.error(error);
    showStatus(`❌ Error: ${error.message}`, 'error');
  } finally {
    setButtonState(exportPromptButton, false, 'Compress & Export Prompt (.md + .png)');
  }
}

  compressWebsiteButton?.addEventListener('click', executeCompressionOnly);
  exportPromptButton?.addEventListener('click', executeCompressAndExport);

  openOptions?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  showStatus('Ready ✅', 'success');
})();