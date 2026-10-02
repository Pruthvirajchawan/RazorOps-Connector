import { ConnectorError } from '../domain/errors.js';
import {
  NormalizedOrder,
  NormalizedProduct,
  OrderSearchFilters,
  PaginatedResult,
  ProductSearchFilters,
  SanitizedConnectionStatus,
} from '../domain/types.js';
import { MerchantDataProvider } from './provider.interface.js';

export class DemoProvider implements MerchantDataProvider {
  public readonly name = 'Demo Mock WooCommerce Adapter';
  public readonly mode = 'demo' as const;

  private products: NormalizedProduct[] = [];
  private orders: NormalizedOrder[] = [];

  constructor() {
    this.seedData();
  }

  private seedData() {
    // 15 realistic synthetic products
    this.products = [
      {
        id: '101',
        name: 'Apex Pro ANC Wireless Headphones',
        sku: 'SKU-483',
        price: '2635.71',
        regularPrice: '2999.00',
        stockQuantity: 4, // Intentionally low for the demo risk scenario!
        stockStatus: 'instock',
        status: 'publish',
        manageStock: true,
        lowStockAmount: 10,
        source: 'demo',
      },
      {
        id: '102',
        name: 'Tactile Pro Mechanical Keyboard RGB',
        sku: 'SKU-109',
        price: '4299.00',
        regularPrice: '4999.00',
        stockQuantity: 0, // OUT OF STOCK!
        stockStatus: 'outofstock',
        status: 'publish',
        manageStock: true,
        lowStockAmount: 5,
        source: 'demo',
      },
      {
        id: '103',
        name: 'UltraGlide Ergonomic Gaming Mouse',
        sku: 'SKU-205',
        price: '1899.00',
        regularPrice: '2299.00',
        stockQuantity: 3, // LOW STOCK!
        stockStatus: 'instock',
        status: 'publish',
        manageStock: true,
        lowStockAmount: 8,
        source: 'demo',
      },
      {
        id: '104',
        name: 'SwiftCharge 65W GaN Multi-Port Charger',
        sku: 'SKU-312',
        price: '1599.00',
        regularPrice: '1999.00',
        stockQuantity: 42,
        stockStatus: 'instock',
        status: 'publish',
        manageStock: true,
        lowStockAmount: 10,
        source: 'demo',
      },
      {
        id: '105',
        name: 'DeskMat Matrix Edition XL (900x400)',
        sku: 'SKU-501',
        price: '899.00',
        regularPrice: '999.00',
        stockQuantity: 88,
        stockStatus: 'instock',
        status: 'publish',
        manageStock: true,
        lowStockAmount: 15,
        source: 'demo',
      },
      {
        id: '106',
        name: 'AeroStand Aluminium Laptop Riser',
        sku: 'SKU-777',
        price: '2499.00',
        regularPrice: '2899.00',
        stockQuantity: 2, // LOW STOCK!
        stockStatus: 'instock',
        status: 'publish',
        manageStock: true,
        lowStockAmount: 5,
        source: 'demo',
      },
      {
        id: '107',
        name: 'ClarityStream 4K UHD Webcam with Dual Mic',
        sku: 'SKU-890',
        price: '6499.00',
        regularPrice: '7499.00',
        stockQuantity: 18,
        stockStatus: 'instock',
        status: 'publish',
        manageStock: true,
        lowStockAmount: 5,
        source: 'demo',
      },
      {
        id: '108',
        name: 'Thunderbolt 4 Docking Station 12-in-1',
        sku: 'SKU-990',
        price: '14999.00',
        regularPrice: '16999.00',
        stockQuantity: 1, // CRITICAL LOW STOCK!
        stockStatus: 'instock',
        status: 'publish',
        manageStock: true,
        lowStockAmount: 5,
        source: 'demo',
      },
      {
        id: '109',
        name: 'StudioPro Condenser Cardioid Microphone',
        sku: 'SKU-650',
        price: '5499.00',
        regularPrice: '5999.00',
        stockQuantity: 15,
        stockStatus: 'instock',
        status: 'publish',
        manageStock: true,
        lowStockAmount: 5,
        source: 'demo',
      },
      {
        id: '110',
        name: 'VibeGlow RGB Lightbar Monitor Mount',
        sku: 'SKU-440',
        price: '2199.00',
        regularPrice: '2499.00',
        stockQuantity: 29,
        stockStatus: 'instock',
        status: 'publish',
        manageStock: true,
        lowStockAmount: 10,
        source: 'demo',
      },
    ];

    const customerNames = [
      'Aarav S.', 'Priya M.', 'Rohan K.', 'Ananya G.', 'Vikram P.',
      'Neha R.', 'Aditya B.', 'Kavita D.', 'Siddharth T.', 'Meera C.',
      'Rahul J.', 'Pooja V.', 'Arjun N.', 'Deepa L.', 'Nikhil S.',
    ];

    const cities = ['Bengaluru', 'Mumbai', 'New Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Ahmedabad', 'Kolkata'];

    // Generate 50 synthetic orders
    this.orders = [];

    // The signature demo order: Order #10482
    this.orders.push({
      id: '10482',
      orderNumber: '10482',
      status: 'processing',
      createdAt: new Date(Date.now() - 3.5 * 3600 * 1000).toISOString(), // 3.5 hours ago
      updatedAt: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(),
      currency: 'INR',
      total: '18450.00',
      totalAmount: 18450.0,
      customerNameMasked: 'Vikram P.',
      customerCity: 'Bengaluru',
      paymentMethodTitle: 'Razorpay UPI',
      items: [
        {
          id: 'li-482-1',
          productId: '101',
          sku: 'SKU-483',
          name: 'Apex Pro ANC Wireless Headphones',
          quantity: 7, // Requires 7, but stock is 4!
          subtotal: '18450.00',
          total: '18450.00',
          price: 2635.71,
        },
      ],
      itemCount: 7,
      source: 'demo',
    });

    // Another order also demanding SKU-483
    this.orders.push({
      id: '10491',
      orderNumber: '10491',
      status: 'processing',
      createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      currency: 'INR',
      total: '5271.42',
      totalAmount: 5271.42,
      customerNameMasked: 'Neha R.',
      customerCity: 'Mumbai',
      paymentMethodTitle: 'Razorpay Cards',
      items: [
        {
          id: 'li-491-1',
          productId: '101',
          sku: 'SKU-483',
          name: 'Apex Pro ANC Wireless Headphones',
          quantity: 2,
          subtotal: '5271.42',
          total: '5271.42',
          price: 2635.71,
        },
      ],
      itemCount: 2,
      source: 'demo',
    });

    // High-value pending order delayed for > 48h
    this.orders.push({
      id: '10415',
      orderNumber: '10415',
      status: 'pending',
      createdAt: new Date(Date.now() - 56 * 3600 * 1000).toISOString(), // 56 hours ago!
      updatedAt: new Date(Date.now() - 56 * 3600 * 1000).toISOString(),
      currency: 'INR',
      total: '29998.00',
      totalAmount: 29998.0,
      customerNameMasked: 'Aditya B.',
      customerCity: 'New Delhi',
      paymentMethodTitle: 'Net Banking',
      items: [
        {
          id: 'li-415-1',
          productId: '108',
          sku: 'SKU-990',
          name: 'Thunderbolt 4 Docking Station 12-in-1',
          quantity: 2,
          subtotal: '29998.00',
          total: '29998.00',
          price: 14999.0,
        },
      ],
      itemCount: 2,
      source: 'demo',
    });

    // Order containing out-of-stock SKU-109
    this.orders.push({
      id: '10433',
      orderNumber: '10433',
      status: 'processing',
      createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
      currency: 'INR',
      total: '8598.00',
      totalAmount: 8598.0,
      customerNameMasked: 'Kavita D.',
      customerCity: 'Hyderabad',
      paymentMethodTitle: 'Razorpay UPI',
      items: [
        {
          id: 'li-433-1',
          productId: '102',
          sku: 'SKU-109',
          name: 'Tactile Pro Mechanical Keyboard RGB',
          quantity: 2, // Out of stock product
          subtotal: '8598.00',
          total: '8598.00',
          price: 4299.0,
        },
      ],
      itemCount: 2,
      source: 'demo',
    });

    // Order containing SKU-777 (low stock: only 2 available, order needs 3)
    this.orders.push({
      id: '10450',
      orderNumber: '10450',
      status: 'pending',
      createdAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 19 * 3600 * 1000).toISOString(),
      currency: 'INR',
      total: '7497.00',
      totalAmount: 7497.0,
      customerNameMasked: 'Siddharth T.',
      customerCity: 'Pune',
      paymentMethodTitle: 'UPI QR',
      items: [
        {
          id: 'li-450-1',
          productId: '106',
          sku: 'SKU-777',
          name: 'AeroStand Aluminium Laptop Riser',
          quantity: 3,
          subtotal: '7497.00',
          total: '7497.00',
          price: 2499.0,
        },
      ],
      itemCount: 3,
      source: 'demo',
    });

    // Generate remaining 45 realistic orders to total 50
    const statuses = ['completed', 'completed', 'completed', 'processing', 'completed', 'cancelled', 'on-hold', 'pending'];
    for (let i = 6; i <= 50; i++) {
      const orderNum = (10400 + i).toString();
      const status = statuses[i % statuses.length];
      const hoursAgo = (i * 3) % 120 + 2;
      const product = this.products[i % this.products.length];
      const quantity = (i % 3) + 1;
      const price = parseFloat(product.price);
      const totalAmount = price * quantity;

      this.orders.push({
        id: orderNum,
        orderNumber: orderNum,
        status,
        createdAt: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - (hoursAgo - 1) * 3600 * 1000).toISOString(),
        currency: 'INR',
        total: totalAmount.toFixed(2),
        totalAmount,
        customerNameMasked: customerNames[i % customerNames.length],
        customerCity: cities[i % cities.length],
        paymentMethodTitle: i % 2 === 0 ? 'Razorpay UPI' : 'Razorpay Cards',
        items: [
          {
            id: `li-${orderNum}-1`,
            productId: product.id,
            sku: product.sku,
            name: product.name,
            quantity,
            subtotal: totalAmount.toFixed(2),
            total: totalAmount.toFixed(2),
            price,
          },
        ],
        itemCount: quantity,
        source: 'demo',
      });
    }

    // Sort descending by order ID / created date
    this.orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async testConnection(): Promise<SanitizedConnectionStatus> {
    return {
      connected: true,
      store: 'Apex Retail India (Synthetic Store)',
      storeUrl: 'https://demo-store.razorops.internal',
      mode: 'demo',
      permissions: ['read_orders', 'read_products', 'read_inventory'],
      apiVersion: 'wc/v3 (Synthetic)',
      accessibleResources: {
        orders: true,
        products: true,
        inventory: true,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  async searchOrders(filters: OrderSearchFilters = {}): Promise<PaginatedResult<NormalizedOrder>> {
    let list = [...this.orders];

    if (filters.orderId) {
      list = list.filter((o) => o.id === filters.orderId || o.orderNumber === filters.orderId);
    }
    if (filters.status) {
      const target = filters.status.toLowerCase();
      list = list.filter((o) => o.status.toLowerCase() === target);
    }
    if (filters.sku) {
      const target = filters.sku.toLowerCase();
      list = list.filter((o) => o.items.some((item) => item.sku.toLowerCase() === target));
    }
    if (filters.product) {
      const target = filters.product.toLowerCase();
      list = list.filter((o) => o.items.some((item) => item.name.toLowerCase().includes(target)));
    }
    if (filters.customer) {
      const target = filters.customer.toLowerCase();
      list = list.filter((o) => o.customerNameMasked.toLowerCase().includes(target));
    }
    if (filters.minTotal !== undefined) {
      list = list.filter((o) => o.totalAmount >= (filters.minTotal || 0));
    }
    if (filters.maxTotal !== undefined) {
      list = list.filter((o) => o.totalAmount <= (filters.maxTotal || Infinity));
    }
    if (filters.after) {
      const afterTime = new Date(filters.after).getTime();
      list = list.filter((o) => new Date(o.createdAt).getTime() >= afterTime);
    }
    if (filters.before) {
      const beforeTime = new Date(filters.before).getTime();
      list = list.filter((o) => new Date(o.createdAt).getTime() <= beforeTime);
    }

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const total = list.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = list.slice(startIndex, startIndex + limit);

    return {
      data: paginated,
      count: paginated.length,
      total,
      page,
      perPage: limit,
      hasMore: page < totalPages,
      totalPages,
      source: 'demo',
    };
  }

  async getOrder(orderId: string): Promise<NormalizedOrder> {
    const found = this.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!found) {
      throw new ConnectorError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: `No order found with ID or order number "${orderId}".`,
        remedy: 'Verify the order number and check search_orders with status or date filters.',
      });
    }
    return found;
  }

  async searchProducts(filters: ProductSearchFilters = {}): Promise<PaginatedResult<NormalizedProduct>> {
    let list = [...this.products];

    if (filters.query) {
      const q = filters.query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    if (filters.sku) {
      const target = filters.sku.toLowerCase();
      list = list.filter((p) => p.sku.toLowerCase() === target);
    }
    if (filters.stockStatus) {
      const target = filters.stockStatus.toLowerCase();
      list = list.filter((p) => p.stockStatus.toLowerCase() === target);
    }

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const total = list.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = list.slice(startIndex, startIndex + limit);

    return {
      data: paginated,
      count: paginated.length,
      total,
      page,
      perPage: limit,
      hasMore: page < totalPages,
      totalPages,
      source: 'demo',
    };
  }

  async getProduct(params: { productId?: string; sku?: string }): Promise<NormalizedProduct> {
    let found: NormalizedProduct | undefined;
    if (params.productId) {
      found = this.products.find((p) => p.id === params.productId);
    }
    if (!found && params.sku) {
      found = this.products.find((p) => p.sku.toLowerCase() === params.sku!.toLowerCase());
    }
    if (!found) {
      throw new ConnectorError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: `Product not found with parameters: ${JSON.stringify(params)}`,
        remedy: 'Use search_products with a partial name or SKU query to locate available items.',
      });
    }
    return found;
  }

  async getInventorySnapshot(skus: string[]): Promise<Map<string, { stockQuantity: number | null; stockStatus: string; name: string }>> {
    const map = new Map<string, { stockQuantity: number | null; stockStatus: string; name: string }>();
    const lowerSkus = new Set(skus.map((s) => s.toLowerCase()));

    for (const p of this.products) {
      if (lowerSkus.has(p.sku.toLowerCase())) {
        map.set(p.sku, {
          stockQuantity: p.stockQuantity,
          stockStatus: p.stockStatus,
          name: p.name,
        });
      }
    }
    return map;
  }
}
