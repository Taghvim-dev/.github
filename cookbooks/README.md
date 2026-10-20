# Developer cookbooks — single API contract

All samples use an issued, scoped **test** credential. They do not contact production while documentation tests run. Values are examples, not proof of a real user account.

| Scenario | API operation | Safe example |
|---|---|---|
| Persian/Gregorian date conversion | `POST /v1/dates/convert` | [01 Convert](01-convert-date.mjs) |
| Business-day arithmetic | `POST /v1/business-days/add` | [02 Business days](02-business-days.mjs) |
| Scheduling a recurrence | `POST /v1/schedules/preview` | [03 Schedule preview](03-schedule-preview.mjs) |
| Usage, quota and safe errors | `GET /v1/usage` | [04 Metering](04-usage.mjs) |

**Cross-component release rule:** update examples, SDK, OpenAPI operation index, README, documentation and tests as one versioned release. Capture a commit SHA, contract hash, test reports, deployed API version, and owner approval. Never assume a demo response is a live sandbox.

No provider, infrastructure or subprocessor details are required for these public product tutorials.
