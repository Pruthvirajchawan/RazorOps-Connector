# What the Agent Can and Cannot Do
### Operational Boundary & Permission Specification for Agent Studio

This document defines the exact contract between **Razorpay Agent Studio** and the **MerchantOps WooCommerce Connector**. 

To protect merchant operations, finances, and customer privacy, the connector enforces an intentionally narrow, strictly **READ-ONLY** boundary at the protocol, schema, and API layers.

---

## 1. What the Agent CAN Do (Allowed Capabilities)

The agent has bounded, high-fidelity access to query, filter, and reason over merchant operational state:

### A. Orders & Fulfillment Intelligence
* **List & Filter Orders**: Retrieve merchant orders filtered deterministically by status (`pending`, `processing`, `on-hold`, `completed`), date ranges (`after`, `before`), minimum/maximum order value, or SKU code.
* **Inspect Specific Orders**: Query any order by ID to inspect line items, demanded SKUs, unit quantities, order totals, and fulfillment status.
* **Identify Stalled / Stale Orders**: Detect pending orders that have remained unfulfilled or unpaid beyond acceptable thresholds (e.g. > 48 hours).
* **Rank by Commercial Significance**: Deterministically identify high-value pending orders requiring immediate payment clearance or fraud verification.

### B. Catalog & Inventory Intelligence
* **Search Products**: Query the product catalog by name, category, or exact SKU.
* **Inspect Real-Time Stock Quantities**: Read current available warehouse stock levels, stock statuses (`instock`, `outofstock`, `onbackorder`), and stock management flags.
* **Detect Low-Stock Bottlenecks**: Query products whose available stock is at or below a merchant-defined threshold (e.g., `<= 5 units`).

### C. Cross-Resource Reasoning & Evidence Synthesis
* **Detect Fulfillment Shortages**: Correlate active order line item demands against live inventory snapshots. For example, if Order #10482 requires 7 units of `SKU-483` but catalog inventory shows only 4 units available, the agent flags an active **3-unit deficit**.
* **Synthesize Ground-Truth Evidence**: Produce evidence tuples citing the exact upstream source (`WooCommerce Order API`, `WooCommerce Product API`, or `Inventory Snapshot`), the observed metric, the expected baseline, and the operational impact.

---

## 2. What the Agent CANNOT Do (Strictly Prohibited & Blocked)

To eliminate the attack surface for autonomous agents, the connector strictly prohibits all write, update, financial, and destructive actions:

### A. State Mutations & Deletions
* ❌ **CANNOT Delete Orders or Records**: No endpoints or MCP tools exist to remove, trash, or cancel orders from WooCommerce.
* ❌ **CANNOT Modify Order Statuses**: The agent cannot mark orders as `completed`, `refunded`, or `cancelled`. Status transitions must be performed by human merchants or authorized fulfillment systems.
* ❌ **CANNOT Alter Line Items or Quantities**: The agent cannot add, remove, or swap products in an existing order.

### B. Financial & Payment Actions
* ❌ **CANNOT Issue Refunds**: The agent cannot trigger full or partial refunds through payment gateways (e.g. Razorpay, PayPal, Stripe).
* ❌ **CANNOT Capture or Void Payments**: The agent has zero authorization to alter payment authorization states.
* ❌ **CANNOT Place New Orders**: The agent cannot place checkout orders or generate unpaid draft invoices.

### C. Inventory Mutations
* ❌ **CANNOT Modify Inventory Counts**: The agent cannot increment, decrement, or override physical stock levels in the WooCommerce ledger.
* ❌ **CANNOT Change Product Pricing**: The agent cannot alter regular prices, sale prices, or apply coupon discounts.

### D. Customer Privacy & Arbitrary Access
* ❌ **CANNOT Expose Raw Payment Credentials**: Credit card numbers, CVVs, expiration dates, and payment gateway tokens are stripped during normalization and are never accessible to the agent.
* ❌ **CANNOT Expose Unmasked Customer PII**: Full customer billing addresses, personal phone numbers, and full names are masked (`Vikram Patel` -> `Vikram P.`).
* ❌ **CANNOT Traverse Arbitrary Endpoints**: The agent cannot construct arbitrary WordPress REST URLs or query WordPress core endpoints (`/wp/v2/users`, `/wp/v2/posts`).

---

## 3. Behavioral Guardrails & Failure Modes

| Scenario | What the Connector Guarantees |
| :--- | :--- |
| **Upstream 429 Rate Limiting** | Automatically backs off with exponential delay + jitter. If retries exhaust, returns a structured `RATE_LIMITED` explanation so the agent does not crash. |
| **Ambiguous Stock Prediction** | The agent will **never** claim an order *"will fail."* It reports *"Potential fulfillment risk"* backed by verifiable unit differences. |
| **Large Datasets (> 1,000 records)** | The connector rejects unbounded pagination beyond page 10 (`maxPages = 10`), prompting the agent to narrow its query by date or status. |
| **SSRF / Malicious URLs** | Rejects store URLs pointing to private networks (`10.0.0.0/8`, `192.168.0.0/16`) or cloud metadata endpoints (`169.254.169.254`). |

---

## 4. Architectural Summary

```
                       AGENT STUDIO AGENT
                               │
                       [Read Queries Only]
                               │
                               ▼
                   MERCHANTOPS CONNECTOR (MCP)
          ┌─────────────────────────────────────────┐
          │  ✓ search_orders                        │
          │  ✓ get_order                            │
          │  ✓ search_products                      │
          │  ✓ get_product                          │
          │  ✓ find_low_stock_products              │
          │  ✓ find_orders_needing_attention        │
          │  ─────────────────────────────────────  │
          │  ✕ DELETE / PUT / POST mutations        │
          │  ✕ Refunds & Financial transactions     │
          │  ✕ Raw PII & Card Credentials           │
          └─────────────────────────────────────────┘
                               │
                               ▼
                     WOOCOMMERCE REST API
```
