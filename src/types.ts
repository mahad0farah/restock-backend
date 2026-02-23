export type StockStatus = 'in_stock' | 'few_left' | 'unavailable';

export interface VariantInfo {
  size?: string;
  color?: string;
  style?: string;
}

export interface StockCheckRequest {
  url: string;
  currentStatus?: StockStatus;
  variant?: string; // Formatted variant string like "Size: M, Color: Black"
}

export interface StockCheckResponse {
  success: boolean;
  status?: StockStatus;
  error?: string;
  checkedAt: number;
}
