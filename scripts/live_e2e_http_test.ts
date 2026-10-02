import crypto from 'node:crypto';

async function testLiveServer() {
  console.log('================================================================');
  console.log('🌐 EXECUTING LIVE HTTP END-TO-END TEST ON http://localhost:3000');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function report(name: string, ok: boolean, detail = '') {
    if (ok) {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ✕ [FAIL] ${name} ${detail ? '-> ' + detail : ''}`);
      failed++;
    }
  }

  // 1. Health Endpoint
  console.log('1. Health Check (GET /api/health)');
  const healthRes = await fetch('http://localhost:3000/api/health');
  const healthData = await healthRes.json() as any;
  report('Health HTTP status is 200', healthRes.status === 200);
  report('Health environment is demo', healthData.environment === 'demo');
  report('Health readOnly is true', healthData.readOnly === true);

  // 2. Connection Handshake
  console.log('\n2. Connection Handshake (POST /api/connection/test)');
  const connRes = await fetch('http://localhost:3000/api/connection/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeUrl: 'https://demo-store.razorops.internal',
      consumerKey: 'ck_test_read_key',
      consumerSecret: 'cs_test_read_secret',
      isDemo: true,
    }),
  });
  const connData = await connRes.json() as any;
  report('Connection test status is 200', connRes.status === 200);
  report('Connected flag is true', connData.connected === true);
  report('Permissions include read_orders', connData.permissions?.includes('read_orders'));
  report('Zero secret leakage (consumerSecret omitted)', !connData.consumerSecret && !connData.consumer_secret);

  // 3. SSRF Protection
  console.log('\n3. SSRF Protection (POST /api/connection/test with 169.254.169.254)');
  const ssrfRes = await fetch('http://localhost:3000/api/connection/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeUrl: 'https://169.254.169.254/latest/meta-data',
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test',
    }),
  });
  const ssrfData = await ssrfRes.json() as any;
  report('SSRF attack blocked with HTTP 500/400', ssrfRes.status >= 400);
  report('SSRF error code returned', ssrfData.error === 'SSRF_DETECTED');

  // 4. Orders API
  console.log('\n4. Orders API (GET /api/orders & /api/orders/10482)');
  const ordersRes = await fetch('http://localhost:3000/api/orders?status=processing&limit=5');
  const ordersData = await ordersRes.json() as any;
  report('Orders query status is 200', ordersRes.status === 200);
  report('Retrieved processing orders', ordersData.data?.length > 0);

  const order482Res = await fetch('http://localhost:3000/api/orders/10482');
  const order482Data = await order482Res.json() as any;
  report('Order #10482 retrieved', order482Data.id === '10482');
  report('Order #10482 customer name masked', order482Data.customerNameMasked === 'Vikram P.');
  report('Order #10482 contains SKU-483 (qty: 7)', order482Data.items?.[0]?.sku === 'SKU-483' && order482Data.items?.[0]?.quantity === 7);

  // 5. Products API
  console.log('\n5. Products API (GET /api/products?sku=SKU-483)');
  const prodRes = await fetch('http://localhost:3000/api/products?sku=SKU-483');
  const prodData = await prodRes.json() as any;
  report('Product search status is 200', prodRes.status === 200);
  report('Product SKU-483 found with stock quantity = 4', prodData.data?.[0]?.stockQuantity === 4);

  // 6. Attention Queue & Evidence
  console.log('\n6. Operational Attention Queue (GET /api/attention)');
  const attnRes = await fetch('http://localhost:3000/api/attention');
  const attnData = await attnRes.json() as any;
  report('Attention queue status is 200', attnRes.status === 200);
  const flagged482 = attnData.items?.find((i: any) => i.orderId === '10482');
  report('Attention queue flags Order #10482', !!flagged482);
  report('Flag reason identifies SKU-483 shortage', flagged482?.reason?.includes('SKU-483'));
  report('Flag impact states potential fulfillment risk', flagged482?.potentialImpact?.includes('Potential fulfillment risk'));
  report('Flag contains multi-source evidence', flagged482?.evidence?.length >= 2);

  // 7. Agent Operations Chat
  console.log('\n7. Agent Operations Chat (POST /api/agent/chat)');
  const chatRes1 = await fetch('http://localhost:3000/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What orders need my attention today?' }),
  });
  const chatData1 = await chatRes1.json() as any;
  report('Agent chat query 1 status is 200', chatRes1.status === 200);
  report('Agent invoked find_orders_needing_attention', chatData1.toolCallsMade?.includes('find_orders_needing_attention'));
  report('Agent returned formatted evidence answer', chatData1.answer?.includes('Order #10482') && chatData1.answer?.includes('Evidence:'));

  const chatRes2 = await fetch('http://localhost:3000/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Show me all other orders affected by SKU-483' }),
  });
  const chatData2 = await chatRes2.json() as any;
  report('Agent chat query 2 status is 200', chatRes2.status === 200);
  report('Agent invoked search_orders with SKU-483', chatData2.toolCallsMade?.includes('search_orders'));
  report('Agent identified affected orders', chatData2.orders?.length > 0);

  // 8. MCP Direct Tool Execution
  console.log('\n8. MCP Direct Tool Execution (POST /api/mcp/execute)');
  const mcpRes = await fetch('http://localhost:3000/api/mcp/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'find_low_stock_products',
      arguments: { threshold: 4, limit: 3 },
    }),
  });
  const mcpData = await mcpRes.json() as any;
  report('MCP execute status is 200', mcpRes.status === 200);
  report('MCP tool execution returned low-stock products', mcpData.result?.products?.length > 0);

  // 9. Webhook Ingestion & Idempotency
  console.log('\n9. Webhook Ingestion & Idempotency (POST /api/webhooks/woocommerce)');
  const eventId = `live_test_evt_${Date.now()}`;
  const webhookBody = { id: 10482, status: 'processing', total: '18450.00' };

  const wh1 = await fetch('http://localhost:3000/api/webhooks/woocommerce', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wc-webhook-topic': 'order.updated',
      'x-wc-webhook-id': eventId,
    },
    body: JSON.stringify(webhookBody),
  });
  const wh1Data = await wh1.json() as any;
  report('First webhook arrival status is 201', wh1.status === 201);
  report('First webhook status is PROCESSED', wh1Data.status === 'PROCESSED');

  const wh2 = await fetch('http://localhost:3000/api/webhooks/woocommerce', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wc-webhook-topic': 'order.updated',
      'x-wc-webhook-id': eventId,
    },
    body: JSON.stringify(webhookBody),
  });
  const wh2Data = await wh2.json() as any;
  report('Duplicate webhook arrival status is 200 (idempotent)', wh2.status === 200);
  report('Duplicate webhook status is DUPLICATE', wh2Data.status === 'DUPLICATE');

  // 10. Audit Log Engine
  console.log('\n10. Audit Log Engine (GET /api/audit)');
  const auditRes = await fetch('http://localhost:3000/api/audit?limit=5');
  const auditData = await auditRes.json() as any;
  report('Audit endpoint status is 200', auditRes.status === 200);
  report('Audit logs recorded in SQLite database', auditData.logs?.length > 0);

  console.log('\n================================================================');
  console.log(`🏁 LIVE END-TO-END VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

testLiveServer().catch((err) => {
  console.error('Fatal live test error:', err);
  process.exit(1);
});
