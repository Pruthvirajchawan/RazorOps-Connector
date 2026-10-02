# Rate Limiting & Resilient Retry Engine

## Overview
WooCommerce stores are hosted across varied environments—from shared hosting to enterprise clusters. API queries are prone to rate limiting (`429 Too Many Requests`), temporary gateway congestion (`502`, `503`, `504`), and database query timeouts.

MerchantOps Connector implements a deterministic, fault-tolerant retry engine in `WooCommerceClient`.

---

## Retry Strategy Matrix

| HTTP Status / Condition | Retried? | Backoff Policy | Actionable Agent Remedy |
| :--- | :--- | :--- | :--- |
| **`429 Too Many Requests`** | **Yes** (up to 3x) | Honors `Retry-After` header or exponential backoff + jitter | `"WooCommerce temporarily rate-limited this request. Retried twice and stopped to prevent traffic surge."` |
| **`408 Request Timeout`** | **Yes** (up to 3x) | Exponential backoff (`base * 2^attempt + jitter`) | `"WooCommerce request timed out. Retried."` |
| **`502 Bad Gateway`** | **Yes** (up to 3x) | Exponential backoff | `"Upstream hosting gateway transient failure."` |
| **`503 Service Unavailable`** | **Yes** (up to 3x) | Exponential backoff | `"WooCommerce database under maintenance."` |
| **`504 Gateway Timeout`** | **Yes** (up to 3x) | Exponential backoff | `"Store database taking longer than 8s to respond."` |
| **Network Disconnect** | **Yes** (up to 3x) | Exponential backoff | `"Network handshake dropped, retrying."` |
| **`401 Unauthorized`** | **NO** | Aborts immediately | `"Invalid Consumer Key / Secret. Check API credentials."` |
| **`403 Forbidden`** | **NO** | Aborts immediately | `"Insufficient permissions. Key needs Read access."` |
| **`404 Not Found`** | **NO** | Aborts immediately | `"Resource not found."` |

---

## Exponential Backoff with Jitter
When backing off, delay intervals are calculated as:
$$\text{delay} = \text{min}(\text{baseDelay} \times 2^{\text{attempt}}, 10000) + \text{randomJitter}(0, 150)\text{ms}$$

This prevents "thundering herd" problems where concurrent agents retry simultaneously and overwhelm the merchant server.

---

## Bounded Pagination Guardrails
Collection queries (`search_orders`, `search_products`) are bounded:
- Default page size: `20`
- Maximum allowed page size: `100`
- Maximum page limit: `maxPages = 10`

If an agent or user requests an unbounded query beyond page 10, the connector halts and returns:
> *"Requested page exceeds the maximum safe limit (10). Result set is too large. Narrow the search criteria by date, status, or SKU."*
