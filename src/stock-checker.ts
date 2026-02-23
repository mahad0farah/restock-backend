import fetch from 'node-fetch';
import { StockStatus } from './types';

export class StockChecker {
  async checkStock(url: string): Promise<StockStatus> {
    try {
      console.log(`[Backend] Fetching: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        console.error(`[Backend] Failed to fetch ${url}: ${response.status}`);
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      console.log(`[Backend] HTML length: ${html.length} characters`);

      const status = this.parseStockStatus(html);
      console.log(`[Backend] Detected status: ${status}`);

      return status;
    } catch (error) {
      console.error(`[Backend] Error checking stock for ${url}:`, error);
      throw error;
    }
  }

  private parseStockStatus(html: string): StockStatus {
    const lowerHtml = html.toLowerCase();

    // Amazon-specific: If "See All Buying Options" exists, product IS available
    if (lowerHtml.includes('see all buying options') || lowerHtml.includes('other sellers on amazon')) {
      console.log('[Backend Parser] Found Amazon buying options - AVAILABLE');
      return 'in_stock';
    }

    // Check for add to cart button patterns first (most reliable)
    const hasAddToCart = lowerHtml.includes('add to cart') ||
                        lowerHtml.includes('add to bag') ||
                        lowerHtml.includes('add to basket') ||
                        lowerHtml.includes('buy now') ||
                        lowerHtml.includes('purchase') ||
                        lowerHtml.includes('pre-order');

    console.log(`[Backend Parser] Has add to cart: ${hasAddToCart}`);

    // More specific check: look for disabled attribute near add to cart
    let hasDisabledButton = false;
    const addToCartIndex = lowerHtml.indexOf('add to cart');
    if (addToCartIndex !== -1) {
      // Check 1500 chars before and after the "add to cart" text
      const start = Math.max(0, addToCartIndex - 1500);
      const end = Math.min(lowerHtml.length, addToCartIndex + 1500);
      const buttonSection = lowerHtml.substring(start, end);

      // Check for disabled in multiple ways
      const hasDisabledAttr = /disabled="true"|disabled>|disabled\s|disabled=""|disabled$/m.test(buttonSection);
      const ariaDisabled = /aria-disabled="true"/.test(buttonSection);
      const hasDisabledClass = /class="[^"]*disabled[^"]*"|class='[^']*disabled[^']*'/i.test(buttonSection);
      const hasInactiveClass = /class="[^"]*inactive[^"]*"|class='[^']*inactive[^']*'/i.test(buttonSection);
      const hasZalandoDisabled = /button--disabled|z-button--disabled|is-disabled/.test(buttonSection);

      hasDisabledButton = hasDisabledAttr || ariaDisabled || hasDisabledClass || hasInactiveClass || hasZalandoDisabled;

      console.log(`[Backend Parser] Button section check:`, {
        hasDisabledAttr,
        ariaDisabled,
        hasDisabledClass,
        hasInactiveClass,
        hasZalandoDisabled
      });
    }

    console.log(`[Backend Parser] Has disabled button: ${hasDisabledButton}`);

    // Very specific out of stock patterns with word boundaries
    const outOfStockPatterns = [
      /\bout of stock\b/i,
      /\bsold out\b/i,
      /\bcurrently unavailable\b/i,
      /\bno longer available\b/i,
      /\btemporarily out of stock\b/i,
      /\bnot available\b/i,
      /\bitem is no longer available\b/i,
      /\bthis item is unavailable\b/i
    ];

    // Check near the add to cart area specifically
    if (hasAddToCart) {
      const addToCartIndex = lowerHtml.indexOf('add to cart');
      const start = Math.max(0, addToCartIndex - 2000);
      const end = Math.min(lowerHtml.length, addToCartIndex + 2000);
      const productArea = html.substring(start, end);

      for (const pattern of outOfStockPatterns) {
        if (pattern.test(productArea)) {
          console.log(`[Backend Parser] Found out of stock pattern in product area:`, pattern);
          return 'unavailable';
        }
      }
    } else {
      // If no add to cart button, check whole page
      for (const pattern of outOfStockPatterns) {
        if (pattern.test(html)) {
          console.log(`[Backend Parser] Found out of stock pattern:`, pattern);
          return 'unavailable';
        }
      }
    }

    // Check for low stock indicators
    const lowStockPatterns = [
      /only \d+ left/i,
      /\blow stock\b/i,
      /\bfew left\b/i,
      /\blimited stock\b/i,
      /\balmost gone\b/i
    ];

    for (const pattern of lowStockPatterns) {
      if (pattern.test(html)) {
        return 'few_left';
      }
    }

    // Check structured data availability
    const structuredAvailability = this.checkStructuredData(html);
    if (structuredAvailability) {
      return structuredAvailability;
    }

    // If we have an add to cart button and it's not disabled, it's in stock
    if (hasAddToCart && !hasDisabledButton) {
      return 'in_stock';
    }

    // If button exists but is disabled with no clear out of stock message
    if (hasAddToCart && hasDisabledButton) {
      return 'unavailable';
    }

    // Default to in stock if we can't determine
    return 'in_stock';
  }

  private checkStructuredData(html: string): StockStatus | null {
    // Try to find JSON-LD structured data
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);

    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]);
        const availability = data?.offers?.availability?.toLowerCase();

        if (availability) {
          if (availability.includes('instock') || availability.includes('in_stock')) {
            return 'in_stock';
          }
          if (availability.includes('outofstock') || availability.includes('out_of_stock')) {
            return 'unavailable';
          }
          if (availability.includes('limitedavailability')) {
            return 'few_left';
          }
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    return null;
  }
}
