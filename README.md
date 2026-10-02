# ⚡ RazorOps Connector
> **Making merchant systems agent-ready for Razorpay Agent Studio.**  
> A high-reliability, strictly read-only operational gateway that correlates WooCommerce orders and warehouse inventory to prevent fulfillment bottlenecks with verifiable ground-truth evidence.

[![Vitest Tests](https://img.shields.io/badge/Vitest-40%20passed-10b981?style=for-the-badge&logo=vitest&logoColor=white)](./docs/evaluation.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20NodeNext-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](./tsconfig.json)
[![MCP Protocol](https://img.shields.io/badge/MCP-Official%20SDK-7c3aed?style=for-the-badge)](https://modelcontextprotocol.io)
[![Security Guard](https://img.shields.io/badge/Security-SSRF%20Protected-0284c7?style=for-the-badge)](./docs/security.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-64748b?style=for-the-badge)](./LICENSE)

---

## 1. What This Solves
E-commerce merchants rely on operational data scattered across orders, warehouse inventory, and fulfillment channels. While autonomous AI agents (such as Razorpay Agent Studio, Claude Desktop, Cursor) could supercharge merchant decision-making, connecting them directly to raw WooCommerce REST APIs fails because:
* **Context Bloat**: A few raw WooCommerce order JSON payloads consume tens of thousands of tokens.
* **Missing Cross-Resource Reasoning**: Siloed order and product endpoints do not correlate whether required line item quantities can actually be fulfilled by current physical stock.
* **Security & Mutation Hazards**: Giving agents uncontrolled endpoint access risks accidental refunds, order deletions, or data corruption.
* **Upstream Rate Limits**: WordPress hosts frequently throttle or drop concurrent queries without exponential backoff.

**MerchantOps Connector** provides a safe, bounded operational intelligence layer that retrieves, normalizes, and reasons over merchant orders and inventory with **verifiable ground-truth evidence**.

---

## 2. Why This Is Useful to a Merchant
Instead of manually navigating multiple admin pages or cross-checking spreadsheets, an operations manager can ask the agent:

* *"What orders need my attention today?"*  
  *(Identifies inventory deficits, stale pending orders, and high-value risks)*
* *"Show me orders affected by SKU-483."*  
  *(Instantly finds all orders dependent on a low-stock product)*
* *"Find my highest-value pending orders."*  
  *(Surfaces orders requiring immediate payment clearance)*
* *"Why did you flag this order?"*  
  *(Provides an audited, multi-source evidence breakdown)*

---

## 3. Architecture

```
                 AI AGENT (Agent Studio / LLM)
                              │
                              ▼
                     MCP TOOL LAYER (JSON-RPC)
                              │
                              ▼
                    AGENT REASONING SERVICE
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
       Attention & Evidence        MerchantDataProvider
             Engine                     Abstraction
       (Deficit Detection)                   │
                                     ┌───────┴───────┐
                                     ▼               ▼
                                WooCommerce     DemoProvider
                                 Provider       (Synthetic)
                                     │
                                     ▼
                            WooCommerceClient
                           (SSRF Guard, 429
                            Backoff, Jitter)
                                     │
                                     ▼
                           WooCommerce REST API
```

### Core Architectural Principles
1. **AI Reasons; Connector Retrieves; Policy Enforces.**
2. **WooCommerce is the Source of Truth.**
3. **Strictly Read-Only Boundary** (Mutations, deletions, and payment actions are barred at the protocol level).
4. **LLM = Intent Interpretation; Connector = Deterministic Execution.**

---

## 4. Setup & Quickstart (Under 5 Minutes)

### Prerequisites
* Node.js >= 20.x
* npm >= 10.x

### Quickstart
```bash
# 1. Clone repository and navigate to root
cd /path/to/MerchantOps

# 2. Install all dependencies (Backend + Frontend)
npm install
cd frontend && npm install && cd ..

# 3. Copy environment configuration
cp .env.example .env

# 4. Start both Backend & Frontend in development mode
npm run dev
```

Visit **`http://localhost:5173`** (or **`http://localhost:3000`** in production mode) to launch the MerchantOps Command Center.

---

## 5. Environment Variables

Configure `.env` as needed:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for Express REST & MCP server |
| `NODE_ENV` | `development` | Environment mode (`development` / `production`) |
| `DEMO_MODE` | `true` | Set `true` to use synthetic merchant data without live API keys |
| `WOOCOMMERCE_STORE_URL` | `""` | Base URL of your WooCommerce store (e.g. `https://my-store.com`) |
| `WOOCOMMERCE_CONSUMER_KEY` | `""` | Read-only WooCommerce Consumer Key (`ck_...`) |
| `WOOCOMMERCE_CONSUMER_SECRET`| `""` | WooCommerce Consumer Secret (`cs_...`) |
| `WOOCOMMERCE_WEBHOOK_SECRET`| `""` | Secret key for HMAC-SHA256 webhook validation |
| `LOG_LEVEL` | `info` | Structured logging verbosity (`debug`, `info`, `warn`, `error`) |

> 🔒 **Security Guarantee**: Real credentials, customer data, and passwords are **never** committed to version control.

---

## 6. Demo Mode (Zero Credentials Required)
MerchantOps Connector includes a built-in **Demo Mode** populated with **50 synthetic orders** and **15 products**:
* Fully deterministic and runs 100% offline.
* Features signature test cases, including **Order #10482** (processing, demanding 7 units of `SKU-483` when only 4 units exist in inventory).
* Uses fictional, masked customer identities (`Vikram P.`, `Neha R.`, etc.).

Toggle **Demo Mode** directly within the web UI or keep `DEMO_MODE=true` in `.env`.

---

## 7. Real WooCommerce Mode
To connect a live WooCommerce store:
1. In WordPress Admin, navigate to **WooCommerce** > **Settings** > **Advanced** > **REST API**.
2. Click **Add Key**, name it `MerchantOps Gateway`, and set permissions to **`Read`**.
3. In the MerchantOps UI (or `.env`), enter:
   * **Store URL**: `https://your-store.com`
   * **Consumer Key**: `ck_...`
   * **Consumer Secret**: `cs_...`
4. Click **TEST CONNECTION** to verify connectivity and validate read access.

---

## 8. Running the MCP Server
MerchantOps Connector implements the official Model Context Protocol (MCP) standard:

```bash
# Run MCP server over stdio (compatible with Claude Desktop, Cursor, Agent Studio)
npm run mcp
```

### Claude Desktop Integration Configuration
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "merchantops": {
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/MerchantOps/src/mcp/server.ts"],
      "env": {
        "DEMO_MODE": "true"
      }
    }
  }
}
```

---

## 9. Running Automated Tests & Evaluation

The codebase includes **40 automated test cases** covering authentication, rate-limiting, SSRF, pagination, attention queue, and webhooks:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run TypeScript typecheck across root and frontend
npm run typecheck

# Build production bundle
npm run build
```

---

## 10. Example Agent Queries

The built-in operational reasoning engine understands natural language queries and executes deterministic tool calls:

| Merchant Operational Query | MCP Tool Executed | Underlying Operational Action |
| :--- | :--- | :--- |
| *"What orders need my attention today?"* | `find_orders_needing_attention` | Cross-checks active orders with inventory snapshots; flags shortages and delays. |
| *"Find orders affected by SKU-483"* | `search_orders` | Performs deterministic search for line items containing `SKU-483`. |
| *"Show highest-value pending order"* | `search_orders` | Retrieves pending orders, sorts deterministically by total amount. |
| *"Find products running low on stock"* | `find_low_stock_products` | Filters products with stock quantity <= 5 units. |
| *"Get order #10482"* | `get_order` | Returns normalized order data with masked customer details. |
| *"Which orders are currently processing?"* | `search_orders` | Filters orders with status `processing`. |

---

## 11. Security Model
* **SSRF Protection**: Validates all URLs against private IP subnets (`10.0.0.0/8`, `192.168.0.0/16`, `127.0.0.0/8`) and AWS/GCP metadata endpoints (`169.254.169.254`).
* **Strict Read Boundary**: Protocol prohibits order mutations, status changes, refunds, or customer edits.
* **PII Minimization**: Masks customer identities (`Vikram Patel` -> `Vikram P.`) and omits credit card numbers, billing addresses, and payment secrets.
* **HMAC-SHA256 Webhooks**: Validates all incoming WooCommerce webhooks and enforces idempotency.
* **Structured Log Redaction**: Automatically scrubs secrets and authorization headers from JSON logs.

---

## 12. Known Limitations & Scope
* **Read-Only**: Intentionally does not implement write or refund operations.
* **Inventory Synchronization**: Operates on WooCommerce inventory snapshots; discrepancies between physical ledgers and WooCommerce will be reflected in the connector.
* **Pagination Bounds**: Capped at 10 pages (`maxPages = 10`) to prevent LLM context exhaustion and upstream server denial-of-service.

For deeper technical documentation, please consult the [`docs/`](./docs) directory:
* [Merchant Problem & Thesis](./docs/merchant-problem.md)
* [System Architecture](./docs/architecture.md)
* [MCP Tools Specification](./docs/mcp-tools.md)
* [Authentication Architecture](./docs/authentication.md)
* [Security & SSRF Guardrails](./docs/security.md)
* [Rate Limiting & Backoff](./docs/rate-limits.md)
* [Assumptions & Limitations](./docs/limitations.md)
* [Evaluation Report (40 Tests)](./docs/evaluation.md)
* [3-Minute Demo Walkthrough](./docs/demo.md)
* [Verbal Demo Script](./docs/demo-script.md)
* [The FDE Story](./docs/fde-story.md)
