import { NormalizedLineItem, NormalizedOrder, NormalizedProduct } from '../domain/types.js';

export function maskCustomerName(first?: string, last?: string): string {
  const f = (first || '').trim();
  const l = (last || '').trim();

  if (!f && !l) return 'Guest Customer';
  if (f && !l) return `${f[0]}.`;
  if (!f && l) return `${l[0]}.`;
  return `${f} ${l[0]}.`;
}

// WooCommerce raw order interface subset
export interface RawWcLineItem {
  id: number;
  product_id: number;
  name: string;
  sku: string;
  quantity: number;
  subtotal: string;
  total: string;
  price: number;
}

export interface RawWcOrder {
  id: number;
  number?: string;
  status: string;
  date_created_gmt?: string;
  date_created?: string;
  date_modified_gmt?: string;
  date_modified?: string;
  currency: string;
  total: string;
  billing?: {
    first_name?: string;
    last_name?: string;
    city?: string;
    email?: string;
    phone?: string;
  };
  payment_method_title?: string;
  line_items: RawWcLineItem[];
}

export interface RawWcProduct {
  id: number;
  name: string;
  sku: string;
  price: string;
  regular_price?: string;
  stock_quantity: number | null;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  status: string;
  manage_stock: boolean;
  low_stock_amount?: number | null;
  permalink?: string;
}

export function normalizeOrder(raw: RawWcOrder, source: 'woocommerce' | 'demo' = 'woocommerce'): NormalizedOrder {
  const items: NormalizedLineItem[] = (raw.line_items || []).map((item) => ({
    id: String(item.id),
    productId: String(item.product_id),
    sku: item.sku || `SKU-PROD-${item.product_id}`,
    name: item.name,
    quantity: Number(item.quantity) || 1,
    subtotal: item.subtotal || '0.00',
    total: item.total || '0.00',
    price: Number(item.price) || 0,
  }));

  const customerNameMasked = maskCustomerName(raw.billing?.first_name, raw.billing?.last_name);
  const totalAmount = parseFloat(raw.total) || 0;

  return {
    id: String(raw.id),
    orderNumber: String(raw.number || raw.id),
    status: raw.status,
    createdAt: raw.date_created_gmt || raw.date_created || new Date().toISOString(),
    updatedAt: raw.date_modified_gmt || raw.date_modified || new Date().toISOString(),
    currency: raw.currency || 'INR',
    total: raw.total || '0.00',
    totalAmount,
    customerNameMasked,
    customerCity: raw.billing?.city,
    paymentMethodTitle: raw.payment_method_title,
    items,
    itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
    source,
  };
}

export function normalizeProduct(raw: RawWcProduct, source: 'woocommerce' | 'demo' = 'woocommerce'): NormalizedProduct {
  return {
    id: String(raw.id),
    name: raw.name,
    sku: raw.sku || `SKU-PROD-${raw.id}`,
    price: raw.price || '0.00',
    regularPrice: raw.regular_price,
    stockQuantity: raw.stock_quantity !== null && raw.stock_quantity !== undefined ? Number(raw.stock_quantity) : null,
    stockStatus: raw.stock_status || 'instock',
    status: raw.status || 'publish',
    manageStock: Boolean(raw.manage_stock),
    lowStockAmount: raw.low_stock_amount !== null && raw.low_stock_amount !== undefined ? Number(raw.low_stock_amount) : null,
    permalink: raw.permalink,
    source,
  };
}
