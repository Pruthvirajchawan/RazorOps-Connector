import { randomUUID } from 'node:crypto';
import { appDb } from '../database/db.js';
import { ConnectorError } from '../domain/errors.js';
import {
  AttentionPriority,
  AttentionSchema,
  GetOrderSchema,
  GetProductSchema,
  LowStockSchema,
  SearchOrdersSchema,
  SearchProductsSchema,
} from '../domain/types.js';
import { rootLogger } from '../logging/logger.js';
import { MerchantDataProvider } from '../providers/provider.interface.js';
import { attentionEngine } from '../services/attention.service.js';

export interface McpToolDefinition {
  name: string;
  description: string;
  readOnly: boolean;
  permission: string;
  dataSensitivity: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  execute: (provider: MerchantDataProvider, args: Record<string, unknown>, requestId?: string) => Promise<unknown>;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'search_orders',
    description: 'Search and filter merchant orders with bounded pagination and masked PII. Read-only.',
    readOnly: true,
    permission: 'READ_ORDERS',
    dataSensitivity: 'Confidential Operational Data (Customer PII is masked; payment secrets omitted)',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by order status (e.g. pending, processing, completed)' },
        customer: { type: 'string', description: 'Search by masked customer name' },
        orderId: { type: 'string', description: 'Filter by specific order ID' },
        product: { type: 'string', description: 'Filter by product name substring' },
        sku: { type: 'string', description: 'Filter by SKU code' },
        after: { type: 'string', description: 'ISO 8601 start date' },
        before: { type: 'string', description: 'ISO 8601 end date' },
        minTotal: { type: 'number', description: 'Minimum order amount' },
        maxTotal: { type: 'number', description: 'Maximum order amount' },
        page: { type: 'integer', default: 1 },
        limit: { type: 'integer', default: 20, maximum: 100 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        orders: { type: 'array' },
        count: { type: 'integer' },
        hasMore: { type: 'boolean' },
        source: { type: 'string' },
      },
    },
    execute: async (provider, args, requestId = randomUUID()) => {
      const parsed = SearchOrdersSchema.parse(args);
      const res = await provider.searchOrders(parsed);
      return {
        orders: res.data,
        count: res.count,
        total: res.total,
        page: res.page,
        hasMore: res.hasMore,
        source: res.source,
      };
    },
  },
  {
    name: 'get_order',
    description: 'Retrieve detailed normalized order data by Order ID. Excludes raw payment secrets. Read-only.',
    readOnly: true,
    permission: 'READ_ORDERS',
    dataSensitivity: 'Confidential Operational Data',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'The unique order ID or order number' },
      },
      required: ['orderId'],
    },
    outputSchema: {
      type: 'object',
      description: 'Normalized order record with line items, SKUs, and amounts.',
    },
    execute: async (provider, args, requestId = randomUUID()) => {
      const parsed = GetOrderSchema.parse(args);
      return provider.getOrder(parsed.orderId);
    },
  },
  {
    name: 'search_products',
    description: 'Search merchant catalog products by query string, SKU, or stock status. Read-only.',
    readOnly: true,
    permission: 'READ_PRODUCTS',
    dataSensitivity: 'Merchant Catalog Data',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword matching product name or SKU' },
        sku: { type: 'string', description: 'Exact SKU lookup' },
        stockStatus: { type: 'string', enum: ['instock', 'outofstock', 'onbackorder'] },
        page: { type: 'integer', default: 1 },
        limit: { type: 'integer', default: 20, maximum: 100 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        products: { type: 'array' },
        count: { type: 'integer' },
        hasMore: { type: 'boolean' },
        source: { type: 'string' },
      },
    },
    execute: async (provider, args, requestId = randomUUID()) => {
      const parsed = SearchProductsSchema.parse(args);
      const res = await provider.searchProducts(parsed);
      return {
        products: res.data,
        count: res.count,
        total: res.total,
        page: res.page,
        hasMore: res.hasMore,
        source: res.source,
      };
    },
  },
  {
    name: 'get_product',
    description: 'Retrieve normalized product details by productId or SKU. Read-only.',
    readOnly: true,
    permission: 'READ_PRODUCTS',
    dataSensitivity: 'Merchant Catalog Data',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product numeric ID' },
        sku: { type: 'string', description: 'Merchant SKU' },
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Normalized product details including current inventory stock levels.',
    },
    execute: async (provider, args, requestId = randomUUID()) => {
      const parsed = GetProductSchema.parse(args);
      return provider.getProduct(parsed);
    },
  },
  {
    name: 'find_low_stock_products',
    description: 'Identify merchant products whose current inventory quantity is at or below the given threshold. Read-only.',
    readOnly: true,
    permission: 'READ_INVENTORY',
    dataSensitivity: 'Merchant Inventory Data',
    inputSchema: {
      type: 'object',
      properties: {
        threshold: { type: 'integer', default: 5, description: 'Stock quantity threshold (inclusive)' },
        limit: { type: 'integer', default: 20, maximum: 100 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        products: { type: 'array' },
        threshold: { type: 'integer' },
        count: { type: 'integer' },
      },
    },
    execute: async (provider, args, requestId = randomUUID()) => {
      const parsed = LowStockSchema.parse(args);
      const res = await provider.searchProducts({ limit: 100 });
      const lowStock = res.data.filter((p) => {
        if (p.stockStatus === 'outofstock') return true;
        if (p.stockQuantity !== null && p.stockQuantity <= parsed.threshold) return true;
        return false;
      });

      const sliced = lowStock.slice(0, parsed.limit);
      return {
        products: sliced.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          currentStock: p.stockQuantity,
          stockStatus: p.stockStatus,
          threshold: parsed.threshold,
        })),
        threshold: parsed.threshold,
        count: sliced.length,
      };
    },
  },
  {
    name: 'find_orders_needing_attention',
    description:
      'Perform cross-resource operational reasoning across orders and inventory snapshots. Identifies fulfillment bottlenecks, inventory shortages, and stale pending orders with verified evidence. Read-only.',
    readOnly: true,
    permission: 'READ_OPERATIONS',
    dataSensitivity: 'High Operational Significance',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 20, maximum: 100 },
        minPriority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array' },
        count: { type: 'integer' },
        totalScanned: { type: 'integer' },
      },
    },
    execute: async (provider, args, requestId = randomUUID()) => {
      const parsed = AttentionSchema.parse(args);
      return attentionEngine.findOrdersNeedingAttention(provider, parsed.limit, parsed.minPriority as AttentionPriority);
    },
  },
];

export async function executeMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  provider: MerchantDataProvider,
  requestId = randomUUID()
): Promise<unknown> {
  const tool = MCP_TOOLS.find((t) => t.name === toolName);
  if (!tool) {
    throw new ConnectorError({
      code: 'VALIDATION_ERROR',
      statusCode: 404,
      message: `Unknown MCP tool "${toolName}". Supported tools are: ${MCP_TOOLS.map((t) => t.name).join(', ')}.`,
    });
  }

  const startTime = Date.now();
  try {
    const result = await tool.execute(provider, args, requestId);
    const latencyMs = Date.now() - startTime;

    // Record audit event
    appDb.recordAudit({
      requestId,
      timestamp: new Date().toISOString(),
      toolName,
      inputSummary: JSON.stringify(args).slice(0, 300),
      storeUrl: provider.mode === 'demo' ? 'demo://internal' : 'live://woocommerce',
      endpointCategory: tool.permission,
      latencyMs,
      status: 'SUCCESS',
      resultCount: Array.isArray(result) ? result.length : (result as { count?: number })?.count ?? 1,
    });

    return result;
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const errorCode = err instanceof ConnectorError ? err.code : 'UNKNOWN_ERROR';

    appDb.recordAudit({
      requestId,
      timestamp: new Date().toISOString(),
      toolName,
      inputSummary: JSON.stringify(args).slice(0, 300),
      storeUrl: provider.mode === 'demo' ? 'demo://internal' : 'live://woocommerce',
      endpointCategory: tool.permission,
      latencyMs,
      status: 'ERROR',
      errorCode,
    });

    rootLogger.error(`MCP Tool execution failed: ${toolName}`, {
      requestId,
      toolName,
      error: (err as Error).message,
      errorCode,
    });

    throw err;
  }
}
