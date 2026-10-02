import {
  NormalizedOrder,
  NormalizedProduct,
  OrderSearchFilters,
  PaginatedResult,
  ProductSearchFilters,
  SanitizedConnectionStatus,
} from '../domain/types.js';
import { WooCommerceClient, WooCommerceClientOptions } from '../client/woocommerce.client.js';
import { MerchantDataProvider } from './provider.interface.js';

export class WooCommerceProvider implements MerchantDataProvider {
  public readonly name = 'WooCommerce Live REST Adapter';
  public readonly mode = 'live' as const;

  private client: WooCommerceClient;

  constructor(options: WooCommerceClientOptions) {
    this.client = new WooCommerceClient(options);
  }

  async testConnection(): Promise<SanitizedConnectionStatus> {
    return this.client.testConnection();
  }

  async searchOrders(filters?: OrderSearchFilters): Promise<PaginatedResult<NormalizedOrder>> {
    return this.client.searchOrders(filters);
  }

  async getOrder(orderId: string): Promise<NormalizedOrder> {
    return this.client.getOrder(orderId);
  }

  async searchProducts(filters?: ProductSearchFilters): Promise<PaginatedResult<NormalizedProduct>> {
    return this.client.searchProducts(filters);
  }

  async getProduct(params: { productId?: string; sku?: string }): Promise<NormalizedProduct> {
    return this.client.getProduct(params);
  }

  async getInventorySnapshot(skus: string[]): Promise<Map<string, { stockQuantity: number | null; stockStatus: string; name: string }>> {
    return this.client.getInventorySnapshot(skus);
  }
}
