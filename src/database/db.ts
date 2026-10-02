import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { AuditRecord, ConnectionConfig, SanitizedConnectionStatus, WebhookEventRecord } from '../domain/types.js';
import { rootLogger } from '../logging/logger.js';

export class AppDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    const resolvedPath = dbPath || path.resolve(defaultDir, 'merchantops.db');
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        store_url TEXT NOT NULL,
        consumer_key_prefix TEXT NOT NULL,
        consumer_secret_masked TEXT NOT NULL,
        is_demo INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'DISCONNECTED',
        permissions TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhook_events (
        id TEXT PRIMARY KEY,
        event_id TEXT UNIQUE NOT NULL,
        topic TEXT NOT NULL,
        resource_id TEXT,
        signature_verified INTEGER NOT NULL,
        status TEXT NOT NULL,
        payload_summary TEXT,
        received_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders_cache (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL,
        status TEXT NOT NULL,
        total REAL NOT NULL,
        currency TEXT NOT NULL,
        line_items_json TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products_cache (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        stock_quantity INTEGER,
        stock_status TEXT NOT NULL,
        price REAL NOT NULL,
        raw_json TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tool_invocations (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input_json TEXT NOT NULL,
        result_count INTEGER,
        duration_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        request_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input_summary TEXT NOT NULL,
        store_url TEXT NOT NULL,
        endpoint_category TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        error_code TEXT,
        result_count INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_webhook_event_id ON webhook_events(event_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_events(request_id);
      CREATE INDEX IF NOT EXISTS idx_cache_order_status ON orders_cache(status);
      CREATE INDEX IF NOT EXISTS idx_cache_product_sku ON products_cache(sku);
    `);
  }

  saveConnection(config: ConnectionConfig, status: SanitizedConnectionStatus) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO connections (
        id, store_url, consumer_key_prefix, consumer_secret_masked, is_demo, status, permissions, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const keyPrefix = config.consumerKey.slice(0, 7) + '...';
    const secretMasked = '****' + config.consumerSecret.slice(-4);

    stmt.run(
      'active_connection',
      config.storeUrl,
      keyPrefix,
      secretMasked,
      config.isDemo ? 1 : 0,
      status.connected ? 'CONNECTED' : 'FAILED',
      JSON.stringify(status.permissions),
      new Date().toISOString()
    );
  }

  getSavedConnection(): { storeUrl: string; consumerKeyPrefix: string; isDemo: boolean; status: string; permissions: string[] } | null {
    const row = this.db.prepare('SELECT * FROM connections WHERE id = ?').get('active_connection') as {
      store_url: string;
      consumer_key_prefix: string;
      is_demo: number;
      status: string;
      permissions: string;
    } | undefined;

    if (!row) return null;
    return {
      storeUrl: row.store_url,
      consumerKeyPrefix: row.consumer_key_prefix,
      isDemo: Boolean(row.is_demo),
      status: row.status,
      permissions: JSON.parse(row.permissions || '[]'),
    };
  }

  recordWebhook(event: WebhookEventRecord) {
    const stmt = this.db.prepare(`
      INSERT INTO webhook_events (id, event_id, topic, resource_id, signature_verified, status, payload_summary, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.id,
      event.eventId,
      event.topic,
      event.resourceId,
      event.signatureVerified ? 1 : 0,
      event.status,
      event.payloadSummary,
      event.receivedAt
    );
  }

  isWebhookProcessed(eventId: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM webhook_events WHERE event_id = ?').get(eventId);
    return Boolean(row);
  }

  recordAudit(record: AuditRecord) {
    const stmt = this.db.prepare(`
      INSERT INTO audit_events (
        id, timestamp, request_id, tool_name, input_summary, store_url, endpoint_category, latency_ms, status, error_code, result_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const id = record.id || `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    stmt.run(
      id,
      record.timestamp,
      record.requestId,
      record.toolName,
      record.inputSummary,
      record.storeUrl,
      record.endpointCategory,
      record.latencyMs,
      record.status,
      record.errorCode || null,
      record.resultCount ?? null
    );
  }

  getAuditLogs(limit = 50): AuditRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM audit_events ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Array<{
      id: string;
      timestamp: string;
      request_id: string;
      tool_name: string;
      input_summary: string;
      store_url: string;
      endpoint_category: string;
      latency_ms: number;
      status: 'SUCCESS' | 'ERROR';
      error_code: string | null;
      result_count: number | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      requestId: r.request_id,
      toolName: r.tool_name,
      inputSummary: r.input_summary,
      storeUrl: r.store_url,
      endpointCategory: r.endpoint_category,
      latencyMs: r.latency_ms,
      status: r.status,
      errorCode: r.error_code || undefined,
      resultCount: r.result_count !== null ? r.result_count : undefined,
    }));
  }

  close() {
    try {
      this.db.close();
    } catch (err) {
      rootLogger.warn('Error closing database', { error: String(err) });
    }
  }
}

export const appDb = new AppDatabase();
