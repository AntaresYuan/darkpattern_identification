// Background script for handling WebSocket communication with Python script
console.log('Background script loaded');

// Store injection code received from Python
let injectionCode = null;
let websocket = null;
const CDP_VERSION = "1.3";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cdpSend(tabId, method, params = {}) {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

if (!chrome.debugger) {
  throw new Error("chrome.debugger is unavailable in service worker. Re-load the extension after adding 'debugger' permission.");
}
async function withDebugger(tabId, fn) {
  await chrome.debugger.attach({ tabId }, CDP_VERSION);
  try {
    return await fn();
  } finally {
    await sleep(50);
    try { await chrome.debugger.detach({ tabId }); } catch (_) {}
  }
}

async function evalInPage(tabId, expression) {
  const { result } = await cdpSend(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  return result?.value;
}

async function getViewportSize(tabId) {
  return await evalInPage(
    tabId,
    `(() => ({
      width: Math.max(window.innerWidth, document.documentElement.clientWidth),
      height: Math.max(window.innerHeight, document.documentElement.clientHeight)
    }))()`
  );
}

async function getVisibleBottomY(tabId) {
  return await evalInPage(
    tabId,
    `(() => {
      const els = Array.from(document.querySelectorAll("body *"));
      let max = 0;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) max = Math.max(max, r.bottom);
      }
      return Math.ceil(max + window.scrollY + 16); // 多给点 buffer
    })()`
  );
}

// 关键：滚动触发懒加载，直到高度不再增长（或达到上限）
async function preScrollToLoad(tabId, maxRounds = 12) {
  let last = 0;
  for (let i = 0; i < maxRounds; i++) {
    await evalInPage(
      tabId,
      `window.scrollTo(0, document.body.scrollHeight); document.body.scrollHeight;`
    );
    await sleep(450); // 等懒加载
    const h = await evalInPage(tabId, `document.body.scrollHeight`);
    if (h && Math.abs(h - last) < 40) break; // 高度稳定
    last = h || last;
  }
  // 回到顶部（你要分析主页就保持 top 视角）
  await evalInPage(tabId, `window.scrollTo(0, 0); true;`);
  await sleep(250);
}

async function captureFullPagePngDataUrl(tabId) {
  return withDebugger(tabId, async () => {
    // 1) 先滚到底，触发懒加载（防止 visibleBottom 算小）
    await preScrollToLoad(tabId, 12);

    // 2) 取“真实视觉宽度”
    const viewport = await getViewportSize(tabId);

    // 3) 取“可见内容真实底部”
    const visibleHeight = await getVisibleBottomY(tabId);

    const tab = await chrome.tabs.get(tabId);
    const originalWidth = tab.width || viewport.width || 1280;
    const originalHeight = tab.height || viewport.height || 720;

    // 4) 设置 viewport（高度至少要能容纳截屏，但也做上限）
    const targetHeight = Math.min(Math.max(originalHeight, visibleHeight), 45000);

    await cdpSend(tabId, "Emulation.setDeviceMetricsOverride", {
      mobile: false,
      width: viewport.width,
      height: targetHeight,
      deviceScaleFactor: 1,
      screenOrientation: { angle: 0, type: "portraitPrimary" },
    });

    await sleep(250);

    // 5) 用 clip 裁剪到 visibleHeight，避免白边也避免截断
    const { data } = await cdpSend(tabId, "Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      clip: {
        x: 0,
        y: 0,
        width: viewport.width,
        height: Math.min(visibleHeight, 45000),
        scale: 1,
      },
    });

    // restore
    await cdpSend(tabId, "Emulation.setDeviceMetricsOverride", {
      mobile: false,
      width: originalWidth,
      height: originalHeight,
      deviceScaleFactor: 1,
      screenOrientation: { angle: 0, type: "portraitPrimary" },
    });

    return `data:image/png;base64,${data}`;
  });
}
// WebSocket connection to Python
function connectToWebSocket() {
  try {
    websocket = new WebSocket('ws://localhost:8765');

    websocket.onopen = function (event) {
      console.log('🌐 Connected to Python WebSocket server');
    };

    websocket.onmessage = function (event) {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 Received message from Python:', message);

        if (message.action === 'setInjectionCode') {
          injectionCode = message.injectionCode;
          console.log('Injection code updated:', injectionCode);

          // Notify all content scripts about the new injection code
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, {
                action: 'injectionCodeUpdated',
                injectionCode: injectionCode
              }).catch(() => {
                // Ignore errors for tabs without content scripts
              });
            });
          });
        }
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
      }
    };

    websocket.onclose = function (event) {
      console.log('🔌 WebSocket connection closed, attempting to reconnect...');
      // Attempt to reconnect after 2 seconds
      setTimeout(connectToWebSocket, 2000);
    };

    websocket.onerror = function (error) {
      console.log('❌ WebSocket error:', error);
    };
  } catch (error) {
    console.log('❌ Failed to connect to WebSocket, retrying...');
    setTimeout(connectToWebSocket, 2000);
  }
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  if (request.action === "captureFullPage") {
    (async () => {
        const tabId = request.tabId ?? sender?.tab?.id;
        if (!tabId) throw new Error("No tabId");

        const dataUrl = await captureFullPagePngDataUrl(tabId);

        if (request.download) {
        const filename = request.filename || `fullpage_${Date.now()}.png`;
        await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
        sendResponse({ ok: true, filename });
        } else {
        sendResponse({ ok: true, dataUrl });
        }
    })().catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));

    return true;
}
  if (request.action === 'getInjectionCode') {
    // Content script is asking for injection code
    sendResponse({
      success: true,
      injectionCode: injectionCode
    });
    return true;
  }

  if (request.action === 'setInjectionCode') {
    // Legacy support for direct message setting
    injectionCode = request.injectionCode;
    console.log('Injection code updated:', injectionCode);

    // Notify all content scripts about the new injection code
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'injectionCodeUpdated',
          injectionCode: injectionCode
        }).catch(() => {
          // Ignore errors for tabs without content scripts
        });
      });
    });

    sendResponse({ success: true });
    return true;
  }
});

const ENABLE_WS = false;
function maybeConnectWS() {
  if (ENABLE_WS) connectToWebSocket();
}
// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
  connectToWebSocket();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  connectToWebSocket();
});