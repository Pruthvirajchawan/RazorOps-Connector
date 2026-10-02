import crypto from 'node:crypto';
import { executeMcpTool, MCP_TOOLS } from '../src/mcp/tools.js';
import { DemoProvider } from '../src/providers/demo.provider.js';
import { validateStoreUrl } from '../src/security/ssrf.js';
import { agentService } from '../src/services/agent.service.js';
import { attentionEngine } from '../src/services/attention.service.js';
import { verifyWebhookSignature, webhookHandler } from '../src/webhooks/webhook.handler.js';

async function runEndToEndVerification() {
  console.log('===========================================================');
  console.log('🚀 STARTING COMPREHENSIVE END-TO-END VERIFICATION');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ✕ [FAIL] ${name} ${details ? '- ' + details : ''}`);
      failed++;
    }
  }

  const provider = new DemoProvider();

  // 1. PROVIDER & CONNECTION
  console.log('--- 1. Testing Provider & Connection Handshake ---');
  const conn = await provider.testConnection();
  assert('Connection status is true', conn.connected === true);
  assert('Read permissions verified', conn.permissions.includes('read_orders'));
  assert('Orders resource accessible', conn.accessibleResources.orders === true);
  assert('Products resource accessible', conn.accessibleResources.products === true);
  assert('Inventory resource accessible', conn.accessibleResources.inventory === true);

  // 2. ORDERS RETRIEVAL & FILTERING
  console.log('\n--- 2. Testing Orders Primitives & Data Minimization ---');
  const allOrders = await provider.searchOrders({ limit: 50 });
  assert('Retrieved 50 synthetic orders', allOrders.total === 50 && allOrders.data.length === 50);

  const order482 = await provider.getOrder('10482');
  assert('Order #10482 retrieved', order482.id === '10482');
  assert('Order status is processing', order482.status === 'processing');
  assert('Order contains SKU-483', order482.items[0].sku === 'SKU-483');
  assert('Order demands 7 units of SKU-483', order482.items[0].quantity === 7);
  assert('Customer name is masked', order482.customerNameMasked === 'Vikram P.');
  assert('Payment credentials omitted', !('credit_card' in order482));

  const processingOrders = await provider.searchOrders({ status: 'processing' });
  assert('Status filter (processing) works', processingOrders.data.every((o) => o.status === 'processing'));

  const highValOrders = await provider.searchOrders({ minTotal: 10000 });
  assert('Amount filter (minTotal >= 10000) works', highValOrders.data.every((o) => o.totalAmount >= 10000));

  // 3. PRODUCTS & INVENTORY
  console.log('\n--- 3. Testing Products & Inventory Primitives ---');
  const prodSearch = await provider.searchProducts({ query: 'Headphones' });
  assert('Product search by query works', prodSearch.data.length > 0 && prodSearch.data[0].sku === 'SKU-483');

  const prodSku = await provider.getProduct({ sku: 'SKU-483' });
  assert('Product SKU lookup works', prodSku.sku === 'SKU-483');
  assert('Product stock quantity is 4', prodSku.stockQuantity === 4);

  const oosProd = await provider.getProduct({ sku: 'SKU-109' });
  assert('Out of stock product identified', oosProd.stockStatus === 'outofstock' && oosProd.stockQuantity === 0);

  const invSnapshot = await provider.getInventorySnapshot(['SKU-483', 'SKU-109', 'SKU-205']);
  assert('Inventory snapshot batch retrieval works', invSnapshot.size === 3);
  assert('Snapshot contains SKU-483 with 4 units', invSnapshot.get('SKU-483')?.stockQuantity === 4);

  // 4. CROSS-RESOURCE ATTENTION ENGINE & EVIDENCE
  console.log('\n--- 4. Testing Cross-Resource Attention & Evidence Engine ---');
  const attention = await attentionEngine.findOrdersNeedingAttention(provider, 20);
  assert('Attention items detected', attention.count > 0);

  const flagged482 = attention.items.find((i) => i.orderId === '10482');
  assert('Order #10482 flagged in attention queue', !!flagged482);
  assert('Flag priority is high or critical', flagged482?.priority === 'high' || flagged482?.priority === 'critical');
  assert('Flag reason cites SKU-483 shortage', flagged482?.reason.includes('SKU-483') ?? false);
  assert('Potential impact specifies potential risk', flagged482?.potentialImpact.includes('Potential fulfillment risk') ?? false);

  const evSources = flagged482?.evidence.map((e) => e.source);
  assert('Evidence includes WooCommerce Order API', evSources?.includes('WooCommerce Order API') ?? false);
  assert('Evidence includes WooCommerce Product API', evSources?.includes('WooCommerce Product API') ?? false);
  assert('Evidence includes Inventory Snapshot', evSources?.includes('Inventory Snapshot') ?? false);

  // 5. MCP TOOLS CATALOG
  console.log('\n--- 5. Testing MCP Protocol Tools ---');
  assert('All 6 MCP tools registered', MCP_TOOLS.length === 6);
  assert('Every tool declares readOnly: true', MCP_TOOLS.every((t) => t.readOnly === true));
  assert('Every tool declares READ_ permission', MCP_TOOLS.every((t) => t.permission.startsWith('READ_')));

  const mcpOrder = (await executeMcpTool('get_order', { orderId: '10482' }, provider)) as any;
  assert('MCP get_order executes cleanly', mcpOrder.id === '10482');

  const mcpLowStock = (await executeMcpTool('find_low_stock_products', { threshold: 4 }, provider)) as any;
  assert('MCP find_low_stock_products executes cleanly', mcpLowStock.products.length > 0);

  // 6. AGENT NATURAL LANGUAGE REASONING
  console.log('\n--- 6. Testing Agent Operations Reasoning ---');
  const agentAttn = await agentService.processQuery('What orders need my attention today?', provider);
  assert('Agent executed find_orders_needing_attention tool', agentAttn.toolCallsMade.includes('find_orders_needing_attention'));
  assert('Agent response mentions Order #10482', agentAttn.answer.includes('10482'));
  assert('Agent response includes verified evidence', agentAttn.answer.includes('Evidence:'));
  assert('Agent response created activity trace', agentAttn.activities.length >= 3);

  const agentSku = await agentService.processQuery('Find orders affected by SKU-483', provider);
  assert('Agent executed search_orders with SKU filter', agentSku.toolCallsMade.includes('search_orders'));
  assert('Agent retrieved orders for SKU-483', (agentSku.orders?.length ?? 0) > 0);

  const agentHighVal = await agentService.processQuery('Show highest-value pending order', provider);
  assert('Agent retrieved highest-value order', (agentHighVal.orders?.length ?? 0) > 0);
  const topPending = agentHighVal.orders?.[0];
  assert(`Highest-value pending order is #${topPending?.orderNumber} (${topPending?.total} INR)`, topPending?.totalAmount >= 20000);

  // 7. SECURITY & SSRF GUARDRAILS
  console.log('\n--- 7. Testing Security & SSRF Protection ---');
  let ssrfBlocked1 = false;
  try {
    await validateStoreUrl('https://169.254.169.254/latest/meta-data', false);
  } catch (err: any) {
    ssrfBlocked1 = err.code === 'SSRF_DETECTED';
  }
  assert('Cloud metadata IP (169.254.169.254) blocked', ssrfBlocked1);

  let ssrfBlocked2 = false;
  try {
    await validateStoreUrl('https://10.0.0.1/wp-json', false);
  } catch (err: any) {
    ssrfBlocked2 = err.code === 'SSRF_DETECTED';
  }
  assert('Private IP (10.0.0.1) blocked', ssrfBlocked2);

  let ssrfBlocked3 = false;
  try {
    await validateStoreUrl('file:///etc/passwd');
  } catch (err: any) {
    ssrfBlocked3 = err.code === 'SSRF_DETECTED';
  }
  assert('Non-HTTP protocol (file://) blocked', ssrfBlocked3);

  // 8. WEBHOOKS & IDEMPOTENCY
  console.log('\n--- 8. Testing Webhook HMAC-SHA256 & Idempotency ---');
  const secret = 'test_webhook_secret_key_123';
  const payloadStr = JSON.stringify({ id: 10482, status: 'processing' });
  const validSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64');

  assert('Valid HMAC signature passes verification', verifyWebhookSignature(payloadStr, validSig, secret));
  assert('Invalid signature fails verification', !verifyWebhookSignature(payloadStr, 'bad_sig', secret));

  const eventId = `e2e_event_${Date.now()}`;
  const firstIngest = webhookHandler.processWebhook(
    payloadStr,
    { signature: validSig, topic: 'order.updated', eventId },
    secret
  );
  assert('First webhook delivery processed', firstIngest.status === 'PROCESSED');

  const secondIngest = webhookHandler.processWebhook(
    payloadStr,
    { signature: validSig, topic: 'order.updated', eventId },
    secret
  );
  assert('Duplicate webhook delivery preserves idempotency', secondIngest.status === 'DUPLICATE');

  console.log('\n===========================================================');
  console.log(`🏁 END-TO-END VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runEndToEndVerification().catch((err) => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
