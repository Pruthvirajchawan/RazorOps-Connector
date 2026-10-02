# Interactive Demo Walkthrough

## Overview
MerchantOps Connector includes a built-in, 100% deterministic **Demo Mode** featuring **50 synthetic orders** and **15 synthetic products**.

This allows reviewers to experience the entire agent operations lifecycle in under 3 minutes without configuring external credentials.

---

## Launching the Demo

```bash
# 1. Start backend and frontend simultaneously
npm run dev

# 2. Open your browser
http://localhost:5173
```
*(Alternatively, run `npm run build && npm start` to access the production bundle on `http://localhost:3000`)*.

---

## 3-Minute Demo Sequence

### Step 1: Connection & Guardrails Inspection (0:00 - 0:30)
1. In the Left Column, observe the preloaded **Demo Mode**.
2. Click **TEST CONNECTION**.
3. Notice the live green checklist:
   - `✓ Connected (Apex Retail India)`
   - `✓ Read-Only Policy ENFORCED`
   - `✓ Orders, Products, and Inventory Accessible`
4. Emphasize that all write, refund, and mutation APIs are blocked at the protocol layer.

### Step 2: The Core Differentiator — Operational Attention Queue (0:30 - 1:15)
1. In the Center Column, click the prompt pill:
   > *"What orders need my attention today?"*
2. The agent interprets the query, invokes `find_orders_needing_attention`, scans 22 active orders, and flags **Order #10482**:
   - Total: **INR 18,450.00** (Status: `PROCESSING`)
   - Reason: Required quantity for SKU-483 (7 units) exceeds available stock (4 units).
   - Impact: *"Potential fulfillment risk: Fulfillment may require merchant intervention or partial shipment."*

### Step 3: Ground-Truth Evidence Verification (1:15 - 1:50)
1. Click on the Order #10482 attention card.
2. In the Right Column (Inspector), observe the **Ground-Truth Evidence Chain**:
   - `WooCommerce Order API`: Observed Qty = `7`
   - `WooCommerce Product API`: Observed Stock = `4`
   - `Inventory Snapshot`: Deficit = `3 units short`
3. Notice that the agent never hallucinated or predicted certainty—it grounded its finding in exact upstream data.

### Step 4: Multi-Resource Exploration (1:50 - 2:30)
1. In the Center Column, ask:
   > *"Show me all other orders affected by SKU-483"*
2. The agent executes `search_orders` with `{ sku: "SKU-483" }` and locates **Order #10491** which also requests 2 units.
3. Ask:
   > *"Show highest-value pending order"*
4. The agent retrieves **Order #10415** (INR 29,998.00), flagging that it has been pending for over 56 hours without clearance.

### Step 5: Audit Trail & Reliability Verification (2:30 - 3:00)
1. Click **Audit Trail** in the lower-left footer.
2. Review the structured audit log table displaying request IDs, exact latency (e.g. `11ms`), upstream categories, and sanitized inputs.
3. Conclude:
   > *"This is not a toy chat wrapper. It is an agent-ready operational gateway that turns messy merchant data into bounded, reliable, evidence-backed capabilities."*
