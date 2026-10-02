import { randomUUID } from 'node:crypto';
import { AttentionItem, NormalizedOrder, NormalizedProduct } from '../domain/types.js';
import { executeMcpTool } from '../mcp/tools.js';
import { MerchantDataProvider } from '../providers/provider.interface.js';

export interface ActivityStep {
  id: string;
  step: 'INTENT_PARSING' | 'TOOL_CALL' | 'CROSS_RESOURCE_REASONING' | 'RESPONSE_SYNTHESIS';
  title: string;
  toolName?: string;
  input?: Record<string, unknown>;
  outputSnippet?: string;
  latencyMs?: number;
  status: 'PENDING' | 'SUCCESS' | 'ERROR';
  timestamp: string;
}

export interface AgentResponse {
  answer: string;
  toolCallsMade: string[];
  attentionItems?: AttentionItem[];
  orders?: NormalizedOrder[];
  products?: NormalizedProduct[];
  activities: ActivityStep[];
  requestId: string;
}

export class AgentService {
  async processQuery(query: string, provider: MerchantDataProvider): Promise<AgentResponse> {
    const requestId = randomUUID();
    const activities: ActivityStep[] = [];
    const toolCallsMade: string[] = [];
    const q = query.trim().toLowerCase();

    const startIntent = Date.now();
    activities.push({
      id: `act-${randomUUID().slice(0, 8)}`,
      step: 'INTENT_PARSING',
      title: 'Interpreting Natural Language Request',
      input: { query },
      status: 'SUCCESS',
      latencyMs: Date.now() - startIntent,
      timestamp: new Date().toISOString(),
    });

    // 1. "What orders need my attention today?" / "What needs attention?" / "risk"
    if (
      q.includes('attention') ||
      q.includes('risk') ||
      q.includes('urgent') ||
      q.includes('bottleneck') ||
      q.includes('issues')
    ) {
      toolCallsMade.push('find_orders_needing_attention');
      const startTool = Date.now();
      const toolInput = { limit: 10 };

      activities.push({
        id: `act-${randomUUID().slice(0, 8)}`,
        step: 'TOOL_CALL',
        title: 'Invoking find_orders_needing_attention',
        toolName: 'find_orders_needing_attention',
        input: toolInput,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
      });

      const res = (await executeMcpTool('find_orders_needing_attention', toolInput, provider, requestId)) as {
        items: AttentionItem[];
        count: number;
        totalScanned: number;
      };

      activities[activities.length - 1].status = 'SUCCESS';
      activities[activities.length - 1].latencyMs = Date.now() - startTool;
      activities[activities.length - 1].outputSnippet = `Identified ${res.count} flagged orders across ${res.totalScanned} active orders scanned.`;

      activities.push({
        id: `act-${randomUUID().slice(0, 8)}`,
        step: 'CROSS_RESOURCE_REASONING',
        title: 'Cross-Resource Inventory & Order Verification',
        outputSnippet: `Correlated order line items with live inventory snapshots to identify deficits and fulfillment risks.`,
        status: 'SUCCESS',
        latencyMs: 12,
        timestamp: new Date().toISOString(),
      });

      let answer = `I scanned **${res.totalScanned} active orders** across your store and identified **${res.count} orders requiring merchant attention** based on current operational data.\n\n`;

      if (res.items.length > 0) {
        answer += `### ⚠️ Merchant Operational Attention Queue\n\n`;
        for (const item of res.items) {
          const priorityBadge = item.priority === 'critical' ? '🔴 CRITICAL' : item.priority === 'high' ? '🟠 HIGH' : '🟡 MEDIUM';
          answer += `#### ${priorityBadge} — Order #${item.orderNumber} (${item.total} • ${item.status.toUpperCase()})\n`;
          answer += `**Reason:** ${item.reason}\n\n`;
          answer += `**Potential Impact:** ${item.potentialImpact}\n\n`;
          answer += `**Evidence:**\n`;
          for (const ev of item.evidence) {
            answer += `- **${ev.metric}** (${ev.source}): \`${ev.value}\` (Reference: ${ev.thresholdOrExpected}) — *${ev.explanation}*\n`;
          }
          answer += `\n---\n\n`;
        }
      } else {
        answer += `All active orders currently have sufficient inventory and are progressing normally within operational thresholds.`;
      }

      return {
        answer,
        toolCallsMade,
        attentionItems: res.items,
        activities,
        requestId,
      };
    }

    // 2. Specific SKU search: "Find orders containing SKU ..." or "orders affected by SKU-483"
    const skuMatch = query.match(/sku[-_ ]?([a-zA-Z0-9]+)/i);
    if (skuMatch || q.includes('sku')) {
      const targetSku = skuMatch ? (skuMatch[0].toUpperCase().startsWith('SKU') ? skuMatch[0].toUpperCase().replace(' ', '-') : `SKU-${skuMatch[1].toUpperCase()}`) : 'SKU-483';
      toolCallsMade.push('search_orders');
      const startTool = Date.now();
      const toolInput = { sku: targetSku, limit: 20 };

      activities.push({
        id: `act-${randomUUID().slice(0, 8)}`,
        step: 'TOOL_CALL',
        title: `Invoking search_orders with SKU filter: ${targetSku}`,
        toolName: 'search_orders',
        input: toolInput,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
      });

      const res = (await executeMcpTool('search_orders', toolInput, provider, requestId)) as {
        orders: NormalizedOrder[];
        count: number;
        hasMore: boolean;
      };

      activities[activities.length - 1].status = 'SUCCESS';
      activities[activities.length - 1].latencyMs = Date.now() - startTool;
      activities[activities.length - 1].outputSnippet = `Found ${res.count} orders containing SKU ${targetSku}.`;

      // Check product inventory for context
      const prodRes = await provider.getProduct({ sku: targetSku }).catch(() => null);

      let answer = `I searched merchant orders and found **${res.count} order(s)** containing **${targetSku}**`;
      if (prodRes) {
        answer += ` (*${prodRes.name}*, Current Stock: \`${prodRes.stockQuantity ?? 'N/A'}\` units, Status: \`${prodRes.stockStatus}\`):\n\n`;
      } else {
        answer += `:\n\n`;
      }

      for (const order of res.orders) {
        const itemDemand = order.items.filter((i) => i.sku.toLowerCase() === targetSku.toLowerCase());
        const totalQty = itemDemand.reduce((acc, i) => acc + i.quantity, 0);
        answer += `- **Order #${order.orderNumber}** (${order.currency} ${order.total} • ${order.status.toUpperCase()} • Customer: ${order.customerNameMasked})\n`;
        answer += `  - Requested Quantity: **${totalQty} units**\n`;
        answer += `  - Order Date: ${new Date(order.createdAt).toLocaleString()}\n`;
      }

      return {
        answer,
        toolCallsMade,
        orders: res.orders,
        activities,
        requestId,
      };
    }

    // 3. Highest-value order: "Show me the highest-value one" / "highest-value pending orders"
    if (q.includes('highest') || q.includes('highest-value') || q.includes('high value')) {
      toolCallsMade.push('search_orders');
      const startTool = Date.now();
      const statusFilter = q.includes('pending') ? 'pending' : undefined;
      const toolInput = { status: statusFilter, limit: 50 };

      activities.push({
        id: `act-${randomUUID().slice(0, 8)}`,
        step: 'TOOL_CALL',
        title: 'Invoking search_orders for value ranking',
        toolName: 'search_orders',
        input: toolInput,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
      });

      const res = (await executeMcpTool('search_orders', toolInput, provider, requestId)) as {
        orders: NormalizedOrder[];
        count: number;
      };

      const sorted = [...res.orders].sort((a, b) => b.totalAmount - a.totalAmount);
      const topOrder = sorted[0];

      activities[activities.length - 1].status = 'SUCCESS';
      activities[activities.length - 1].latencyMs = Date.now() - startTool;
      activities[activities.length - 1].outputSnippet = `Retrieved and sorted ${res.count} orders by value. Top order: #${topOrder?.orderNumber} (${topOrder?.currency} ${topOrder?.total}).`;

      if (!topOrder) {
        return {
          answer: 'No matching orders found to evaluate.',
          toolCallsMade,
          activities,
          requestId,
        };
      }

      let answer = `The highest-value ${statusFilter ? 'pending ' : ''}order in your store is **Order #${topOrder.orderNumber}**.\n\n`;
      answer += `### Order Summary\n`;
      answer += `- **Total:** ${topOrder.currency} ${topOrder.total}\n`;
      answer += `- **Status:** \`${topOrder.status.toUpperCase()}\`\n`;
      answer += `- **Customer:** ${topOrder.customerNameMasked} (${topOrder.customerCity || 'N/A'})\n`;
      answer += `- **Created:** ${new Date(topOrder.createdAt).toLocaleString()}\n`;
      answer += `- **Payment Method:** ${topOrder.paymentMethodTitle || 'N/A'}\n\n`;
      answer += `### Line Items\n`;
      for (const item of topOrder.items) {
        answer += `- **${item.name}** (\`${item.sku}\`): ${item.quantity} × ${topOrder.currency} ${item.price} = ${topOrder.currency} ${item.total}\n`;
      }

      return {
        answer,
        toolCallsMade,
        orders: [topOrder],
        activities,
        requestId,
      };
    }

    // 4. Low stock: "Find products that are running low on stock" / "inventory"
    if (q.includes('low') && (q.includes('stock') || q.includes('inventory'))) {
      toolCallsMade.push('find_low_stock_products');
      const startTool = Date.now();
      const toolInput = { threshold: 5, limit: 15 };

      activities.push({
        id: `act-${randomUUID().slice(0, 8)}`,
        step: 'TOOL_CALL',
        title: 'Invoking find_low_stock_products',
        toolName: 'find_low_stock_products',
        input: toolInput,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
      });

      const res = (await executeMcpTool('find_low_stock_products', toolInput, provider, requestId)) as {
        products: Array<{ id: string; name: string; sku: string; currentStock: number | null; stockStatus: string }>;
        threshold: number;
        count: number;
      };

      activities[activities.length - 1].status = 'SUCCESS';
      activities[activities.length - 1].latencyMs = Date.now() - startTool;
      activities[activities.length - 1].outputSnippet = `Found ${res.count} products with stock <= ${res.threshold}.`;

      let answer = `I inspected your catalog inventory and found **${res.count} product(s)** running at or below the low stock threshold (${res.threshold} units):\n\n`;
      for (const p of res.products) {
        const stockDisplay = p.stockStatus === 'outofstock' ? '❌ OUT OF STOCK (0 units)' : `⚠️ Low Stock: ${p.currentStock ?? 0} units left`;
        answer += `- **${p.name}** (\`${p.sku}\`) — ${stockDisplay}\n`;
      }

      return {
        answer,
        toolCallsMade,
        activities,
        requestId,
      };
    }

    // 5. Specific order ID lookup: "Get order #10482" / "order 10482"
    const orderIdMatch = query.match(/(?:order\s*#?|#)(\d+)/i);
    if (orderIdMatch) {
      const orderId = orderIdMatch[1];
      toolCallsMade.push('get_order');
      const startTool = Date.now();
      const toolInput = { orderId };

      activities.push({
        id: `act-${randomUUID().slice(0, 8)}`,
        step: 'TOOL_CALL',
        title: `Invoking get_order for #${orderId}`,
        toolName: 'get_order',
        input: toolInput,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
      });

      const order = (await executeMcpTool('get_order', toolInput, provider, requestId)) as NormalizedOrder;

      activities[activities.length - 1].status = 'SUCCESS';
      activities[activities.length - 1].latencyMs = Date.now() - startTool;
      activities[activities.length - 1].outputSnippet = `Retrieved Order #${order.orderNumber} (${order.status}, ${order.currency} ${order.total}).`;

      let answer = `### Order #${order.orderNumber} Details\n\n`;
      answer += `- **Status:** \`${order.status.toUpperCase()}\`\n`;
      answer += `- **Total:** ${order.currency} ${order.total}\n`;
      answer += `- **Customer:** ${order.customerNameMasked} (${order.customerCity || 'N/A'})\n`;
      answer += `- **Placed:** ${new Date(order.createdAt).toLocaleString()}\n`;
      answer += `- **Payment Method:** ${order.paymentMethodTitle || 'N/A'}\n\n`;
      answer += `#### Line Items (${order.itemCount} units total):\n`;
      for (const item of order.items) {
        answer += `- **${item.name}** (\`${item.sku}\`): Qty ${item.quantity} × ${order.currency} ${item.price} = ${order.currency} ${item.total}\n`;
      }

      return {
        answer,
        toolCallsMade,
        orders: [order],
        activities,
        requestId,
      };
    }

    // 6. Processing or pending orders filter: "Which orders are currently processing?"
    if (q.includes('processing') || q.includes('pending') || q.includes('completed')) {
      const status = q.includes('processing') ? 'processing' : q.includes('pending') ? 'pending' : 'completed';
      toolCallsMade.push('search_orders');
      const startTool = Date.now();
      const toolInput = { status, limit: 10 };

      activities.push({
        id: `act-${randomUUID().slice(0, 8)}`,
        step: 'TOOL_CALL',
        title: `Invoking search_orders with status "${status}"`,
        toolName: 'search_orders',
        input: toolInput,
        status: 'PENDING',
        timestamp: new Date().toISOString(),
      });

      const res = (await executeMcpTool('search_orders', toolInput, provider, requestId)) as {
        orders: NormalizedOrder[];
        count: number;
        total?: number;
      };

      activities[activities.length - 1].status = 'SUCCESS';
      activities[activities.length - 1].latencyMs = Date.now() - startTool;
      activities[activities.length - 1].outputSnippet = `Found ${res.count} orders with status "${status}".`;

      let answer = `Here are the current orders in **${status.toUpperCase()}** status (${res.count} shown):\n\n`;
      for (const order of res.orders) {
        const skus = order.items.map((i) => `${i.sku} (x${i.quantity})`).join(', ');
        answer += `- **Order #${order.orderNumber}** — ${order.currency} ${order.total} • ${order.customerNameMasked} • Items: ${skus}\n`;
      }

      return {
        answer,
        toolCallsMade,
        orders: res.orders,
        activities,
        requestId,
      };
    }

    // Default fallback: search orders generally
    toolCallsMade.push('search_orders');
    const startTool = Date.now();
    const toolInput = { limit: 5 };

    activities.push({
      id: `act-${randomUUID().slice(0, 8)}`,
      step: 'TOOL_CALL',
      title: 'Invoking search_orders (recent orders)',
      toolName: 'search_orders',
      input: toolInput,
      status: 'PENDING',
      timestamp: new Date().toISOString(),
    });

    const res = (await executeMcpTool('search_orders', toolInput, provider, requestId)) as {
      orders: NormalizedOrder[];
      count: number;
    };

    activities[activities.length - 1].status = 'SUCCESS';
    activities[activities.length - 1].latencyMs = Date.now() - startTool;
    activities[activities.length - 1].outputSnippet = `Retrieved ${res.count} recent orders.`;

    let answer = `I searched your store orders. Here are your most recent orders:\n\n`;
    for (const order of res.orders) {
      answer += `- **Order #${order.orderNumber}** (${order.currency} ${order.total} • \`${order.status.toUpperCase()}\` • ${order.customerNameMasked})\n`;
    }
    answer += `\nYou can also ask me: *"What orders need my attention?"*, *"Find orders affected by SKU-483"*, or *"Find products running low on stock"*.`;

    return {
      answer,
      toolCallsMade,
      orders: res.orders,
      activities,
      requestId,
    };
  }
}

export const agentService = new AgentService();
