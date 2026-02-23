export type StockStatus = 'in_stock' | 'few_left' | 'unavailable';

export interface StockCheckRequest {
  url: string;
  currentStatus?: StockStatus;
}

export interface StockCheckResponse {
  success: boolean;
  status?: StockStatus;
  error?: string;
  checkedAt: number;
}
