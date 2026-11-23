# Taghvim.dev Cookbook — draft examples

These examples illustrate API usage against the versioned contract. Production availability is not asserted; confirm the deployed contract before integrating.

## 1. Convert an Iranian business date

```http
POST /v1/dates/convert
Authorization: Bearer <test-key>
Content-Type: application/json

{"date":"1405-07-15"}
```

## 2. Add 30 working days, not 30 calendar days

```http
POST /v1/business-days/add
Authorization: Bearer <test-key>
Content-Type: application/json

{"date":"1405-07-15","days":30}
```

Use the business-calendar rules and data-version included in your approved profile; do not silently assume that a holiday is a working day.

## 3. Audit an API request

Persist the operation identifier, request ID, tenant, contract version, calendar-data version and outcome. Never record full API keys. Retry mutating actions only with documented idempotency behaviour.

## 4. Manage appointments across multiple businesses

Each organization must have an independent identity, policy, consent boundary and ledger. An intermediary's credential is not transferable to a downstream partner or consumer.

## 5. A deadline that falls on an uncertain lunar holiday

Record the data source, publication date, as-of version and whether the date is *official* or *predicted*. Re-evaluate pending workflows after official publication; preserve prior calculation evidence rather than rewriting history silently.

## 6. Future cookbook packs (roadmap)

Scheduling, webhook replay, signing verification, cancellation and refund reconciliation, timezone boundaries, enterprise policy rules, SDK error handling and secure widget embedding. These are not automatically claims of released functionality.

[Getting started](DEVELOPER-QUICKSTART.md)
