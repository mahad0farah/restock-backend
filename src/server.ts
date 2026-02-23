import express, { Request, Response } from 'express';
import cors from 'cors';
import { StockChecker } from './stock-checker';
import { StockCheckRequest, StockCheckResponse } from './types';

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

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Stock check endpoint
app.post('/api/check-stock', async (req: Request, res: Response) => {
  try {
    const { url, currentStatus }: StockCheckRequest = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
        checkedAt: Date.now()
      } as StockCheckResponse);
    }

    console.log(`[API] Checking stock for: ${url}`);

    const status = await checker.checkStock(url);

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

// Start server
app.listen(PORT, () => {
  console.log(`Restock backend server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Stock check API: http://localhost:${PORT}/api/check-stock`);
});
