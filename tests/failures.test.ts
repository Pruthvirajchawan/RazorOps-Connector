import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WooCommerceClient } from '../src/client/woocommerce.client.js';
import { ConnectorError } from '../src/domain/errors.js';

describe('UPSTREAM FAILURES & TIMEOUT TEST SUITE', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('23. should handle upstream 500 server error after exhausting retries', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    });

    const client = new WooCommerceClient({
      storeUrl: 'https://example.com',
      consumerKey: 'ck_mock',
      consumerSecret: 'cs_mock',
      maxRetries: 2,
    });

    try {
      await client.searchOrders();
      expect.fail('Expected UPSTREAM_ERROR');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConnectorError);
      expect(err.code).toBe('UPSTREAM_ERROR');
      expect(err.statusCode).toBe(500);
    }
  });

  it('24. should handle network timeout and raise TIMEOUT error', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      throw abortError;
    });

    const client = new WooCommerceClient({
      storeUrl: 'https://example.com',
      consumerKey: 'ck_mock',
      consumerSecret: 'cs_mock',
      timeoutMs: 100,
      maxRetries: 1,
    });

    try {
      await client.searchOrders();
      expect.fail('Expected TIMEOUT error');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConnectorError);
      expect(err.code).toBe('TIMEOUT');
      expect(err.statusCode).toBe(504);
      expect(err.message).toContain('did not respond within');
    }
  });

  it('25. should handle upstream 404 for missing resource', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ message: 'Resource not found' }), { status: 404 });
    });

    const client = new WooCommerceClient({
      storeUrl: 'https://example.com',
      consumerKey: 'ck_mock',
      consumerSecret: 'cs_mock',
      maxRetries: 1,
    });

    try {
      await client.getOrder('99999');
      expect.fail('Expected NOT_FOUND error');
    } catch (err: any) {
      expect(err.code).toBe('NOT_FOUND');
      expect(err.statusCode).toBe(404);
    }
  });
});
