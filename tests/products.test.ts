import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { executeMcpTool } from '../src/mcp/tools.js';
import { DemoProvider } from '../src/providers/demo.provider.js';
import { createApp } from '../src/server.js';

describe('PRODUCTS & INVENTORY TEST SUITE', () => {
  const provider = new DemoProvider();
  const app = createApp(provider);

  it('11. should search products by name query', async () => {
    const res = await request(app).get('/api/products?query=Headphones');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].name).toContain('Headphones');
    expect(res.body.data[0].sku).toBe('SKU-483');
  });

  it('12. should lookup product by SKU', async () => {
    const res = await request(app).get('/api/products?sku=SKU-109');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].sku).toBe('SKU-109');
    expect(res.body.data[0].stockStatus).toBe('outofstock');
  });

  it('13. should filter products by stock status (e.g. outofstock)', async () => {
    const res = await request(app).get('/api/products?stockStatus=outofstock');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const prod of res.body.data) {
      expect(prod.stockStatus).toBe('outofstock');
    }
  });

  it('14. should identify low stock products via MCP tool find_low_stock_products', async () => {
    const result = (await executeMcpTool('find_low_stock_products', { threshold: 4 }, provider)) as {
      products: Array<{ sku: string; currentStock: number | null }>;
      threshold: number;
    };

    expect(result.threshold).toBe(4);
    expect(result.products.length).toBeGreaterThan(0);
    for (const p of result.products) {
      if (p.currentStock !== null) {
        expect(p.currentStock).toBeLessThanOrEqual(4);
      }
    }
  });

  it('15. should return 404 for nonexistent product ID', async () => {
    const res = await request(app).get('/api/products/9999999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
