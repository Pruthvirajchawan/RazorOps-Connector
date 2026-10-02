# Assumptions, Guardrails & Known Limitations

In the spirit of forward deployed engineering transparency, this document articulates the bounded scope, assumptions, and known limitations of MerchantOps Connector.

---

## 1. Strictly Read-Only By Design
* **Limitation**: The connector cannot update order statuses, modify customer notes, alter stock levels, trigger refunds, or cancel orders.
* **Rationale**: Bounding the connector exclusively to read operations eliminates the primary attack vector for agentic automation in e-commerce. Operational workflows should trigger alerts and recommendations for human merchant action rather than performing unverified mutations.

---

## 2. Upstream Inventory Accuracy
* **Limitation**: Inventory values reported in the Attention Queue reflect the latest snapshot available from WooCommerce.
* **Rationale**: If a merchant uses an un-synced external POS or manual physical warehouse ledgers that are not reflected in WooCommerce inventory counts, the connector will reflect the upstream discrepancy. The connector reports *"Potential fulfillment risk"* rather than asserting deterministic failure.

---

## 3. Webhook Delivery & Latency
* **Limitation**: Webhook delivery times are determined by the merchant's WordPress Cron configuration (`wp-cron.php`). On sites with low traffic or asynchronous background queues, webhook delivery can experience latency.
* **Mitigation**: The connector treats webhooks as an auxiliary event log and does not rely exclusively on cached events for critical reasoning. Active tool calls always query WooCommerce endpoints directly.

---

## 4. Bounded Pagination Bounds
* **Limitation**: Pagination is capped at 10 pages (maximum 1,000 records per search execution).
* **Rationale**: Fetching thousands of orders synchronously exhausts LLM token budgets and overwhelms WordPress MySQL databases. Agents are guided to refine queries using date brackets, order statuses, or SKU filters.

---

## 5. Merchant-Specific WordPress Variations
* **Limitation**: Some WordPress installations employ custom caching plugins (e.g. WP Rocket, Cloudflare APO) that might aggressively cache REST API responses if not properly excluded.
* **Mitigation**: The connector issues appropriate `Accept: application/json` headers and bypass query parameters.

---

## 6. Single-Node Persistence in Local Dev
* **Limitation**: Local development utilizes SQLite with WAL mode.
* **Production Path**: In multi-node enterprise environments, the database abstraction layer (`src/database/db.ts`) can be mapped directly to PostgreSQL or AWS RDS with zero changes to the MCP tool layer.
