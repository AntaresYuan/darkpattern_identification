console.log("✅ content.js loaded", location.href);
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") {
        sendResponse({ ok: true });
        return;
    }

    if (request.action === 'compressWebsite') {
    console.log('🗜️ Website compression triggered from popup');

  try {
    const compressedHTML = htmlExtractionAndTruncation();

    if (!compressedHTML || !compressedHTML.optimized) {
      throw new Error('Failed to extract and compress HTML');
    }

    const optimizedHtml = compressedHTML.optimized;

    chrome.storage.local.set({
      lastCompressed: {
        url: location.href,
        title: document.title,
        generatedAt: new Date().toISOString(),
        optimizedHtml
      }
    }).catch(() => { /* ignore */ });

    sendResponse({
      success: true,
      optimizedHtml,
      meta: {
        url: location.href,
        title: document.title,
        generatedAt: new Date().toISOString(),
        stats: {
          originalLength: compressedHTML.originalLength,
          optimizedLength: compressedHTML.optimizedLength,
          compressionRate: compressedHTML.compressionRate
        }
      }
    });
  } catch (error) {
    console.error('❌ Error compressing website:', error);
    sendResponse({ success: false, error: error.message });
  }

  return true;
}
});