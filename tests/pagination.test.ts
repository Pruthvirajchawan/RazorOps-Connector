import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { WooCommerceClient } from '../src/client/woocommerce.client.js';
import { DemoProvider } from '../src/providers/demo.provider.js';
import { createApp } from '../src/server.js';

describe('PAGINATION TEST SUITE', () => {
  const provider = new DemoProvider();
  const app = createApp(provider);

  it('16. should retrieve page 1 with bounded limit', async () => {
    const res = await request(app).get('/api/orders?page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.perPage).toBe(5);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.hasMore).toBe(true);
  });

  it('17. should retrieve page 2 with different records', async () => {
    const res1 = await request(app).get('/api/orders?page=1&limit=5');
    const res2 = await request(app).get('/api/orders?page=2&limit=5');

    expect(res1.body.data).toHaveLength(5);
    expect(res2.body.data).toHaveLength(5);
    expect(res1.body.data[0].id).not.toBe(res2.body.data[0].id);
  });

  it('18. should cap limit to maximum safe limit (100)', async () => {
    const res = await request(app).get('/api/orders?page=1&limit=500');
    expect(res.status).toBe(200);
    expect(res.body.perPage).toBeLessThanOrEqual(100);
  });

  it('19. should enforce maxPages limit in WooCommerceClient when requested page is beyond bounds', async () => {
    const client = new WooCommerceClient({
      storeUrl: 'https://example.com',
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test',
      maxPages: 10,
    });

    await expect(client.searchOrders({ page: 15 })).rejects.toThrow(/exceeds the maximum safe limit/);
  });
});
