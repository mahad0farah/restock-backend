import Anthropic from '@anthropic-ai/sdk';
import { StockStatus } from './types';

export interface DetectedVariant {
  type: 'size' | 'color' | 'style';
  value: string;
  available: boolean;
}

export interface VariantDetectionResult {
  variants: DetectedVariant[];
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
}

export interface StockCheckResult {
  status: StockStatus;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export class AIVisionService {
  private client: Anthropic;
  private cache: Map<string, { result: any; timestamp: number }>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    this.client = new Anthropic({ apiKey });
    this.cache = new Map();
  }

  /**
   * Detect image format from base64 data
   */
  private detectImageFormat(base64: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    // Check magic bytes at start of base64
    if (base64.startsWith('/9j/')) return 'image/jpeg';
    if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
    if (base64.startsWith('R0lGODlh')) return 'image/gif';
    if (base64.startsWith('UklGR')) return 'image/webp';

    // Default to JPEG if unknown
    console.warn('[AI Vision] Unknown image format, defaulting to JPEG');
    return 'image/jpeg';
  }

  /**
   * Detect all variants (sizes, colors, styles) from a product screenshot
   */
  async detectVariants(screenshot: string, url: string): Promise<VariantDetectionResult> {
    // Check cache first
    const cacheKey = this.getCacheKey('variants', screenshot);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log('[AI Vision] Using cached variant detection result');
      return cached;
    }

    console.log('[AI Vision] Detecting variants for:', url);

    const prompt = `You are analyzing an e-commerce product page screenshot. Your task is to identify ALL available product variants (sizes, colors, styles) and determine which ones are currently available for purchase.

Look for:
1. Size options (buttons, dropdowns, radio buttons) - typically labeled "Size", "Select Size", etc.
2. Color options (swatches, buttons, images) - typically labeled "Color", "Colour", "Select Color", etc.
3. Style/variant options (different designs, patterns, fits)

For each variant option, determine if it's:
- AVAILABLE: Clearly clickable, normal appearance, not disabled
- UNAVAILABLE: Grayed out, crossed out, disabled, "sold out" label, or similar visual indicators

Respond in JSON format:
{
  "variants": [
    {"type": "size", "value": "S", "available": true},
    {"type": "size", "value": "M", "available": true},
    {"type": "size", "value": "L", "available": false},
    {"type": "color", "value": "Black", "available": true},
    {"type": "color", "value": "White", "available": false}
  ],
  "confidence": "high",
  "reasoning": "Clear size buttons visible with S and M enabled, L grayed out. Color swatches show black available, white sold out."
}

Confidence levels:
- "high": Variants are clearly visible and states are obvious
- "medium": Variants visible but availability is somewhat ambiguous
- "low": Difficult to identify variants or determine availability

If no variants are found, return empty array with appropriate confidence and reasoning.`;

    try {
      // Auto-detect image format
      const mediaType = this.detectImageFormat(screenshot);
      console.log(`[AI Vision] Detected image format: ${mediaType}`);

      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: screenshot,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      });

      const result = this.parseVariantResponse(response);
      this.setCache(cacheKey, result);

      console.log(`[AI Vision] Detected ${result.variants.length} variants with ${result.confidence} confidence`);
      return result;
    } catch (error) {
      console.error('[AI Vision] Error detecting variants:', error);
      throw new Error(`AI Vision variant detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a specific variant is in stock from a screenshot
   */
  async checkVariantStock(screenshot: string, variant: string, url: string): Promise<StockCheckResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(`stock-${variant}`, screenshot);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log('[AI Vision] Using cached stock check result for:', variant);
      return cached;
    }

    console.log('[AI Vision] Checking stock for variant:', variant, 'at', url);

    const prompt = `You are analyzing an e-commerce product page screenshot to determine if a specific variant is available for purchase.

Target variant: ${variant}

Your task:
1. Locate the variant selector (size/color/style options)
2. Find the specific variant: ${variant}
3. Determine its stock status based on visual cues

Stock status indicators:
- IN_STOCK: Button/option is clearly clickable, normal appearance, no "sold out" indicators
- FEW_LEFT: Shows text like "Only X left", "Low stock", "Hurry!" but still available
- UNAVAILABLE: Grayed out, crossed out, disabled, "sold out" label, "out of stock" text, or cannot be selected

Respond in JSON format:
{
  "status": "in_stock" | "few_left" | "unavailable",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Detailed explanation of what you see and why you determined this status"
}

Confidence levels:
- "high": Variant clearly visible and status is obvious
- "medium": Variant found but status indicators are somewhat ambiguous
- "low": Difficult to locate variant or determine status

Be conservative: if unsure between in_stock and unavailable, choose unavailable to avoid false positives.`;

    try {
      // Auto-detect image format
      const mediaType = this.detectImageFormat(screenshot);
      console.log(`[AI Vision] Detected image format: ${mediaType}`);

      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: screenshot,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      });

      const result = this.parseStockResponse(response);
      this.setCache(cacheKey, result);

      console.log(`[AI Vision] Stock status: ${result.status} (${result.confidence} confidence)`);
      return result;
    } catch (error) {
      console.error('[AI Vision] Error checking stock:', error);
      throw new Error(`AI Vision stock check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse Claude's response for variant detection
   */
  private parseVariantResponse(response: Anthropic.Message): VariantDetectionResult {
    try {
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Extract JSON from response (may be wrapped in markdown code blocks)
      const text = content.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!Array.isArray(parsed.variants)) {
        throw new Error('Invalid response: variants must be an array');
      }

      return {
        variants: parsed.variants,
        confidence: parsed.confidence || 'medium',
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.error('[AI Vision] Error parsing variant response:', error);
      // Return low confidence empty result on parse error
      return {
        variants: [],
        confidence: 'low',
        reasoning: `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Parse Claude's response for stock checking
   */
  private parseStockResponse(response: Anthropic.Message): StockCheckResult {
    try {
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Extract JSON from response (may be wrapped in markdown code blocks)
      const text = content.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate status
      const validStatuses: StockStatus[] = ['in_stock', 'few_left', 'unavailable'];
      if (!validStatuses.includes(parsed.status)) {
        throw new Error(`Invalid status: ${parsed.status}`);
      }

      return {
        status: parsed.status,
        confidence: parsed.confidence || 'medium',
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      console.error('[AI Vision] Error parsing stock response:', error);
      // Return unavailable with low confidence on parse error (conservative approach)
      return {
        status: 'unavailable',
        confidence: 'low',
        reasoning: `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate cache key from screenshot data
   */
  private getCacheKey(prefix: string, screenshot: string): string {
    // Use first 100 chars of base64 as a simple hash
    // In production, you'd want a proper hash function
    const hash = screenshot.substring(0, 100);
    return `${prefix}-${hash}`;
  }

  /**
   * Get item from cache if not expired
   */
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  /**
   * Store item in cache
   */
  private setCache(key: string, result: any): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });

    // Clean up old entries periodically
    if (this.cache.size > 100) {
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > this.CACHE_TTL) {
          this.cache.delete(k);
        }
      }
    }
  }
}
