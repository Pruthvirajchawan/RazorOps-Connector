import {
  NormalizedOrder,
  NormalizedProduct,
  OrderSearchFilters,
  PaginatedResult,
  ProductSearchFilters,
  SanitizedConnectionStatus,
} from '../domain/types.js';

export interface MerchantDataProvider {
  readonly name: string;
  readonly mode: 'demo' | 'live';
  
  testConnection(): Promise<SanitizedConnectionStatus>;
  
  searchOrders(filters?: OrderSearchFilters): Promise<PaginatedResult<NormalizedOrder>>;
  getOrder(orderId: string): Promise<NormalizedOrder>;
  
  searchProducts(filters?: ProductSearchFilters): Promise<PaginatedResult<NormalizedProduct>>;
  getProduct(params: { productId?: string; sku?: string }): Promise<NormalizedProduct>;
  
  getInventorySnapshot(skus: string[]): Promise<Map<string, { stockQuantity: number | null; stockStatus: string; name: string }>>;
}
