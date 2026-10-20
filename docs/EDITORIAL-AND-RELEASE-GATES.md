# Persian editorial quality and coordinated releases

## A unified product voice

Taghvim.dev publishes consistent Persian copy across the public organization profile, landing page, developer documentation, API examples and notices.

- Write Persian in logical Unicode order; right-to-left markup controls presentation, never reverse the characters in content.
- Separate Latin code, dates, email, API identifiers and version strings with an explicit isolated left-to-right span where appropriate.
- Use consistent spelling: «زمان‌بندی»، «ثبت‌نام»، «روز کاری»، «درخواست دسترسی»، «محیط آزمایشی»، «شناسهٔ درخواست» and «سررسید».
- Public docs never disclose underlying infrastructure providers, deployment internals, subprocessor identities or private credentials.
- Clearly distinguish an in-browser demo, a waitlist request, a provisioned test account and fully available paid operations.
- Test every user-facing step together: landing → consent and confirmation → invite → test key → API/SDK → usage/limits → receipt → support.
- The product remains **early access** until human sign-off on UI quality and end-to-end operational evidence.

## Proof and release gates

- Static, deterministic source checks block unsupported character presentation, reversed common terms and missing source links.
- Readme, API examples, SDK, legal notices, site navigation and diagrams must match an approved product contract revision.
- A release must record: approved source versions, migration proof, applicable test results, deployment identity, known limitations and rollback evidence.
- Branch rules, approvals and protected release environments require authorized organization administrators. A passing isolated unit test is not proof of all cross-component interactions.

**No-silo policy:** Do not announce a capability as ready solely because its individual repository or CI job is green. Require combined release evidence covering user journey and business operations.
