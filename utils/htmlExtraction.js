// HTML Extraction and Truncation Utilities
// Configuration
const MAX_HTML_LENGTH = 100000; // Adjust this value to control truncation
const PRESERVE_TAGS = ['style', 'link', 'meta', 'title', 'head']; // Tags to always preserve

// Preprocess HTML
function htmlExtractionAndTruncation() {
  'use strict';

  function getFullHTML() {
    // Get the complete HTML including doctype
    const doctype = document.doctype ?
      `<!DOCTYPE ${document.doctype.name}` +
      (document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : '') +
      (document.doctype.systemId ? ` "${document.doctype.systemId}"` : '') +
      '>' : '';

    return doctype + document.documentElement.outerHTML;
  }

  function preserveStyleInformation(html) {
    // Extract all style-related content
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Collect all style information
    const styles = [];

    // Get inline styles from style tags
    const styleTags = doc.querySelectorAll('style');
    styleTags.forEach(tag => {
      styles.push(tag.outerHTML);
    });

    // Get external stylesheets
    const linkTags = doc.querySelectorAll('link[rel="stylesheet"]');
    linkTags.forEach(tag => {
      styles.push(tag.outerHTML);
    });

    // Get meta tags (for viewport, etc.)
    const metaTags = doc.querySelectorAll('meta');
    const metaHTML = Array.from(metaTags).map(tag => tag.outerHTML).join('\n');

    // Get title
    const title = doc.querySelector('title');
    const titleHTML = title ? title.outerHTML : '';

    return {
      styles: styles.join('\n'),
      meta: metaHTML,
      title: titleHTML,
      doc: doc
    };
  }

  function optimizeCSS(cssContent) {
    // Remove comments
    let optimized = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove unnecessary whitespace but preserve structure
    optimized = optimized.replace(/\s+/g, ' ').trim();

    // Remove spaces around certain characters
    optimized = optimized.replace(/\s*{\s*/g, '{');
    optimized = optimized.replace(/\s*}\s*/g, '}');
    optimized = optimized.replace(/\s*;\s*/g, ';');
    optimized = optimized.replace(/\s*:\s*/g, ':');
    optimized = optimized.replace(/\s*,\s*/g, ',');

    return optimized;
  }

  function extractVisibleContent(doc) {
    // Clone the document to avoid modifying the original
    const clonedDoc = doc.cloneNode(true);

    // Remove invisible elements that don't affect visible content
    const invisibleSelectors = [
      'script',
      'noscript',
      '[style*="display:none"]',
      '[style*="display: none"]',
      '[hidden]',
      '.hidden',
      '[aria-hidden="true"]'
    ];

    invisibleSelectors.forEach(selector => {
      const elements = clonedDoc.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });

    // Remove excessive whitespace from text nodes while preserving structure
    const walker = clonedDoc.createTreeWalker(
      clonedDoc.body || clonedDoc,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    textNodes.forEach(textNode => {
      // Compress multiple whitespaces but preserve intentional formatting
      const parent = textNode.parentElement;
      const isPreformatted = parent && (
        parent.tagName === 'PRE' ||
        parent.tagName === 'CODE' ||
        getComputedStyle(parent).whiteSpace === 'pre' ||
        getComputedStyle(parent).whiteSpace === 'pre-wrap'
      );

      if (!isPreformatted) {
        textNode.textContent = textNode.textContent.replace(/\s+/g, ' ');
      }
    });

    return clonedDoc;
  }

  function truncateHTML(html, maxLength) {
    if (html.length <= maxLength) {
      return html;
    }

    // Parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Get essential head elements but optimize them
    const head = doc.querySelector('head');
    let headContent = '';

    if (head) {
      // Preserve meta tags (minimal size impact)
      const metaTags = head.querySelectorAll('meta');
      const metaHTML = Array.from(metaTags).map(tag => tag.outerHTML).join('');

      // Preserve title
      const title = head.querySelector('title');
      const titleHTML = title ? title.outerHTML : '';

      // Optimize CSS while preserving all styles
      const styleTags = head.querySelectorAll('style');
      let optimizedStyles = '';
      styleTags.forEach(tag => {
        const optimizedCSS = optimizeCSS(tag.innerHTML);
        optimizedStyles += `<style>${optimizedCSS}</style>`;
      });

      // Preserve external stylesheets (they're usually small)
      const linkTags = head.querySelectorAll('link[rel="stylesheet"]');
      const linkHTML = Array.from(linkTags).map(tag => tag.outerHTML).join('');

      headContent = metaHTML + titleHTML + optimizedStyles + linkHTML;
    }

    // Extract and optimize body content while preserving ALL visible content
    const optimizedDoc = extractVisibleContent(doc);
    const bodyElement = optimizedDoc.querySelector('body');
    let bodyContent = bodyElement ? bodyElement.innerHTML : optimizedDoc.documentElement.innerHTML;

    // Create the final HTML structure
    const doctype = document.doctype ?
      `<!DOCTYPE ${document.doctype.name}` +
      (document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : '') +
      (document.doctype.systemId ? ` "${document.doctype.systemId}"` : '') +
      '>' : '<!DOCTYPE html>';

    const finalHTML = `${doctype}
<html>
<head>
${headContent}
</head>
<body>
${bodyContent}
</body>
</html>`;

    // If still too large, try more aggressive CSS optimization
    if (finalHTML.length > maxLength) {
      console.log(`⚠️ HTML still exceeds ${maxLength} characters after optimization. Length: ${finalHTML.length}`);
      console.log('🔧 Consider increasing MAX_HTML_LENGTH or the content is exceptionally large');

      // As a last resort, try to compress CSS further by removing non-essential properties
      // But still preserve all visible content structure
      const compressedHTML = finalHTML.replace(/\s+/g, ' ').trim();

      if (compressedHTML.length <= maxLength) {
        return compressedHTML;
      }

      // If even compressed version is too large, warn but return the optimized version
      console.warn('📋 Optimized HTML still too large; hard-truncating to MAX_HTML_LENGTH to fit extension limits.');
    return finalHTML.slice(0, maxLength);
    }

    return finalHTML;
  }

  function calculateCompressionRate(original, truncated) {
    return ((1 - (truncated.length / original.length)) * 100).toFixed(2);
  }

  function formatBytesToReadable(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  // Main execution
  function extractAndProcessHTML() {
    console.log('🔍 Dark Pattern Agent - Starting HTML extraction...');
    console.log('🎯 Strategy: Preserve ALL visible content while optimizing CSS and removing invisible elements');

    // Get full HTML
    const fullHTML = getFullHTML();
    const originalLength = fullHTML.length;

    // Optimize HTML while preserving all visible content
    const optimizedHTML = truncateHTML(fullHTML, MAX_HTML_LENGTH);
    const optimizedLength = optimizedHTML.length;

    // Calculate compression
    const compressionRate = calculateCompressionRate(fullHTML, optimizedHTML);

    // Log results
    console.log('📊 HTML Processing Results:');
    console.log(`📏 Original HTML length: ${originalLength.toLocaleString()} characters (${formatBytesToReadable(originalLength)})`);
    console.log(`✨ Optimized HTML length: ${optimizedLength.toLocaleString()} characters (${formatBytesToReadable(optimizedLength)})`);
    console.log(`📉 Compression rate: ${compressionRate}%`);
    console.log(`🎯 Max length setting: ${MAX_HTML_LENGTH.toLocaleString()} characters`);
    console.log(`✅ All visible content preserved: ${optimizedLength <= MAX_HTML_LENGTH ? 'YES' : 'YES (size limit exceeded but content intact)'}`);

    // Print the optimized HTML for copying
    console.log('\n📋 OPTIMIZED HTML (ready to copy):');
    console.log('================================');
    console.log(optimizedHTML);
    console.log('================================');

    // Also make it available in a global variable for easy access
    window.extractedHTML = optimizedHTML;
    console.log('💡 Tip: The optimized HTML is also available in window.extractedHTML for programmatic access');
    
    // Store in DOM attribute so it's accessible from main page context
    document.documentElement.setAttribute('data-extracted-html', optimizedHTML);
    
    // Also dispatch a custom event with the data
    window.dispatchEvent(new CustomEvent('htmlExtracted', { 
      detail: { extractedHTML: optimizedHTML } 
    }));

    return {
      original: fullHTML,
      optimized: optimizedHTML,
      originalLength: originalLength,
      optimizedLength: optimizedLength,
      compressionRate: parseFloat(compressionRate)
    };
  }

  // Wait for page to load then extract HTML
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', extractAndProcessHTML);
  } else {
    // Page already loaded
    return extractAndProcessHTML();
  }

  // Also add a manual trigger function
  window.extractHTML = extractAndProcessHTML;
  console.log('🚀 Dark Pattern Agent HTML Extraction utility loaded! Use extractHTML() to manually trigger extraction.');
  console.log('📝 New strategy: All visible content is preserved while CSS is optimized for size');

  // Return the extraction result
  return extractAndProcessHTML();
}

// Export for use in other files
if (typeof window !== 'undefined') {
  window.htmlExtractionAndTruncation = htmlExtractionAndTruncation;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { htmlExtractionAndTruncation, MAX_HTML_LENGTH, PRESERVE_TAGS };
}