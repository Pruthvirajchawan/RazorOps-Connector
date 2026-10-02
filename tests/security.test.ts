import { describe, expect, it } from 'vitest';
import { sanitizeForLogging } from '../src/logging/logger.js';
import { executeMcpTool } from '../src/mcp/tools.js';
import { DemoProvider } from '../src/providers/demo.provider.js';
import { validateStoreUrl } from '../src/security/ssrf.js';

describe('SECURITY & SSRF TEST SUITE', () => {
  it('26. should reject AWS/GCP cloud metadata IP (169.254.169.254)', async () => {
    await expect(validateStoreUrl('https://169.254.169.254/latest/meta-data', false)).rejects.toThrow(
      /blocked by security policy|private IP/i
    );
  });

  it('27. should reject file:// protocol in store URL', async () => {
    await expect(validateStoreUrl('file:///etc/passwd')).rejects.toThrow(/prohibited protocol/i);
  });

  it('28. should reject private IP ranges (e.g. 10.0.0.1, 192.168.1.1)', async () => {
    await expect(validateStoreUrl('https://10.0.0.1/wp-json', false)).rejects.toThrow(/prohibited private IP|security policy/i);
    await expect(validateStoreUrl('https://192.168.1.100/wp-json', false)).rejects.toThrow(/prohibited private IP|security policy/i);
  });

  it('29. should sanitize credentials in log serializer', () => {
    const sensitive = {
      storeUrl: 'https://example.com',
      consumer_secret: 'cs_super_secret_key_12345',
      authorization: 'Basic c3VwZXJfc2VjcmV0',
      apiKey: 'secret_value',
      user: {
        password: 'myPassword123',
        name: 'Aarav Sharma',
      },
    };

    const sanitized = sanitizeForLogging(sensitive) as any;
    expect(sanitized.consumer_secret).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.user.password).toBe('[REDACTED]');
    expect(sanitized.storeUrl).toBe('https://example.com');
  });

  it('30. should reject arbitrary tool execution not in MCP whitelist', async () => {
    const provider = new DemoProvider();
    await expect(executeMcpTool('delete_order', { orderId: '10482' }, provider)).rejects.toThrow(
      /Unknown MCP tool "delete_order"/
    );
    await expect(executeMcpTool('execute_arbitrary_query', { url: '/wp-json/wp/v2/users' }, provider)).rejects.toThrow(
      /Unknown MCP tool/
    );
  });
});
