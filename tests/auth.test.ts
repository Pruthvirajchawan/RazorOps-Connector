import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DemoProvider } from '../src/providers/demo.provider.js';
import { createApp } from '../src/server.js';

describe('AUTHENTICATION & CONNECTION SUITE', () => {
  const app = createApp(new DemoProvider());

  it('1. should verify valid demo connection and return sanitized status without credentials', async () => {
    const res = await request(app)
      .post('/api/connection/test')
      .send({
        storeUrl: 'https://demo-store.razorops.internal',
        consumerKey: 'ck_test_1234567890abcdef',
        consumerSecret: 'cs_test_abcdef1234567890',
        isDemo: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.mode).toBe('demo');
    expect(res.body.permissions).toContain('read_orders');
    expect(res.body.permissions).toContain('read_products');
    // Ensure consumer secret is NEVER returned
    expect(res.body).not.toHaveProperty('consumerSecret');
    expect(res.body).not.toHaveProperty('consumer_secret');
    expect(JSON.stringify(res.body)).not.toContain('cs_test_abcdef1234567890');
  });

  it('2. should reject connection test with missing credentials', async () => {
    const res = await request(app)
      .post('/api/connection/test')
      .send({
        storeUrl: 'https://demo-store.razorops.internal',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('3. should reject connection test with invalid URL format', async () => {
    const res = await request(app)
      .post('/api/connection/test')
      .send({
        storeUrl: 'not-a-valid-url',
        consumerKey: 'ck_test_1234',
        consumerSecret: 'cs_test_5678',
      });

    expect(res.status).toBe(400);
  });

  it('4. should return connection details from GET /api/connection without exposing secrets', async () => {
    const res = await request(app).get('/api/connection');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('activeMode');
    expect(res.body).toHaveProperty('status');
    expect(JSON.stringify(res.body)).not.toContain('cs_test_');
  });
});
