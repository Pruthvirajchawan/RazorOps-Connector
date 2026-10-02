import { describe, expect, it } from 'vitest';
import { DemoProvider } from '../src/providers/demo.provider.js';
import { attentionEngine } from '../src/services/attention.service.js';

describe('ATTENTION ENGINE & EVIDENCE VERIFICATION SUITE', () => {
  const provider = new DemoProvider();

  it('31. should identify signature Order #10482 in attention queue due to SKU-483 inventory deficit', async () => {
    const result = await attentionEngine.findOrdersNeedingAttention(provider);
    expect(result.count).toBeGreaterThan(0);

    const order482 = result.items.find((i) => i.orderId === '10482' || i.orderNumber === '10482');
    expect(order482).toBeDefined();
    expect(order482?.affectedSkus).toContain('SKU-483');
    expect(order482?.potentialImpact).toContain('Potential fulfillment risk');
    expect(order482?.priority).toMatch(/high|critical/);
  });

  it('32. should attach rigorous multi-source evidence for Order #10482', async () => {
    const result = await attentionEngine.findOrdersNeedingAttention(provider);
    const order482 = result.items.find((i) => i.orderId === '10482');
    expect(order482).toBeDefined();

    const evidenceSources = order482?.evidence.map((e) => e.source);
    expect(evidenceSources).toContain('WooCommerce Order API');
    expect(evidenceSources).toContain('WooCommerce Product API');

    // Check quantity check: Required 7, Available 4
    const orderEv = order482?.evidence.find((e) => e.source === 'WooCommerce Order API');
    const prodEv = order482?.evidence.find((e) => e.source === 'WooCommerce Product API');

    expect(orderEv?.value).toBe(7);
    expect(prodEv?.value).toBe(4);
    expect(order482?.reason).toContain('SKU-483');
  });

  it('33. should flag high-value pending order (e.g. Order #10415 >= 10,000)', async () => {
    const result = await attentionEngine.findOrdersNeedingAttention(provider);
    const highVal = result.items.find((i) => i.orderId === '10415');
    expect(highVal).toBeDefined();
    expect(highVal?.priority).toBe('high');
    expect(highVal?.reason).toContain('High-value order');
  });

  it('34. should flag out-of-stock items in processing orders (e.g. Order #10433 with SKU-109)', async () => {
    const result = await attentionEngine.findOrdersNeedingAttention(provider);
    const oos = result.items.find((i) => i.orderId === '10433');
    expect(oos).toBeDefined();
    expect(oos?.priority).toBe('critical');
    expect(oos?.affectedSkus).toContain('SKU-109');
  });
});
