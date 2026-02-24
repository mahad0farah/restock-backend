import express, { Request, Response } from 'express';
import cors from 'cors';
import { StockChecker } from './stock-checker';
import { StockCheckRequest, StockCheckResponse } from './types';
import { AIVisionService } from './ai-vision-service';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins (Chrome extensions have unique origins)
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Stock checker instance
const checker = new StockChecker();

// AI Vision service instance (optional - only if API key is provided)
let aiVision: AIVisionService | null = null;
try {
  aiVision = new AIVisionService();
  console.log('AI Vision service enabled');
} catch (error) {
  console.log('AI Vision service disabled (ANTHROPIC_API_KEY not set)');
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Stock check endpoint
app.post('/api/check-stock', async (req: Request, res: Response) => {
  try {
    const { url, currentStatus, variant }: StockCheckRequest = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
        checkedAt: Date.now()
      } as StockCheckResponse);
    }

    console.log(`[API] Checking stock for: ${url}`);
    if (variant) console.log(`[API] Variant: ${variant}`);

    const status = await checker.checkStock(url, variant);

    const response: StockCheckResponse = {
      success: true,
      status,
      checkedAt: Date.now()
    };

    console.log(`[API] Result: ${status}`);
    res.json(response);
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      checkedAt: Date.now()
    } as StockCheckResponse);
  }
});

// Batch check endpoint (for checking multiple items at once)
app.post('/api/check-stock-batch', async (req: Request, res: Response) => {
  try {
    const { urls }: { urls: string[] } = req.body;

    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({
        success: false,
        error: 'URLs array is required'
      });
    }

    console.log(`[API] Batch checking ${urls.length} items`);

    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const status = await checker.checkStock(url);
          return { url, success: true, status };
        } catch (error) {
          return {
            url,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    res.json({
      success: true,
      results,
      checkedAt: Date.now()
    });
  } catch (error) {
    console.error('[API] Batch error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// AI Vision: Detect variants from screenshot
app.post('/api/detect-variants-vision', async (req: Request, res: Response) => {
  try {
    if (!aiVision) {
      return res.status(503).json({
        success: false,
        error: 'AI Vision service is not available (ANTHROPIC_API_KEY not configured)',
      });
    }

    const { screenshot, url } = req.body;

    if (!screenshot || !url) {
      return res.status(400).json({
        success: false,
        error: 'screenshot and url are required',
      });
    }

    console.log(`[API] AI Vision: Detecting variants for ${url}`);

    const result = await aiVision.detectVariants(screenshot, url);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[API] AI Vision variant detection error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// AI Vision: Check stock for specific variant from screenshot
app.post('/api/check-stock-vision', async (req: Request, res: Response) => {
  try {
    if (!aiVision) {
      return res.status(503).json({
        success: false,
        error: 'AI Vision service is not available (ANTHROPIC_API_KEY not configured)',
      });
    }

    const { screenshot, variant, url } = req.body;

    if (!screenshot || !variant || !url) {
      return res.status(400).json({
        success: false,
        error: 'screenshot, variant, and url are required',
      });
    }

    console.log(`[API] AI Vision: Checking stock for variant "${variant}" at ${url}`);

    const result = await aiVision.checkVariantStock(screenshot, variant, url);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[API] AI Vision stock check error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Restock backend server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Stock check API: http://localhost:${PORT}/api/check-stock`);
  if (aiVision) {
    console.log(`AI Vision API: http://localhost:${PORT}/api/detect-variants-vision`);
    console.log(`AI Vision Stock: http://localhost:${PORT}/api/check-stock-vision`);
  }
});
