import crypto from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DemoProvider } from '../src/providers/demo.provider.js';
import { createApp } from '../src/server.js';
import { verifyWebhookSignature } from '../src/webhooks/webhook.handler.js';

describe('WEBHOOK INGESTION & IDEMPOTENCY SUITE', () => {
  const app = createApp(new DemoProvider());
  const secret = 'webhook_secret_key_testing_123';

  it('35. should verify valid HMAC-SHA256 signature helper', () => {
    const payload = JSON.stringify({ id: 10482, status: 'processing' });
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64');

    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(payload, 'invalid_sig', secret)).toBe(false);
  });

  it('36. should accept valid webhook event and record it in database', async () => {
    const eventId = `evt_${Date.now()}_1`;
    const payload = { id: 10482, status: 'processing', total: '18450.00' };

    const res = await request(app)
      .post('/api/webhooks/woocommerce')
      .set('x-wc-webhook-topic', 'order.updated')
      .set('x-wc-webhook-id', eventId)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PROCESSED');
    expect(res.body.topic).toBe('order.updated');
  });

  it('37. should enforce idempotency on duplicate webhook events', async () => {
    const eventId = `evt_dup_${Date.now()}`;
    const payload = { id: 10491, status: 'processing', total: '5271.42' };

    // First arrival
    const res1 = await request(app)
      .post('/api/webhooks/woocommerce')
      .set('x-wc-webhook-topic', 'order.created')
      .set('x-wc-webhook-id', eventId)
      .send(payload);
    expect(res1.status).toBe(201);
    expect(res1.body.status).toBe('PROCESSED');

    // Duplicate arrival
    const res2 = await request(app)
      .post('/api/webhooks/woocommerce')
      .set('x-wc-webhook-topic', 'order.created')
      .set('x-wc-webhook-id', eventId)
      .send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('DUPLICATE');
    expect(res2.body.message).toContain('Idempotency preserved');
  });
});
