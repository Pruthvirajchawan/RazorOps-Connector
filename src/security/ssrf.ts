import dns from 'node:dns/promises';
import { ConnectorError } from '../domain/errors.js';

const DISALLOWED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '169.254.169.254',
  'metadata.google.internal',
  'instance-data',
]);

function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges:
  // 10.0.0.0 – 10.255.255.255 (10.0.0.0/8)
  // 172.16.0.0 – 172.31.255.255 (172.16.0.0/12)
  // 192.168.0.0 – 192.168.255.255 (192.168.0.0/16)
  // 127.0.0.0 – 127.255.255.255 (Loopback)
  // 169.254.0.0 – 169.254.255.255 (Link-local / Cloud metadata)
  // 0.0.0.0
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip === '0.0.0.0') return true;

  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return true;
    }
  }

  // IPv6 loopback / unique local
  if (ip === '::1' || ip === '::' || ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) {
    return true;
  }

  return false;
}

export async function validateStoreUrl(rawUrl: string, allowLocalhost = false): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ConnectorError({
      code: 'VALIDATION_ERROR',
      message: `Invalid Store URL format: "${rawUrl}"`,
      remedy: 'Please supply a valid absolute URL (e.g., https://my-store.com).',
    });
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ConnectorError({
      code: 'SSRF_DETECTED',
      message: `Prohibited protocol "${parsed.protocol}". Only HTTP/HTTPS is allowed.`,
      remedy: 'Use https:// for your WooCommerce store URL.',
    });
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const effectiveAllowLocalhost = allowLocalhost || (isDev && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'));

  if (parsed.protocol === 'http:' && !effectiveAllowLocalhost) {
    throw new ConnectorError({
      code: 'SSRF_DETECTED',
      message: 'Insecure HTTP protocol is not permitted for remote WooCommerce stores.',
      remedy: 'WooCommerce REST API requires HTTPS for secure credential transmission.',
    });
  }

  // Check explicit blocklist
  if (!effectiveAllowLocalhost && DISALLOWED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    throw new ConnectorError({
      code: 'SSRF_DETECTED',
      message: `Access to target host "${parsed.hostname}" is blocked by security policy.`,
      remedy: 'Target a valid, publicly accessible WooCommerce domain.',
    });
  }

  // DNS resolution check to prevent DNS rebinding to internal IPs
  if (!effectiveAllowLocalhost) {
    try {
      const addresses = await dns.lookup(parsed.hostname, { all: true });
      for (const addr of addresses) {
        if (isPrivateIp(addr.address)) {
          throw new ConnectorError({
            code: 'SSRF_DETECTED',
            message: `Target host "${parsed.hostname}" resolved to prohibited private IP address ${addr.address}.`,
            remedy: 'Ensure your store URL resolves to a public IP.',
          });
        }
      }
    } catch (err: unknown) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError({
        code: 'VALIDATION_ERROR',
        message: `Failed to resolve hostname "${parsed.hostname}": ${(err as Error).message}`,
        remedy: 'Verify that the domain name is registered and reachable over DNS.',
      });
    }
  }

  return parsed;
}
