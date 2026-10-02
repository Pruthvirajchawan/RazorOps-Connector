import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WooCommerceClient } from '../src/client/woocommerce.client.js';
import { ConnectorError } from '../src/domain/errors.js';

describe('RATE LIMIT & RETRY ENGINE TEST SUITE', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('20. should retry on 429 and succeed if subsequent request succeeds', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ code: 'woocommerce_rate_limit', message: 'Slow down' }), {
          status: 429,
          headers: { 'Retry-After': '0' },
        });
      }
      return new Response(JSON.stringify([{ id: 10482, status: 'processing', line_items: [] }]), {
        status: 200,
        headers: { 'X-WP-Total': '1', 'X-WP-TotalPages': '1' },
      });
    });

    const client = new WooCommerceClient({
      storeUrl: 'https://example.com',
      consumerKey: 'ck_mock',
      consumerSecret: 'cs_mock',
      maxRetries: 3,
    });

    const result = await client.searchOrders();
    expect(callCount).toBe(2);
    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe('10482');
  });

  it('21. should exhaust retries on continuous 429 and throw RATE_LIMITED with explanation', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return new Response(JSON.stringify({ message: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'Retry-After': '0' },
      });
    });

    const client = new WooCommerceClient({
      storeUrl: 'https://example.com',
      consumerKey: 'ck_mock',
      consumerSecret: 'cs_mock',
      maxRetries: 2,
    });

    try {
      await client.searchOrders();
      expect.fail('Expected RATE_LIMITED error');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConnectorError);
      expect(err.code).toBe('RATE_LIMITED');
      expect(err.statusCode).toBe(429);
      expect(err.message).toContain('rate-limited');
      expect(err.remedy).toBeDefined();
      expect(callCount).toBe(2);
    }
  });

  it('22. should not retry on non-retryable 401 Authentication Error', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return new Response(JSON.stringify({ code: 'woocommerce_rest_cannot_view', message: 'Invalid credentials' }), {
        status: 401,
      });
    });

    const client = new WooCommerceClient({
      storeUrl: 'https://example.com',
      consumerKey: 'ck_bad',
      consumerSecret: 'cs_bad',
      maxRetries: 3,
    });

    try {
      await client.searchOrders();
      expect.fail('Expected AUTHENTICATION_ERROR');
    } catch (err: any) {
      expect(err.code).toBe('AUTHENTICATION_ERROR');
      expect(callCount).toBe(1); // Never retry 401!
    }
  });
});
