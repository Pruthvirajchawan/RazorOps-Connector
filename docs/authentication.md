# Authentication & Credential Architecture

## Overview
MerchantOps Connector implements a secure, production-grade WooCommerce REST API-key authentication flow.

WooCommerce supports REST API keys with `Read`, `Write`, and `Read/Write` permissions. To adhere to strict enterprise least-privilege principles, **MerchantOps Connector only requires and supports `Read` permissions**.

---

## Required Credentials
To connect a live WooCommerce store:

| Credential Name | Format / Example | Description |
| :--- | :--- | :--- |
| `STORE_URL` | `https://store.example.com` | Base URL of the merchant store |
| `CONSUMER_KEY` | `ck_********************` | WooCommerce REST API Consumer Key |
| `CONSUMER_SECRET` | `cs_********************` | WooCommerce REST API Consumer Secret |

---

## How to Generate WooCommerce Read-Only Keys
1. In your WordPress admin dashboard, navigate to:
   `WooCommerce` > `Settings` > `Advanced` > `REST API`.
2. Click **Add Key**.
3. Set **Description** to `MerchantOps Agent Gateway`.
4. Set **Permissions** to **`Read`** (do not select Read/Write).
5. Click **Generate API Key**.
6. Copy the **Consumer Key** and **Consumer Secret**.

---

## Connection Validation Flow (`POST /api/connection/test`)

Before any agent interaction occurs, the connector executes a validation handshake:
1. **URL Sanitization & SSRF Check**: Validates protocol (`https://`), checks domain resolution, and blocks internal/private IP targets.
2. **Upstream Ping**: Executes a lightweight call to `GET /wp-json/wc/v3/orders?per_page=1`.
3. **Read Access Verification**: Executes `GET /wp-json/wc/v3/products?per_page=1` to confirm product catalog read access.
4. **Credential Masking**: Sanitizes the returned status. **The Consumer Secret is never persisted in plaintext, never logged, and never returned in API or agent responses.**

### Sanitized Verification Response
```json
{
  "connected": true,
  "store": "store.example.com",
  "storeUrl": "https://store.example.com",
  "mode": "live",
  "permissions": ["read_orders", "read_products", "read_inventory"],
  "apiVersion": "wc/v3",
  "accessibleResources": {
    "orders": true,
    "products": true,
    "inventory": true
  },
  "checkedAt": "2026-10-02T07:20:00Z"
}
```

---

## Zero-Credential Demo Mode
To allow recruiters, reviewers, and automated CI pipelines to test the entire operational stack immediately without an active WooCommerce deployment:
- Toggle **Demo Mode** in the UI or set `DEMO_MODE=true` in the environment.
- The system automatically engages `DemoProvider`, furnishing 50 synthetic orders and 15 products with identical schema contracts.
- **No real customer data, real passwords, or production credentials are ever required or stored in this repository.**
