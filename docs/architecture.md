# System Architecture & Design Specification

## Overview
MerchantOps Connector is built with a layered, decoupled TypeScript architecture. It prioritizes deterministic reliability, bounded permissions, and cross-resource reasoning.

```
                  ┌───────────────────────────────┐
                  │    AI Agent / Agent Studio    │
                  └──────────────┬────────────────┘
                                 │ Standard MCP / JSON-RPC
                                 ▼
                  ┌───────────────────────────────┐
                  │       MCP Tool Gateway        │
                  │   - search_orders             │
                  │   - get_order                 │
                  │   - search_products           │
                  │   - get_product               │
                  │   - find_low_stock_products   │
                  │   - find_orders_needing_att'n │
                  └──────────────┬────────────────┘
                                 │
                                 ▼
                  ┌───────────────────────────────┐
                  │     Agent Reasoning Service   │
                  └──────────────┬────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
                 ▼                               ▼
    ┌─────────────────────────┐     ┌─────────────────────────┐
    │  Attention & Evidence   │     │  MerchantDataProvider   │
    │         Engine          │     │        Interface        │
    │  - Shortage correlation │     └────────────┬────────────┘
    │  - Stale order aging    │                  │
    │  - High-value alerts    │          ┌───────┴───────┐
    └─────────────────────────┘          │               │
                                         ▼               ▼
                              ┌──────────────────┐ ┌──────────────────┐
                              │ WooCommerce      │ │ DemoProvider     │
                              │ Provider         │ │ (50 Synthetic    │
                              │ (Live REST API)  │ │  Orders & SKUs)  │
                              └────────┬─────────┘ └──────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ WooCommerceClient│
                              │ - SSRF Guard     │
                              │ - Rate Limiting  │
                              │ - Backoff/Jitter │
                              │ - Minimization   │
                              └──────────────────┘
```

---

## Core Layers & Responsibilities

### 1. Protocol Layer (MCP & REST)
- **Model Context Protocol (MCP)**: Implements the standard MCP SDK (`@modelcontextprotocol/sdk`) over stdio and HTTP. Defines schemas, descriptions, and guarantees `readOnly: true` on all tool declarations.
- **REST Endpoints**: Exposes operational endpoints for Agent Studio orchestration (`/api/orders`, `/api/products`, `/api/attention`, `/api/agent/chat`, `/api/connection/test`).

### 2. Provider Abstraction (`MerchantDataProvider`)
A strict interface decouples high-level reasoning from the underlying upstream system:
```typescript
export interface MerchantDataProvider {
  readonly name: string;
  readonly mode: 'demo' | 'live';
  testConnection(): Promise<SanitizedConnectionStatus>;
  searchOrders(filters?: OrderSearchFilters): Promise<PaginatedResult<NormalizedOrder>>;
  getOrder(orderId: string): Promise<NormalizedOrder>;
  searchProducts(filters?: ProductSearchFilters): Promise<PaginatedResult<NormalizedProduct>>;
  getProduct(params: { productId?: string; sku?: string }): Promise<NormalizedProduct>;
  getInventorySnapshot(skus: string[]): Promise<Map<string, { stockQuantity: number | null; stockStatus: string; name: string }>>;
}
```
- **`WooCommerceProvider`**: Connects to live WooCommerce stores via `WooCommerceClient`.
- **`DemoProvider`**: Runs an in-memory, deterministic 50-order synthetic dataset with the signature `Order #10482` SKU-483 inventory shortage scenario.

### 3. Rate-Limiting & Resilient HTTP Client (`WooCommerceClient`)
- **Exponential Backoff with Jitter**: Automatically retries 429, 408, 502, 503, 504, and network drops.
- **Retry-After Compliance**: Reads and respects the upstream `Retry-After` header.
- **Circuit Breaker / Max Retries**: Stops after 3 attempts and surfaces actionable remedies.
- **Bounded Pagination**: Implements page size constraints (`limit <= 100`, `maxPages = 10`).

### 4. Cross-Resource Attention & Evidence Engine (`AttentionEngine`)
The core differentiator of MerchantOps Connector. Instead of simply relaying raw queries, it aggregates active orders (`processing`, `pending`, `on-hold`), correlates every line item SKU against the real-time product inventory snapshot, and computes explicit evidence tuples.

### 5. Security & SSRF Prevention
- Prohibits private CIDR ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`).
- Prohibits cloud metadata addresses (`169.254.169.254`, `metadata.google.internal`).
- Enforces DNS pre-resolution checks before HTTP dispatch.

### 6. Persistence & Audit Layer
- SQLite database configured with **Write-Ahead Logging (WAL)** and `busy_timeout`.
- Tables: `connections`, `webhook_events`, `orders_cache`, `products_cache`, `tool_invocations`, `audit_events`.
- Clean path to PostgreSQL for multi-tenant production deployments.
