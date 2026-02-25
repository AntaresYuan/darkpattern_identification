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

async function getVisibleBottomY(tabId) {
  const { result } = await cdpSend(tabId, "Runtime.evaluate", {
    expression: `
      (() => {
        // 计算“真正有尺寸、真正渲染出来的元素”的最大 bottom
        const els = Array.from(document.querySelectorAll("body *"));
        let maxBottom = 0;

        for (const el of els) {
          // 跳过不可见/无尺寸元素
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;

          // 有些站点会把很大的占位元素放在底部，但内部没内容；这里用一个更稳的过滤：
          // 如果元素完全透明/不可见，也跳过（不完美但对电商页很有效）
          const cs = window.getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;

          if (r.bottom > maxBottom) maxBottom = r.bottom;
        }

        // 转成文档坐标
        const y = Math.ceil(maxBottom + window.scrollY);

        // 给一点点 buffer，避免最后一行被截掉
        return y + 8;
      })()
    `,
    returnByValue: true,
  });

  return Math.max(1, result.value || 1);
}

async function captureFullPagePngDataUrl(tabId) {
  return withDebugger(tabId, async () => {
    // 1) 获取布局 metrics（主要用 width）
    const { contentSize } = await cdpSend(tabId, "Page.getLayoutMetrics");
    const fullWidth = Math.max(1, Math.ceil(contentSize.width));

    // 2) 用可见内容计算“真实高度”，避免 contentSize.height 虚高
    const visibleHeight = await getVisibleBottomY(tabId);

    // 3) 记住原窗口尺寸，结束后恢复
    const tab = await chrome.tabs.get(tabId);
    const originalWidth = tab.width || 1280;
    const originalHeight = tab.height || 720;

    // 4) 设成一个足够大的 viewport（宽按页面， 高按可见内容）
    await cdpSend(tabId, "Emulation.setDeviceMetricsOverride", {
      mobile: false,
      width: fullWidth,
      height: Math.max(originalHeight, Math.min(visibleHeight, 30000)), // 防止极端页面无限高
      deviceScaleFactor: 1,
      screenOrientation: { angle: 0, type: "portraitPrimary" },
    });

    await sleep(200);

    // 5) 用 clip 精确裁剪到“可见内容高度”，彻底去白边
    const { data } = await cdpSend(tabId, "Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      clip: {
        x: 0,
        y: 0,
        width: fullWidth,
        height: Math.min(visibleHeight, 30000), // 同样做上限保护
        scale: 1,
      },
    });

    // 6) restore
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