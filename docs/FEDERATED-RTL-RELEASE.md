# Federated Persian-language and release-evidence gate

**Canonical product statement:** Taghvim.dev provides early-access date/time APIs. A successful demo or waitlist form does not provision a production account or a sandbox key automatically.

This policy joins the public org profile, SDK, CLI and Cookbooks into one **SHA-pinned release**. On every coordinated release candidate:

1. Check out the exact approved revisions of all three public developer repositories.
2. Verify 46 public operation contracts, source blob hashes and all client tests.
3. Scan all Markdown guides and READMEs with one Persian/RTL glossary and relative-link rules.
4. Compare both actually published API and Landing OpenAPI outputs when live promotion is requested.
5. Block if the deployed versions differ, migration evidence is missing, onboarding and metering cannot be exercised or screenshot/accessibility review has not been signed.

**Visual direction acceptance:** RTL Persian prose must be tested in the rendered UI, and JSON, SDK paths, code, emails, dates and identifiers isolated as LTR. Correct Unicode text may appear visually reordered without proper CSS/layout; no tool can certify the meaning of all Persian sentences by regex alone. Maintain a human-reviewed screenshot set for mobile and desktop.

## Current release hold (20 October 2026)

- Public SDK/CLI/Cookbooks use source API contract 2.1.0, while latest independently recorded deployment probe observed API/Landing 2.0.0.
- The public matrix explicitly sets `general_availability_approved=false`.
- Waitlist mail, opt-in retention, tenant invitations, actual test keys, payment and end-user isolation still require deployment evidence.
- No stack, infrastructure provider or subprocessor identity belongs in user-facing landing or public product copy.

## Durable recovery checkpoint

Commit SHA, public manifest checksum, relevant migration receipts, successful CI run IDs, browser reports, deployed contract SHA, explicit approver and rollback ID must be stored in the release registry; after chat interruptions, load that record **rather than** rerunning already committed work.
