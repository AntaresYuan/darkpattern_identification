import { DEFAULT_PROMPT_TEMPLATE } from "./promptTemplateDefault.js";

const KEY = "promptTemplate";

async function loadTemplate() {
  const { promptTemplate } = await chrome.storage.local.get([KEY]);
  return promptTemplate || DEFAULT_PROMPT_TEMPLATE;
}

async function saveTemplate(text) {
  await chrome.storage.local.set({ [KEY]: text });
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

document.addEventListener("DOMContentLoaded", async () => {
  const textarea = document.getElementById("tpl");
  textarea.value = await loadTemplate();

  document.getElementById("save").addEventListener("click", async () => {
    await saveTemplate(textarea.value);
    setStatus("Saved ✅");
  });

  document.getElementById("reset").addEventListener("click", async () => {
    textarea.value = DEFAULT_PROMPT_TEMPLATE;
    await saveTemplate(DEFAULT_PROMPT_TEMPLATE);
    setStatus("Reset to default ✅");
  });
});