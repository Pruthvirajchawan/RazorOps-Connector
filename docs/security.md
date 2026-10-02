# Security Architecture & Threat Model

MerchantOps Connector acts as a hardened security proxy between autonomous LLMs and merchant enterprise data.

---

## 1. SSRF (Server-Side Request Forgery) Prevention
Because the merchant Store URL is user-configurable, the connector enforces multi-tiered SSRF protection:

1. **Protocol Restriction**: Only `https://` is allowed in production (unencrypted `http://` is strictly prohibited).
2. **Explicit Hostname Blocklist**:
   - `localhost`, `127.0.0.1`, `::1` (unless in local development mode)
   - `169.254.169.254` (AWS, GCP, Azure instance metadata services)
   - `metadata.google.internal`, `instance-data`
3. **Pre-Flight DNS Resolution Check**:
   Before dispatching any HTTP request, the target hostname is resolved via `dns.lookup`. If any resolved IP address falls into private or link-local subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `127.0.0.0/8`), the request is immediately aborted with `SSRF_DETECTED`.

---

## 2. Protocol-Level Read Boundary
The connector is strictly **READ-ONLY**:
- No endpoints or MCP tools exist for order deletion, customer record modification, inventory adjustments, or payment capture/refunds.
- MCP tool declarations explicitly broadcast `readOnly: true` to consuming agent frameworks.
- Attempts by an agent to execute arbitrary URLs or non-whitelisted paths are rejected by the router.

---

## 3. Data Minimization & PII Masking
The connector intercepts all raw WooCommerce payloads and minimizes fields before an LLM or user can see them:
- **Customer Names Masked**: Transformed to initials (e.g., `Vikram Patel` becomes `Vikram P.`).
- **Billing Addresses Stripped**: Full street addresses, phone numbers, and customer emails are omitted.
- **Payment Credentials Omitted**: Credit card tokens, gateway transaction IDs, and merchant authentication nonces are discarded during schema normalization.

---

## 4. Credential Protection & Redaction
- **Log Sanitizer**: The structured JSON logger (`src/logging/logger.ts`) inspects every log entry recursively, stripping sensitive keys (`consumer_secret`, `password`, `authorization`, `token`, `secret`, `apiKey`).
- **No Credentials in DB**: The database only stores a masked prefix (`ck_test...`) and masked suffix (`****1234`) for connection identification.

---

## 5. Webhook HMAC-SHA256 Signature Verification
When WooCommerce webhooks (`order.created`, `order.updated`, `product.updated`) are delivered:
- The connector computes the HMAC-SHA256 digest of the raw request payload using the configured webhook secret.
- Constant-time string comparison (`crypto.timingSafeEqual`) prevents timing attack vulnerabilities.
- Payloads with missing or invalid signatures are rejected with HTTP 401.
- **Idempotency Guard**: Every webhook event is checked against SQLite `webhook_events`. Duplicate deliveries are safely acknowledged without re-processing.
