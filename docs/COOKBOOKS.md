# Taghvim.dev Cookbooks

These are **API integration recipes and product guidance**, not assertions of universally active self-service access.

## Calendar conversion
Use `POST /v1/dates/convert` with a Jalali date string; rely on the returned canonical date, not local string parsing. See [Quickstart](API-QUICKSTART.md).

## Working-day deadlines
Use `POST /v1/business-days/add` for calendar-aware offsets. The active holiday dataset, weekend profile and jurisdiction must be explicit for consequential deadlines. Re-evaluate dates when an officially announced holiday changes.

## Monthly usage and quotas
Use `GET /v1/usage` with the **same tenant key** used for operations. Treat remaining quota and reset windows as authoritative; handle 429, `Retry-After` and `RateLimit` headers without retry storms. Compare usage with export and operations ledger if your account exposes them.

## Idempotent operations
Supply a distinct `Idempotency-Key` for retriable state-changing operations that require one. Reuse the *same* key only for the same payload and route. Do not assume every read endpoint needs a key.

## Test before live
Create a separate test project and credentials when enabled. Verify account separation, application errors, revoked keys, quotas, callbacks, subscription status and recovery. No real customer payment details in test runs.

## Distribution and delegated business integrations
For multi-company platforms, do **not** forward one client's token to another company or silently co-mingle usage. Use explicit independently granted scope and tenant-aware metering only when the feature is implemented and verified.

[Developer onboarding](DEVELOPER-ONBOARDING.md) · [B2B2B2C capability boundary](B2B2B2C.md)
