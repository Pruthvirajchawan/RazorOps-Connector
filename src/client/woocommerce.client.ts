import { randomUUID } from 'node:crypto';
import { ConnectorError } from '../domain/errors.js';
import {
  NormalizedOrder,
  NormalizedProduct,
  OrderSearchFilters,
  PaginatedResult,
  ProductSearchFilters,
  SanitizedConnectionStatus,
} from '../domain/types.js';
import { rootLogger } from '../logging/logger.js';
import { normalizeOrder, normalizeProduct, RawWcOrder, RawWcProduct } from '../security/sanitizer.js';
import { validateStoreUrl } from '../security/ssrf.js';

export interface WooCommerceClientOptions {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxPages?: number;
  allowLocalhost?: boolean;
}

export class WooCommerceClient {
  private storeUrl: string;
  private consumerKey: string;
  private consumerSecret: string;
  private timeoutMs: number;
  private maxRetries: number;
  private maxPages: number;
  private allowLocalhost: boolean;
  private authHeader: string;

  constructor(options: WooCommerceClientOptions) {
    this.storeUrl = options.storeUrl.replace(/\/+$/, '');
    this.consumerKey = options.consumerKey;
    this.consumerSecret = options.consumerSecret;
    this.timeoutMs = options.timeoutMs || 8000;
    this.maxRetries = options.maxRetries ?? 3;
    this.maxPages = options.maxPages ?? 10;
    this.allowLocalhost = options.allowLocalhost ?? (process.env.NODE_ENV !== 'production');

    const authBuffer = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    this.authHeader = `Basic ${authBuffer}`;
  }

  private async executeWithRetry<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    requestId = randomUUID()
  ): Promise<{ data: T; headers: Headers; status: number }> {
    // 1. SSRF validation
    await validateStoreUrl(this.storeUrl, this.allowLocalhost);

    // Build URL
    const url = new URL(`${this.storeUrl}/wp-json/wc/v3/${path.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    }

    let attempt = 0;
    let delayMs = 300;

    while (attempt < this.maxRetries) {
      attempt++;
      const startTime = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        rootLogger.debug('WooCommerce API Request', {
          requestId,
          path,
          attempt,
          storeUrl: this.storeUrl,
        });

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: this.authHeader,
            Accept: 'application/json',
            'User-Agent': 'MerchantOps-Agent-Connector/1.0',
            'X-Request-ID': requestId,
          },
          signal: controller.signal,
        });

        clearTimeout(timer);
        const duration = Date.now() - startTime;

        // Success 2xx
        if (response.ok) {
          const data = (await response.json()) as T;
          return { data, headers: response.headers, status: response.status };
        }

        // Handle Non-Retryable 4xx
        if (response.status === 401) {
          throw new ConnectorError({
            code: 'AUTHENTICATION_ERROR',
            statusCode: 401,
            message: 'WooCommerce API-key authentication failed. Verify Consumer Key and Consumer Secret.',
            upstreamUrl: url.pathname,
            attemptsMade: attempt,
            remedy: 'Check credentials under WooCommerce > Settings > Advanced > REST API.',
          });
        }

        if (response.status === 403) {
          throw new ConnectorError({
            code: 'PERMISSION_ERROR',
            statusCode: 403,
            message: 'WooCommerce API returned 403 Forbidden. Verify the key has at least Read permissions.',
            upstreamUrl: url.pathname,
            attemptsMade: attempt,
            remedy: 'Ensure key permission is set to Read or Read/Write.',
          });
        }

        if (response.status === 404) {
          throw new ConnectorError({
            code: 'NOT_FOUND',
            statusCode: 404,
            message: `WooCommerce resource not found at ${url.pathname}.`,
            upstreamUrl: url.pathname,
            attemptsMade: attempt,
          });
        }

        // Retryable: 429 Rate Limit
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : Math.ceil(delayMs / 1000);

          if (attempt >= this.maxRetries) {
            throw new ConnectorError({
              code: 'RATE_LIMITED',
              statusCode: 429,
              retryAfterSeconds: retryAfterSec,
              attemptsMade: attempt,
              message: `WooCommerce temporarily rate-limited this request. The connector retried ${attempt} times and stopped to avoid excessive traffic.`,
              remedy: `Wait ${retryAfterSec} seconds before retrying.`,
            });
          }

          const waitTime = retryAfterHeader ? retryAfterSec * 1000 : delayMs + Math.random() * 200;
          rootLogger.warn('Rate limited by WooCommerce upstream, backing off', {
            requestId,
            attempt,
            retryAfterSec,
            waitTimeMs: waitTime,
          });
          await new Promise((r) => setTimeout(r, waitTime));
          delayMs *= 2;
          continue;
        }

        // Retryable 5xx / 408
        if ([408, 502, 503, 504].includes(response.status)) {
          if (attempt >= this.maxRetries) {
            throw new ConnectorError({
              code: 'UPSTREAM_ERROR',
              statusCode: response.status,
              attemptsMade: attempt,
              message: `WooCommerce upstream service returned HTTP ${response.status} after ${attempt} attempts.`,
              remedy: 'Check WooCommerce store hosting health and server logs.',
            });
          }
          const waitTime = delayMs + Math.random() * 150;
          await new Promise((r) => setTimeout(r, waitTime));
          delayMs *= 2;
          continue;
        }

        // General upstream error
        const textBody = await response.text().catch(() => '');
        throw new ConnectorError({
          code: 'UPSTREAM_ERROR',
          statusCode: response.status,
          attemptsMade: attempt,
          message: `WooCommerce returned unexpected HTTP status ${response.status}: ${textBody.slice(0, 200)}`,
        });
      } catch (err: unknown) {
        clearTimeout(timer);
        if (err instanceof ConnectorError) {
          throw err;
        }

        const isAbort = (err as Error).name === 'AbortError';
        if (isAbort) {
          if (attempt >= this.maxRetries) {
            throw new ConnectorError({
              code: 'TIMEOUT',
              statusCode: 504,
              attemptsMade: attempt,
              message: `WooCommerce did not respond within ${this.timeoutMs / 1000} seconds after ${attempt} attempts.`,
              remedy: 'Verify the store is reachable and not experiencing heavy database locks.',
            });
          }
        } else {
          // Network connection error
          if (attempt >= this.maxRetries) {
            throw new ConnectorError({
              code: 'UPSTREAM_ERROR',
              statusCode: 502,
              attemptsMade: attempt,
              message: `Network failure connecting to WooCommerce: ${(err as Error).message}`,
              remedy: 'Verify network connectivity and store domain resolution.',
            });
          }
        }

        const waitTime = delayMs + Math.random() * 150;
        await new Promise((r) => setTimeout(r, waitTime));
        delayMs *= 2;
      }
    }

    throw new ConnectorError({
      code: 'UNKNOWN_ERROR',
      message: 'Exhausted maximum retry budget without receiving a valid response.',
    });
  }

  async testConnection(): Promise<SanitizedConnectionStatus> {
    const requestId = randomUUID();
    // Test with lightweight endpoint: /system_status or orders with per_page=1
    try {
      const { data, headers } = await this.executeWithRetry<RawWcOrder[]>('orders', { per_page: 1 }, requestId);

      // Verify products read access
      await this.executeWithRetry<RawWcProduct[]>('products', { per_page: 1 }, requestId);

      const storeHost = new URL(this.storeUrl).hostname;
      return {
        connected: true,
        store: storeHost,
        storeUrl: this.storeUrl,
        mode: 'live',
        permissions: ['read_orders', 'read_products', 'read_inventory'],
        apiVersion: 'wc/v3',
        accessibleResources: {
          orders: true,
          products: true,
          inventory: true,
        },
        checkedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      if (err instanceof ConnectorError) {
        throw err;
      }
      throw new ConnectorError({
        code: 'AUTHENTICATION_ERROR',
        message: `Failed to verify WooCommerce connection: ${(err as Error).message}`,
        remedy: 'Check that URL, Consumer Key, and Secret are correct and have read permission.',
      });
    }
  }

  async searchOrders(filters: OrderSearchFilters = {}): Promise<PaginatedResult<NormalizedOrder>> {
    const page = filters.page || 1;
    const perPage = Math.min(100, Math.max(1, filters.limit || 20));

    if (page > this.maxPages) {
      throw new ConnectorError({
        code: 'VALIDATION_ERROR',
        message: `Requested page ${page} exceeds the maximum safe limit (${this.maxPages}). Result set is too large. Narrow the search criteria.`,
        remedy: 'Narrow the date range, status, or search query.',
      });
    }

    const queryParams: Record<string, string | number | undefined> = {
      page,
      per_page: perPage,
      status: filters.status,
      search: filters.customer || filters.product,
      after: filters.after,
      before: filters.before,
    };

    const { data, headers } = await this.executeWithRetry<RawWcOrder[]>('orders', queryParams);

    const totalHeader = headers.get('X-WP-Total');
    const totalPagesHeader = headers.get('X-WP-TotalPages');
    const total = totalHeader ? parseInt(totalHeader, 10) : undefined;
    const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : undefined;

    let normalized = data.map((o) => normalizeOrder(o, 'woocommerce'));

    // Apply deterministic in-memory filters if specified (e.g. SKU, minTotal, maxTotal)
    if (filters.sku) {
      const targetSku = filters.sku.toLowerCase();
      normalized = normalized.filter((o) => o.items.some((item) => item.sku.toLowerCase() === targetSku));
    }
    if (filters.minTotal !== undefined) {
      normalized = normalized.filter((o) => o.totalAmount >= (filters.minTotal || 0));
    }
    if (filters.maxTotal !== undefined) {
      normalized = normalized.filter((o) => o.totalAmount <= (filters.maxTotal || Infinity));
    }

    return {
      data: normalized,
      count: normalized.length,
      total,
      page,
      perPage,
      hasMore: totalPages ? page < totalPages : normalized.length === perPage,
      totalPages,
      source: 'woocommerce',
    };
  }

  async getOrder(orderId: string): Promise<NormalizedOrder> {
    const { data } = await this.executeWithRetry<RawWcOrder>(`orders/${encodeURIComponent(orderId)}`);
    return normalizeOrder(data, 'woocommerce');
  }

  async searchProducts(filters: ProductSearchFilters = {}): Promise<PaginatedResult<NormalizedProduct>> {
    const page = filters.page || 1;
    const perPage = Math.min(100, Math.max(1, filters.limit || 20));

    if (page > this.maxPages) {
      throw new ConnectorError({
        code: 'VALIDATION_ERROR',
        message: `Requested page ${page} exceeds the maximum safe limit (${this.maxPages}). Result set is too large. Narrow the search criteria.`,
      });
    }

    const queryParams: Record<string, string | number | undefined> = {
      page,
      per_page: perPage,
      search: filters.query,
      sku: filters.sku,
      stock_status: filters.stockStatus,
    };

    const { data, headers } = await this.executeWithRetry<RawWcProduct[]>('products', queryParams);

    const totalHeader = headers.get('X-WP-Total');
    const totalPagesHeader = headers.get('X-WP-TotalPages');
    const total = totalHeader ? parseInt(totalHeader, 10) : undefined;
    const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : undefined;

    const normalized = data.map((p) => normalizeProduct(p, 'woocommerce'));

    return {
      data: normalized,
      count: normalized.length,
      total,
      page,
      perPage,
      hasMore: totalPages ? page < totalPages : normalized.length === perPage,
      totalPages,
      source: 'woocommerce',
    };
  }

  async getProduct(params: { productId?: string; sku?: string }): Promise<NormalizedProduct> {
    if (params.productId) {
      const { data } = await this.executeWithRetry<RawWcProduct>(`products/${encodeURIComponent(params.productId)}`);
      return normalizeProduct(data, 'woocommerce');
    }

    if (params.sku) {
      const { data } = await this.executeWithRetry<RawWcProduct[]>('products', { sku: params.sku, per_page: 1 });
      if (!data || data.length === 0) {
        throw new ConnectorError({
          code: 'NOT_FOUND',
          statusCode: 404,
          message: `Product with SKU "${params.sku}" was not found.`,
        });
      }
      return normalizeProduct(data[0], 'woocommerce');
    }

    throw new ConnectorError({
      code: 'VALIDATION_ERROR',
      message: 'Either productId or sku must be provided.',
    });
  }

  async getInventorySnapshot(skus: string[]): Promise<Map<string, { stockQuantity: number | null; stockStatus: string; name: string }>> {
    const map = new Map<string, { stockQuantity: number | null; stockStatus: string; name: string }>();
    if (skus.length === 0) return map;

    // Fetch products in bounded chunks of SKUs
    for (const sku of skus) {
      try {
        const prod = await this.getProduct({ sku });
        map.set(sku, {
          stockQuantity: prod.stockQuantity,
          stockStatus: prod.stockStatus,
          name: prod.name,
        });
      } catch {
        // Product might not have stock tracking or might not exist
        map.set(sku, {
          stockQuantity: null,
          stockStatus: 'unknown',
          name: 'Unknown SKU',
        });
      }
    }

    return map;
  }
}
