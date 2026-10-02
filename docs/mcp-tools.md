# Model Context Protocol (MCP) Tool Specification

All tools exposed by MerchantOps Connector are strictly **READ-ONLY**. Any mutation, deletion, or payment modification request is rejected at the protocol layer.

---

## Tool 1: `search_orders`
* **Purpose**: Query and filter merchant orders with bounded pagination and masked PII.
* **Permission**: `READ_ORDERS`
* **Side Effects**: None (`readOnly: true`)
* **Data Sensitivity**: Confidential Operational Data (Customer PII is masked; payment nonces and tokens are omitted)

### Input Schema
```json
{
  "type": "object",
  "properties": {
    "status": { "type": "string", "description": "e.g. pending, processing, on-hold, completed, cancelled" },
    "customer": { "type": "string", "description": "Search by customer name" },
    "orderId": { "type": "string", "description": "Filter by order ID" },
    "product": { "type": "string", "description": "Filter by product name substring" },
    "sku": { "type": "string", "description": "Filter by SKU code" },
    "after": { "type": "string", "description": "ISO 8601 start date" },
    "before": { "type": "string", "description": "ISO 8601 end date" },
    "minTotal": { "type": "number", "description": "Minimum order total amount" },
    "maxTotal": { "type": "number", "description": "Maximum order total amount" },
    "page": { "type": "integer", "default": 1 },
    "limit": { "type": "integer", "default": 20, "maximum": 100 }
  }
}
```

### Output Schema
```json
{
  "orders": [
    {
      "id": "10482",
      "orderNumber": "10482",
      "status": "processing",
      "createdAt": "2026-10-02T07:00:00Z",
      "total": "18450.00",
      "currency": "INR",
      "customerNameMasked": "Vikram P.",
      "items": [
        {
          "productId": "101",
          "sku": "SKU-483",
          "name": "Apex Pro ANC Wireless Headphones",
          "quantity": 7,
          "price": 2635.71
        }
      ]
    }
  ],
  "count": 1,
  "hasMore": false,
  "source": "woocommerce"
}
```

---

## Tool 2: `get_order`
* **Purpose**: Retrieve a single normalized order record by ID.
* **Permission**: `READ_ORDERS`
* **Side Effects**: None (`readOnly: true`)

### Input Schema
```json
{
  "type": "object",
  "properties": {
    "orderId": { "type": "string", "description": "Order ID or order number" }
  },
  "required": ["orderId"]
}
```

---

## Tool 3: `search_products`
* **Purpose**: Search merchant product catalog by keyword, SKU, or stock status.
* **Permission**: `READ_PRODUCTS`
* **Side Effects**: None (`readOnly: true`)

### Input Schema
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "Product title or description keyword" },
    "sku": { "type": "string", "description": "Exact SKU lookup" },
    "stockStatus": { "type": "string", "enum": ["instock", "outofstock", "onbackorder"] },
    "page": { "type": "integer", "default": 1 },
    "limit": { "type": "integer", "default": 20, "maximum": 100 }
  }
}
```

---

## Tool 4: `get_product`
* **Purpose**: Retrieve normalized product details by `productId` or `sku`.
* **Permission**: `READ_PRODUCTS`
* **Side Effects**: None (`readOnly: true`)

### Input Schema
```json
{
  "type": "object",
  "properties": {
    "productId": { "type": "string", "description": "Numeric product ID" },
    "sku": { "type": "string", "description": "Merchant SKU" }
  }
}
```

---

## Tool 5: `find_low_stock_products`
* **Purpose**: Query catalog products whose available inventory is at or below a specified threshold.
* **Permission**: `READ_INVENTORY`
* **Side Effects**: None (`readOnly: true`)

### Input Schema
```json
{
  "type": "object",
  "properties": {
    "threshold": { "type": "integer", "default": 5, "description": "Inventory threshold" },
    "limit": { "type": "integer", "default": 20, "maximum": 100 }
  }
}
```

---

## Tool 6: `find_orders_needing_attention` *(Primary Differentiator)*
* **Purpose**: Cross-correlate active orders against real-time inventory snapshots to detect fulfillment bottlenecks, stock deficits, high-value pending risk, and stale orders with verifiable evidence.
* **Permission**: `READ_OPERATIONS`
* **Side Effects**: None (`readOnly: true`)

### Input Schema
```json
{
  "type": "object",
  "properties": {
    "limit": { "type": "integer", "default": 20, "maximum": 100 },
    "minPriority": { "type": "string", "enum": ["critical", "high", "medium", "low"] }
  }
}
```

### Output Example
```json
{
  "items": [
    {
      "id": "att-shortage-10482-SKU-483",
      "orderId": "10482",
      "orderNumber": "10482",
      "priority": "high",
      "status": "processing",
      "total": "INR 18450.00",
      "currency": "INR",
      "reason": "Order contains SKU \"SKU-483\" where required quantity (7) exceeds available inventory (4).",
      "potentialImpact": "Potential fulfillment risk: Fulfillment may require merchant intervention or partial shipment.",
      "affectedSkus": ["SKU-483"],
      "evidence": [
        {
          "source": "WooCommerce Order API",
          "metric": "Required Quantity (SKU-483)",
          "value": 7,
          "thresholdOrExpected": 4,
          "explanation": "Order #10482 requests 7 units of SKU-483."
        },
        {
          "source": "WooCommerce Product API",
          "metric": "Available Inventory (SKU-483)",
          "value": 4,
          "thresholdOrExpected": 7,
          "explanation": "Current inventory snapshot shows only 4 units available."
        },
        {
          "source": "Inventory Snapshot",
          "metric": "Inventory Deficit",
          "value": "3 units short",
          "thresholdOrExpected": "0 deficit",
          "explanation": "Deficit of 3 units between order demand (7) and stock (4)."
        }
      ],
      "detectedAt": "2026-10-02T07:15:00Z"
    }
  ],
  "count": 1,
  "totalScanned": 22
}
```
