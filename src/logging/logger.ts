export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  toolName?: string;
  storeUrl?: string;
  latencyMs?: number;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  'consumersecret',
  'consumer_secret',
  'password',
  'token',
  'authorization',
  'auth',
  'secret',
  'api_key',
  'apikey',
  'card',
  'creditcard',
  'cvv',
  'ssn',
]);

export function sanitizeForLogging(obj: unknown, depth = 0): unknown {
  if (depth > 6) return '[Max Depth Exceeded]';
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Mask potential basic auth strings or secrets
    if (obj.length > 80 && /^[A-Za-z0-9+/=]+$/.test(obj)) {
      return '[REDACTED_HASH]';
    }
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLogging(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeForLogging(value, depth + 1);
    }
  }
  return sanitized;
}

export class Logger {
  constructor(private context: LogContext = {}) {}

  child(extraContext: LogContext): Logger {
    return new Logger({ ...this.context, ...extraContext });
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const payload = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...this.context,
      ...(data ? (sanitizeForLogging(data) as Record<string, unknown>) : {}),
    };

    const json = JSON.stringify(payload);
    if (level === 'error') {
      console.error(json);
    } else if (level === 'warn') {
      console.warn(json);
    } else {
      console.log(json);
    }
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>) {
    this.log('error', message, data);
  }
}

export const rootLogger = new Logger({ service: 'merchantops-connector' });
