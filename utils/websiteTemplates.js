// Website-specific templates for dark patterns

/**
 * Map of website templates for different prompt types
 * Each site can have templates for multiple pattern types
 */
const websiteTemplates = {
  // Amazon.com templates
  'amazon.com': {
    // Popup template for Amazon
    popup: (htmlContent) => {
      // 1. Parse HTML string using DOMParser
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
        
      // 2. Extract Product Title
      let titleText = '';
      const titleElem = doc.querySelector('#productTitle') || doc.querySelector("meta[name='title']");
      if (titleElem) {
        titleText = (titleElem.textContent || titleElem.getAttribute('content') || '').trim();
      }
      if (!titleText) titleText = (doc.title || '').replace(/^Amazon\.com\s*:\s*/, '');

      // 3. Extract Product Image
      // Try landingImage, fallback to og:image meta, fallback to first product image
      let imgUrl = '';
      // Method 1: check landingImage
      const landingImg = doc.querySelector('#landingImage');
      if (landingImg && landingImg.src) {
        imgUrl = landingImg.src;
      }
      // Method 2: check productComparisonTable image
      if (!imgUrl) {
        const compImg = doc.querySelector(
          ".a-image-container img"
        );
        if (compImg && compImg.src) imgUrl = compImg.src;
      }
      // Method 3: og:image
      if (!imgUrl) {
        const ogImgMeta = doc.querySelector("meta[property='og:image']");
        if (ogImgMeta) imgUrl = ogImgMeta.getAttribute('content') || '';
      }
      // Method 4: fallback all images
      if (!imgUrl) {
        const imgs = doc.querySelectorAll('img');
        for (let img of imgs) {
          if (img.src && /amazon.*\.(jpg|jpeg|webp|png)/i.test(img.src)) {
            imgUrl = img.src;
            break;
          }
        }
      }
      // Fallback (Amazon default image):
      if (!imgUrl) imgUrl = 'https://m.media-amazon.com/images/G/01/AUIClients/AmazonUIBaseCSS-sprite_2x-a6855db....png';

      // 4. Extract sub-title (usually the one-line summary under title)
      let subTitle = '';
      const featureDiv = doc.querySelector('#feature-bullets');
      if (featureDiv) {
        // Get the first <li> with text
        const bullet = featureDiv.querySelector('li span');
        if (bullet && bullet.textContent) {
          subTitle = bullet.textContent.trim();
        }
      }
      // As fallback, pick smaller title under title
      if (!subTitle) {
        // Try product description meta
        const descrMeta = doc.querySelector("meta[name='description']");
        if (descrMeta) subTitle = descrMeta.getAttribute('content') || '';
        else subTitle = '';
      }
      // Crop subTitle to one line if too long:
      if (subTitle.length > 120) subTitle = subTitle.slice(0, 117) + '...';

      // 5. Extract Product Short Text (~Marketing/Obs/Paragraph): Description or hero text
      // Try main product description
      let descText = '';
      const productDesc = doc.querySelector('#productDescription') || doc.querySelector('#productDescription_feature_div');
      if (productDesc) {
        // Get main text (strip newlines/markups)
        descText = productDesc.textContent.trim();
      } else if (featureDiv) {
        // Concatenate 2 or 3 feature bullets at most
        const bullets = Array.from(featureDiv.querySelectorAll('li span')).slice(0, 3);
        descText = bullets.map(b => b.textContent.trim()).join(' ');
      }
      // Fallback: Just use Title
      if (!descText) descText = titleText;

      // 6. Extract price (desktop: .reinventPricePriceToPay, \"corePriceDisplay\", etc.)
      let priceText = '';
      // Try various selectors for price
      let priceElem =
        doc.querySelector('.reinventPricePriceToPay span.a-offscreen') ||
        doc.querySelector('#corePrice_feature_div .a-offscreen') ||
        doc.querySelector("span.a-price span.a-offscreen") ||
        doc.querySelector("input#attach-base-product-price");
      if (priceElem) {
        priceText =
          priceElem.getAttribute('value') ||
          priceElem.textContent ||
          '';
      }
      // Also try meta with priceValue
      if (!priceText) {
        const priceInput = doc.getElementById('priceValue');
        if (priceInput && priceInput.value) priceText = priceInput.value;
      }
      // Currency symbol?
      let currencySym = '$';
      const priceSymEl = doc.getElementById('priceSymbol');
      if (priceSymEl && priceSymEl.value) currencySym = priceSymEl.value;
      // Format price:
      if (priceText && !/^[$£€]/.test(priceText)) priceText = currencySym + priceText;
      if (!priceText) priceText = '$???.??';

      return {
        popupHTML: `
          <div style="font-family: 'Amazon Ember', Arial, sans-serif; background-color: #fff; border: 1px solid #ddd; border-radius: 8px; width: 400px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); color: #111; position: relative; box-sizing: border-box;">
          <button id="popup-close" aria-label="Close" style="position: absolute; top: 12px; right: 12px; background: transparent; border: none; font-size: 20px; cursor: pointer; color: #555;">&#10005;</button>
          <h2 style="font-weight: 700; font-size: 20px; margin-bottom: 12px;">Special Offer Just for You!</h2>
          <div style="display: flex; align-items: center; margin-bottom: 16px;">
            <img src="${imgUrl}" alt="${titleText.replace(/"/g, '&quot;')}" style="width: 100px; height: 100px; object-fit: contain; border-radius: 4px; margin-right: 16px;">
            <div>
              <p style="font-size: 16px; margin: 0 0 4px 0; font-weight: 600;">${titleText}</p>
              <p style="font-size: 14px; color: #565959; margin: 0;">${subTitle}</p>
            </div>
          </div>
          <p style="font-size: 14px; margin-bottom: 20px; line-height: 1.4;">
            ${descText}
          </p>
          <button id="popup-buy-now" style="background-color: #ffd814; border: 1px solid #fcd200; border-radius: 4px; padding: 12px 0; width: 100%; font-weight: 700; font-size: 16px; color: #111; cursor: pointer; box-shadow: 0 2px 0 rgb(212 168 0); transition: background-color 0.3s ease;">
            Buy Now - ${priceText}
          </button>
        </div>
        `
      };
    },

    // Preselect template for Amazon
    preselect: (htmlContent) => {
      return {
        "selectorsToCheck": [
          "#attach-warranty-pane input[type='checkbox']",
          "#attach-warranty-multi-device-container input[type='checkbox']",
          "#mbbWrapper input[type='checkbox']",
          "div.a-box.attach-warranty-box input[type='checkbox']",
          "div.a-checkbox input[type='checkbox']",
          "input[name^='offeringID']",
          "input[name^='warrantyPrice']",
          "input[name^='asin']"
        ],
        description: "Found warranty, protection plans, and Prime add-ons"
      };
    }
  },
};

/**
 * Gets a website template based on the current website's URL and prompt type
 * @param {string} promptType - The type of prompt to get template for (e.g., 'popup', 'preselect')
 * @param {string} htmlContent - The HTML content of the current page
 * @returns {Object|null} - Template object or null if no template exists
 */
const getWebsiteTemplate = (promptType, htmlContent) => {
  try {
    const currentURL = window.location.href;
    const hostname = new URL(currentURL).hostname.toLowerCase();

    // Check for hostname matches
    for (const site in websiteTemplates) {
      if (hostname.includes(site) && websiteTemplates[site][promptType]) {
        console.log(`✅ Found template for ${site} (${promptType})`);
        return websiteTemplates[site][promptType](htmlContent);
      }
    }

    console.log(`ℹ️ No template found for ${hostname} (${promptType})`);
    return null;
  } catch (error) {
    console.error('❌ Error in getWebsiteTemplate:', error);
    return null;
  }
}

// Make functions available globally
window.websiteTemplates = {
  getTemplate: getWebsiteTemplate
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getWebsiteTemplate, websiteTemplates };
}