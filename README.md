# Restock Backend

Backend server for the Restock Chrome extension. Handles stock checking server-side to bypass CORS restrictions and work reliably across all e-commerce websites.

## Features

- Server-side stock checking (no CORS limitations)
- Supports any e-commerce website
- Batch checking endpoint for multiple items
- Health check endpoint for monitoring
- Production-ready with proper error handling

## API Endpoints

### `POST /api/check-stock`

Check stock status for a single product URL.

**Request:**
```json
{
  "url": "https://example.com/product/123",
  "currentStatus": "in_stock"
}
```

**Response:**
```json
{
  "success": true,
  "status": "in_stock",
  "checkedAt": 1234567890
}
```

### `POST /api/check-stock-batch`

Check multiple products at once.

**Request:**
```json
{
  "urls": [
    "https://example.com/product/1",
    "https://example.com/product/2"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    { "url": "...", "success": true, "status": "in_stock" },
    { "url": "...", "success": true, "status": "unavailable" }
  ],
  "checkedAt": 1234567890
}
```

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

## Local Development

```bash
npm install
npm run dev
```

Server runs on http://localhost:3000

## Production Build

```bash
npm install
npm run build
npm start
```

## Environment Variables

- `PORT` - Server port (default: 3000)

## Deployment

This backend is designed to be deployed on Render.com:

1. Push code to GitHub
2. Connect repository to Render
3. Deploy as a Web Service
4. Update extension with the deployed URL
