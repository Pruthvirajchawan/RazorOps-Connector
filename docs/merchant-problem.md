# The Merchant Problem & Product Thesis

## Executive Summary
Modern e-commerce merchants run mission-critical operations on platforms like WooCommerce. Their operational teams spend dozens of hours each week toggling between raw order dashboards, warehouse inventory sheets, and customer support tickets to answer everyday questions:

- *"Why is this high-value order still unfulfilled?"*
- *"Do we actually have enough stock on hand to ship all orders currently in processing?"*
- *"Which pending orders are at risk of cancellation or abandonment?"*

**The Core Product Thesis:**
> *"Merchants already have the operational data their teams need. The problem is that an AI agent cannot safely access, retrieve, and reason over that data in a reliable, bounded way."*

---

## Why Raw APIs Are Not Agent-Ready

Merchants frequently attempt to connect generic LLMs directly to WooCommerce REST APIs. In real-world enterprise deployments, this fails for four fundamental reasons:

### 1. Payload Bloat & Context Exhaustion
A single WooCommerce raw order JSON object often exceeds 8KB, containing hundreds of extraneous fields (raw WordPress meta keys, taxation tables, gateway nonces, customer IP addresses, internal webhook URLs). An LLM asking for 10 orders can easily consume 80,000 tokens of raw JSON noise, overflowing its context window and leading to hallucinations.

### 2. Missing Semantic Cross-Resource Connections
Raw REST endpoints are siloed:
- `/wp-json/wc/v3/orders` gives order line items and quantities.
- `/wp-json/wc/v3/products` gives inventory levels.

WooCommerce will happily accept and place an order for 7 units of an item even when only 4 units remain in physical inventory. A standard CRUD API wrapper will simply return both records disconnectedly. It requires an operational reasoning layer to correlate order requirements against inventory snapshots and detect a **3-unit shortage**.

### 3. Lack of Guardrails & Accidental Mutation
Exposing raw endpoints to an LLM without strict protocol-level read boundaries creates severe business liability:
- An agent could mistakenly trigger `DELETE /wp-json/wc/v3/orders/10482`.
- An agent could invoke payment refund endpoints or tamper with customer addresses.

### 4. Flaky Upstream Performance & Rate Limits
WooCommerce runs on merchant-hosted WordPress instances with varied hosting capacity, rate limit policies, and transient database deadlocks. Without automated exponential backoff, jitter, and Retry-After handling, AI agents crash whenever the upstream server returns `429 Too Many Requests` or `504 Gateway Timeout`.

---

## The Solution: MerchantOps Connector

MerchantOps Connector serves as a hardened, read-only operational intelligence gateway between AI Agent Studios (such as Razorpay Agent Studio, Claude Desktop, Cursor) and WooCommerce.

```
       AI Agent Studio / LLM
                 │
                 ▼
       MerchantOps Connector (MCP)
  ┌──────────────────────────────────────────────┐
  │  • Read-Only Policy Enforcement              │
  │  • SSRF & Private IP Protection              │
  │  • Bounded Pagination & Data Minimization    │
  │  • Rate-Limiting & Exponential Backoff       │
  │  • Cross-Resource Operational Reasoning      │
  │  • Ground-Truth Evidence Synthesis           │
  └──────────────────────────────────────────────┘
                 │
                 ▼
     WooCommerce REST API (v3)
```

By normalizing payloads, enforcing strict read-only permissions, and synthesizing cross-resource operational evidence, the connector transforms a raw e-commerce database into an **actionable, hallucination-free reasoning surface** for autonomous agents.
