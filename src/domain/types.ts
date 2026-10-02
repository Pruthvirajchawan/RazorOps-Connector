import { z } from 'zod';

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'on-hold'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'failed'
  | string;

export type StockStatus = 'instock' | 'outofstock' | 'onbackorder';

export interface NormalizedLineItem {
  id: string | number;
  productId: string | number;
  sku: string;
  name: string;
  quantity: number;
  subtotal: string;
  total: string;
  price: number;
}

export interface NormalizedOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  currency: string;
  total: string;
  totalAmount: number;
  customerNameMasked: string;
  customerCity?: string;
  paymentMethodTitle?: string;
  items: NormalizedLineItem[];
  itemCount: number;
  source: 'woocommerce' | 'demo';
}

export interface NormalizedProduct {
  id: string;
  name: string;
  sku: string;
  price: string;
  regularPrice?: string;
  stockQuantity: number | null;
  stockStatus: StockStatus;
  status: 'publish' | 'draft' | 'pending' | string;
  manageStock: boolean;
  lowStockAmount?: number | null;
  permalink?: string;
  source: 'woocommerce' | 'demo';
}

export interface OrderSearchFilters {
  status?: string;
  customer?: string;
  orderId?: string;
  product?: string;
  sku?: string;
  after?: string;
  before?: string;
  minTotal?: number;
  maxTotal?: number;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  total?: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  totalPages?: number;
  source: 'woocommerce' | 'demo';
}

export interface ProductSearchFilters {
  query?: string;
  sku?: string;
  stockStatus?: string;
  page?: number;
  limit?: number;
}

export interface LowStockFilters {
  threshold?: number;
  limit?: number;
}

export type AttentionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface EvidenceItem {
  source: 'WooCommerce Order API' | 'WooCommerce Product API' | 'Inventory Snapshot' | 'Merchant Operational Rules';
  metric: string;
  value: string | number;
  thresholdOrExpected?: string | number;
  explanation: string;
}

export interface AttentionItem {
  id: string;
  orderId: string;
  orderNumber: string;
  priority: AttentionPriority;
  status: OrderStatus;
  total: string;
  currency: string;
  reason: string;
  potentialImpact: string;
  affectedSkus: string[];
  evidence: EvidenceItem[];
  detectedAt: string;
}

export interface ConnectionConfig {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  webhookSecret?: string;
  isDemo?: boolean;
}

export interface SanitizedConnectionStatus {
  connected: boolean;
  store: string;
  storeUrl: string;
  mode: 'demo' | 'live';
  permissions: string[];
  apiVersion: string;
  accessibleResources: {
    orders: boolean;
    products: boolean;
    inventory: boolean;
  };
  checkedAt: string;
}

export interface AuditRecord {
  id?: string;
  timestamp: string;
  requestId: string;
  toolName: string;
  inputSummary: string;
  storeUrl: string;
  endpointCategory: string;
  latencyMs: number;
  status: 'SUCCESS' | 'ERROR';
  errorCode?: string;
  resultCount?: number;
}

export interface WebhookEventRecord {
  id: string;
  eventId: string;
  topic: string;
  resourceId: string;
  signatureVerified: boolean;
  status: 'PROCESSED' | 'DUPLICATE' | 'FAILED';
  payloadSummary: string;
  receivedAt: string;
}

// Zod schemas for validation
export const ConnectionTestSchema = z.object({
  storeUrl: z.string().url('Must be a valid URL'),
  consumerKey: z.string().min(1, 'Consumer Key is required'),
  consumerSecret: z.string().min(1, 'Consumer Secret is required'),
  isDemo: z.boolean().optional(),
});

export const SearchOrdersSchema = z.object({
  status: z.string().optional(),
  customer: z.string().optional(),
  orderId: z.string().optional(),
  product: z.string().optional(),
  sku: z.string().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  minTotal: z.number().nonnegative().optional(),
  maxTotal: z.number().nonnegative().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export const GetOrderSchema = z.object({
  orderId: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

export const SearchProductsSchema = z.object({
  query: z.string().optional(),
  sku: z.string().optional(),
  stockStatus: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export const GetProductSchema = z.object({
  productId: z.union([z.string(), z.number()]).optional().transform((v) => (v ? String(v) : undefined)),
  sku: z.string().optional(),
}).refine((data) => data.productId || data.sku, {
  message: 'Either productId or sku must be provided',
});

export const LowStockSchema = z.object({
  threshold: z.number().int().nonnegative().default(5),
  limit: z.number().int().positive().max(100).default(20),
});

export const AttentionSchema = z.object({
  limit: z.number().int().positive().max(100).default(20),
  minPriority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
});
