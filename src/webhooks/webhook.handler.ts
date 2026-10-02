import crypto from 'node:crypto';
import { appDb } from '../database/db.js';
import { ConnectorError } from '../domain/errors.js';
import { rootLogger } from '../logging/logger.js';

export interface WebhookHeaders {
  signature?: string; // 'x-wc-webhook-signature'
  topic?: string;     // 'x-wc-webhook-topic'
  resource?: string;  // 'x-wc-webhook-resource'
  eventId?: string;   // 'x-wc-webhook-id'
  source?: string;    // 'x-wc-webhook-source'
}

export function verifyWebhookSignature(rawBody: string | Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const digest = hmac.digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

export interface WebhookProcessResult {
  status: 'PROCESSED' | 'DUPLICATE' | 'IGNORED';
  message: string;
  topic: string;
  resourceId?: string;
  eventId: string;
}

export class WebhookHandler {
  processWebhook(
    rawBody: string | Buffer,
    headers: WebhookHeaders,
    secret?: string
  ): WebhookProcessResult {
    const rawString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    const signature = headers.signature || '';
    const topic = headers.topic || 'unknown';
    const eventId = headers.eventId || `wh_${crypto.createHash('md5').update(rawString).digest('hex')}`;

    // Verify signature if secret configured
    const effectiveSecret = secret || process.env.WOOCOMMERCE_WEBHOOK_SECRET;
    let verified = false;

    if (effectiveSecret) {
      verified = verifyWebhookSignature(rawBody, signature, effectiveSecret);
      if (!verified) {
        rootLogger.warn('Invalid webhook signature rejected', { eventId, topic });
        throw new ConnectorError({
          code: 'AUTHENTICATION_ERROR',
          statusCode: 401,
          message: 'Invalid WooCommerce webhook HMAC-SHA256 signature.',
          remedy: 'Verify that the webhook secret matches the WooCommerce Webhook Settings.',
        });
      }
    } else {
      // In demo/test environment without explicit secret, treat as verified for local tests
      verified = true;
    }

    // Check Idempotency
    if (appDb.isWebhookProcessed(eventId)) {
      rootLogger.info('Duplicate webhook event detected, skipping idempotent execution', { eventId, topic });
      return {
        status: 'DUPLICATE',
        message: 'Duplicate event already processed. Idempotency preserved.',
        topic,
        eventId,
      };
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawString);
    } catch {
      payload = {};
    }

    const resourceId = String(payload.id || payload.order_id || payload.product_id || headers.eventId || 'unknown');

    // Record webhook event in DB
    appDb.recordWebhook({
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      eventId,
      topic,
      resourceId,
      signatureVerified: verified,
      status: 'PROCESSED',
      payloadSummary: JSON.stringify({
        id: resourceId,
        status: payload.status,
        total: payload.total,
      }),
      receivedAt: new Date().toISOString(),
    });

    rootLogger.info('WooCommerce webhook successfully processed', {
      eventId,
      topic,
      resourceId,
    });

    return {
      status: 'PROCESSED',
      message: `Successfully processed webhook event for ${topic}.`,
      topic,
      resourceId,
      eventId,
    };
  }
}

export const webhookHandler = new WebhookHandler();
