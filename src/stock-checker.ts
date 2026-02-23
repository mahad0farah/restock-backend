import fetch from 'node-fetch';
import { StockStatus } from './types';

export class StockChecker {
  async checkStock(url: string, variant?: string): Promise<StockStatus> {
    try {
      console.log(`[Backend] Fetching: ${url}`);
      if (variant) console.log(`[Backend] Checking variant: ${variant}`);

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

      const status = variant
        ? this.parseVariantStock(html, variant)
        : this.parseStockStatus(html);
      console.log(`[Backend] Detected status: ${status}`);

      return status;
    } catch (error) {
      console.error(`[Backend] Error checking stock for ${url}:`, error);
      throw error;
    }
  }

  private parseVariantStock(html: string, variantString: string): StockStatus {
    console.log(`[Backend] Checking variant-specific stock: ${variantString}`);

    // Extract size/color from variant string
    const sizeMatch = variantString.match(/Size:\s*([^,]+)/i);
    const colorMatch = variantString.match(/Color:\s*([^,]+)/i);

    const size = sizeMatch?.[1].trim();
    const color = colorMatch?.[1].trim();

    if (size) {
      // Check if this specific size is mentioned as unavailable
      const sizeUnavailablePattern = new RegExp(`${size}[^<]*?(out of stock|sold out|unavailable|disabled)`, 'i');
      if (sizeUnavailablePattern.test(html)) {
        console.log(`[Backend] Size ${size} is unavailable`);
        return 'unavailable';
      }

      // Check if size button is disabled in HTML
      const sizeButtonPattern = new RegExp(`data-size=["']${size}["'][^>]*(disabled|class="[^"]*disabled[^"]*")`, 'i');
      if (sizeButtonPattern.test(html)) {
        console.log(`[Backend] Size ${size} button is disabled`);
        return 'unavailable';
      }
    }

    // Fall back to general stock checking
    return this.parseStockStatus(html);
  }

  private parseStockStatus(html: string): StockStatus {
    const lowerHtml = html.toLowerCase();

    // Check structured data first (most reliable)
    const structuredAvailability = this.checkStructuredData(html);
    if (structuredAvailability) {
      console.log('[Backend Parser] Using structured data:', structuredAvailability);
      return structuredAvailability;
    }

    // Check for add to cart button
    const hasAddToCart = lowerHtml.includes('add to cart') ||
                        lowerHtml.includes('add to bag') ||
                        lowerHtml.includes('add to basket') ||
                        lowerHtml.includes('buy now') ||
                        lowerHtml.includes('purchase');

    console.log(`[Backend Parser] Has add to cart: ${hasAddToCart}`);

    // Check for disabled button near "add to cart"
    let hasDisabledButton = false;
    if (hasAddToCart) {
      const addToCartIndex = lowerHtml.indexOf('add to cart');
      const start = Math.max(0, addToCartIndex - 1500);
      const end = Math.min(lowerHtml.length, addToCartIndex + 1500);
      const buttonSection = lowerHtml.substring(start, end);

      hasDisabledButton = /disabled|aria-disabled="true"|class="[^"]*disabled[^"]*"/i.test(buttonSection);
      console.log(`[Backend Parser] Has disabled button: ${hasDisabledButton}`);
    }

    // Check for out of stock patterns
    const outOfStockPattern = /\b(out of stock|sold out|currently unavailable|not available|unavailable)\b/i;
    if (outOfStockPattern.test(html)) {
      console.log('[Backend Parser] Found out of stock pattern');
      return 'unavailable';
    }

    // Check for low stock patterns
    const lowStockPattern = /\b(low stock|few left|limited stock|only \d+ left)\b/i;
    if (lowStockPattern.test(html)) {
      console.log('[Backend Parser] Found low stock pattern');
      return 'few_left';
    }

    // Determine status based on button state
    if (hasAddToCart && !hasDisabledButton) {
      return 'in_stock';
    }

    if (hasAddToCart && hasDisabledButton) {
      return 'unavailable';
    }

    // Default to in stock
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
