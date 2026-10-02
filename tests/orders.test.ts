import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DemoProvider } from '../src/providers/demo.provider.js';
import { createApp } from '../src/server.js';

describe('ORDERS RETRIEVAL & FILTERING SUITE', () => {
  const provider = new DemoProvider();
  const app = createApp(provider);

  it('5. should retrieve order by ID successfully', async () => {
    const res = await request(app).get('/api/orders/10482');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('10482');
    expect(res.body.status).toBe('processing');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].sku).toBe('SKU-483');
  });

  it('6. should return 404 for nonexistent order ID', async () => {
    const res = await request(app).get('/api/orders/99999999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.message).toContain('99999999');
  });

  it('7. should filter orders by status (e.g. processing)', async () => {
    const res = await request(app).get('/api/orders?status=processing');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const order of res.body.data) {
      expect(order.status).toBe('processing');
    }
  });

  it('8. should filter orders by SKU (e.g. SKU-483)', async () => {
    const res = await request(app).get('/api/orders?sku=SKU-483');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    for (const order of res.body.data) {
      const hasSku = order.items.some((i: any) => i.sku === 'SKU-483');
      expect(hasSku).toBe(true);
    }
  });

  it('9. should filter orders by minimum total amount (e.g. >= 10000)', async () => {
    const res = await request(app).get('/api/orders?minTotal=10000');
    expect(res.status).toBe(200);
    for (const order of res.body.data) {
      expect(order.totalAmount).toBeGreaterThanOrEqual(10000);
    }
  });

  it('10. should mask customer name and omit credit card/payment tokens', async () => {
    const res = await request(app).get('/api/orders/10482');
    expect(res.status).toBe(200);
    // Masked name format "First L."
    expect(res.body.customerNameMasked).toMatch(/^[A-Z][a-z]+ [A-Z]\.$/);
    expect(res.body).not.toHaveProperty('billing_address');
    expect(res.body).not.toHaveProperty('credit_card');
    expect(res.body).not.toHaveProperty('cvv');
  });
});
