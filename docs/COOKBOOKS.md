# Taghvim.dev cookbooks | مثال‌های کاربردی

The samples show the **planned public API contract**; they do not assert that self-service test access is available today. Never embed keys in shipped frontend code.

## 1. Convert dates

```bash
curl -X POST https://api.taghvim.dev/v1/dates/convert \
  -H "Authorization: Bearer $TAGHVIM_TEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date":"1405-07-15"}'
```

## 2. Compute business days

```bash
curl -X POST https://api.taghvim.dev/v1/business-days/add \
  -H "Authorization: Bearer $TAGHVIM_TEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date":"1405-07-15","days":3}'
```

## 3. Plan a recurring schedule

```bash
curl -X POST https://api.taghvim.dev/v1/schedules/preview \
  -H "Authorization: Bearer $TAGHVIM_TEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"rule":"last-business","from":"1405-07-01","count":6}'
```

## 4. Handle quota errors safely

- Read HTTP status and `RateLimit` / `Retry-After` response headers.
- Use the `Taghvim-Request-Id` when reporting a problem.
- Avoid blind automatic retry for operations that cause effects.
- Separate each customer's request scope and billing owner.

## 5. Multi-party adoption

A software provider can embed calendar features for business customers and their end users, but access grants and metering must remain separated per delegated customer. The current public documentation does **not** claim automated multi-layer billing or subtenant provisioning is deployed.

[Developer quickstart](DEVELOPER-START.md) · [API lifecycle](API-LIFECYCLE.md)
