import { AttentionItem, AttentionPriority, EvidenceItem } from '../domain/types.js';
import { rootLogger } from '../logging/logger.js';
import { MerchantDataProvider } from '../providers/provider.interface.js';

export interface AttentionEngineOptions {
  pendingHoursThreshold?: number;
  highValueThreshold?: number;
  maxOrdersToAnalyze?: number;
}

export class AttentionEngine {
  private pendingHoursThreshold: number;
  private highValueThreshold: number;
  private maxOrdersToAnalyze: number;

  constructor(options: AttentionEngineOptions = {}) {
    this.pendingHoursThreshold = options.pendingHoursThreshold ?? 48;
    this.highValueThreshold = options.highValueThreshold ?? 10000;
    this.maxOrdersToAnalyze = options.maxOrdersToAnalyze ?? 50;
  }

  async findOrdersNeedingAttention(
    provider: MerchantDataProvider,
    limit = 20,
    minPriority?: AttentionPriority
  ): Promise<{ items: AttentionItem[]; count: number; totalScanned: number }> {
    const startTime = Date.now();

    // 1. Fetch active orders (processing, pending, on-hold)
    const [pendingRes, processingRes, onHoldRes] = await Promise.all([
      provider.searchOrders({ status: 'pending', limit: this.maxOrdersToAnalyze }),
      provider.searchOrders({ status: 'processing', limit: this.maxOrdersToAnalyze }),
      provider.searchOrders({ status: 'on-hold', limit: this.maxOrdersToAnalyze }),
    ]);

    const activeOrders = [...processingRes.data, ...pendingRes.data, ...onHoldRes.data];

    // 2. Extract all distinct SKUs needed across these active orders
    const skuDemandMap = new Map<string, number>();
    for (const order of activeOrders) {
      for (const item of order.items) {
        const count = skuDemandMap.get(item.sku) || 0;
        skuDemandMap.set(item.sku, count + item.quantity);
      }
    }

    const uniqueSkus = Array.from(skuDemandMap.keys());

    // 3. Cross-resource retrieval: Fetch inventory snapshot for all referenced SKUs
    const inventorySnapshot = await provider.getInventorySnapshot(uniqueSkus);

    const attentionItems: AttentionItem[] = [];
    const now = Date.now();

    for (const order of activeOrders) {
      const orderAgeHours = (now - new Date(order.createdAt).getTime()) / (1000 * 3600);
      const isPending = order.status.toLowerCase() === 'pending';
      const isProcessing = order.status.toLowerCase() === 'processing';

      // SIGNAL 1: Cross-resource Inventory Shortage (Critical / High)
      for (const item of order.items) {
        const inv = inventorySnapshot.get(item.sku);
        if (!inv) continue;

        const isOutOfStock = inv.stockStatus === 'outofstock' || (inv.stockQuantity !== null && inv.stockQuantity <= 0);
        const hasShortage = inv.stockQuantity !== null && inv.stockQuantity < item.quantity;

        if (isOutOfStock) {
          const evidence: EvidenceItem[] = [
            {
              source: 'WooCommerce Order API',
              metric: `Required Quantity (${item.sku})`,
              value: item.quantity,
              thresholdOrExpected: 0,
              explanation: `Order #${order.orderNumber} line item requests ${item.quantity} units of "${item.name}".`,
            },
            {
              source: 'WooCommerce Product API',
              metric: `Available Stock (${item.sku})`,
              value: 0,
              thresholdOrExpected: 'Out of Stock',
              explanation: `Product catalog status indicates "${item.sku}" is completely out of stock.`,
            },
          ];

          attentionItems.push({
            id: `att-oos-${order.id}-${item.sku}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            priority: isProcessing ? 'critical' : 'high',
            status: order.status,
            total: `${order.currency} ${order.total}`,
            currency: order.currency,
            reason: `Order requires SKU "${item.sku}" which is currently out of stock.`,
            potentialImpact: 'Potential fulfillment risk: Unable to fulfill order without inventory replenishment.',
            affectedSkus: [item.sku],
            evidence,
            detectedAt: new Date().toISOString(),
          });
        } else if (hasShortage) {
          const deficit = item.quantity - (inv.stockQuantity ?? 0);
          const evidence: EvidenceItem[] = [
            {
              source: 'WooCommerce Order API',
              metric: `Required Quantity (${item.sku})`,
              value: item.quantity,
              thresholdOrExpected: inv.stockQuantity ?? 0,
              explanation: `Order #${order.orderNumber} requests ${item.quantity} units of ${item.sku}.`,
            },
            {
              source: 'WooCommerce Product API',
              metric: `Available Inventory (${item.sku})`,
              value: inv.stockQuantity ?? 0,
              thresholdOrExpected: item.quantity,
              explanation: `Current inventory snapshot shows only ${inv.stockQuantity} units available.`,
            },
            {
              source: 'Inventory Snapshot',
              metric: 'Inventory Deficit',
              value: `${deficit} units short`,
              thresholdOrExpected: '0 deficit',
              explanation: `Deficit of ${deficit} units between order demand (${item.quantity}) and stock (${inv.stockQuantity}).`,
            },
          ];

          attentionItems.push({
            id: `att-shortage-${order.id}-${item.sku}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            priority: isProcessing ? 'high' : 'medium',
            status: order.status,
            total: `${order.currency} ${order.total}`,
            currency: order.currency,
            reason: `Order contains SKU "${item.sku}" where required quantity (${item.quantity}) exceeds available inventory (${inv.stockQuantity}).`,
            potentialImpact: 'Potential fulfillment risk: Fulfillment may require merchant intervention or partial shipment.',
            affectedSkus: [item.sku],
            evidence,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      // SIGNAL 2: High-Value Pending Order
      if (isPending && order.totalAmount >= this.highValueThreshold) {
        const evidence: EvidenceItem[] = [
          {
            source: 'WooCommerce Order API',
            metric: 'Order Total Amount',
            value: `${order.currency} ${order.total}`,
            thresholdOrExpected: `${order.currency} ${this.highValueThreshold}`,
            explanation: `Order value of ${order.currency} ${order.total} exceeds merchant high-value threshold of ${order.currency} ${this.highValueThreshold}.`,
          },
          {
            source: 'Merchant Operational Rules',
            metric: 'Current Order Status',
            value: 'pending',
            thresholdOrExpected: 'processing / completed',
            explanation: 'Order is awaiting payment confirmation or manual clearance.',
          },
        ];

        attentionItems.push({
          id: `att-highvalue-${order.id}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          priority: 'high',
          status: order.status,
          total: `${order.currency} ${order.total}`,
          currency: order.currency,
          reason: `High-value order (${order.currency} ${order.total}) is in pending status.`,
          potentialImpact: 'Potential revenue risk: High-value transaction requires prompt checkout recovery or fraud verification.',
          affectedSkus: order.items.map((i) => i.sku),
          evidence,
          detectedAt: new Date().toISOString(),
        });
      }

      // SIGNAL 3: Long-Pending Order (> 48h)
      if (isPending && orderAgeHours >= this.pendingHoursThreshold) {
        const evidence: EvidenceItem[] = [
          {
            source: 'WooCommerce Order API',
            metric: 'Order Age',
            value: `${Math.round(orderAgeHours)} hours`,
            thresholdOrExpected: `${this.pendingHoursThreshold} hours max`,
            explanation: `Order was created on ${new Date(order.createdAt).toLocaleString()} and has remained in pending status for ${Math.round(orderAgeHours)} hours.`,
          },
        ];

        attentionItems.push({
          id: `att-stale-${order.id}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          priority: 'medium',
          status: order.status,
          total: `${order.currency} ${order.total}`,
          currency: order.currency,
          reason: `Order has been pending for ${Math.round(orderAgeHours)} hours (threshold: ${this.pendingHoursThreshold}h).`,
          potentialImpact: 'Potential abandoned checkout: Customer payment may have stalled or failed silently.',
          affectedSkus: order.items.map((i) => i.sku),
          evidence,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Priority rank order
    const priorityWeight: Record<AttentionPriority, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    let filtered = attentionItems.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

    if (minPriority) {
      const minWeight = priorityWeight[minPriority];
      filtered = filtered.filter((item) => priorityWeight[item.priority] >= minWeight);
    }

    const trimmed = filtered.slice(0, limit);

    rootLogger.info('Attention engine scan complete', {
      totalScanned: activeOrders.length,
      flagsIdentified: trimmed.length,
      durationMs: Date.now() - startTime,
    });

    return {
      items: trimmed,
      count: trimmed.length,
      totalScanned: activeOrders.length,
    };
  }
}

export const attentionEngine = new AttentionEngine();
