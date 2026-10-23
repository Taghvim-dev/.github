# Developer onboarding | مسیر دریافت API Key

**Official signup:** [درخواست دسترسی زودهنگام / Request test API access](https://taghvim.dev/#access)

## 7-day invitation and 30-day trial

1. **Day 0 — registration:** Submit the official Taghvim.dev early-access form with your email. We record a deduplicated waitlist entry and send a service acknowledgement; you do not receive a key yet.
2. **From day 7 — invitation eligibility:** A Cloudflare scheduled workflow checks eligible signups at least every 15 minutes, once its protected release and mail-delivery checks are active. Each eligible address can receive one one-time invitation email; delivery is subject to availability and suppression safeguards.
3. **Within 72 hours of invitation:** Open your own emailed invitation at [api.taghvim.dev/developer](https://api.taghvim.dev/developer). Activating it creates one isolated developer tenant and a `tgv_test_...` API key, displayed **once**.
4. **30 days from activation:** The test tenant's key expires after exactly 30×24 hours, **not** after signup and not after invitation dispatch. Rotated developer keys retain the same original expiry. An expired/revoked key cannot authenticate. Test keys do not authorize Production or payment.
5. **During trial:** [Developer console](https://api.taghvim.dev/developer/console), [OpenAPI v2.1.0](https://api.taghvim.dev/openapi.json), [JavaScript/Python SDK](https://github.com/Taghvim-dev/SDK), [CLI](https://github.com/Taghvim-dev/CLI), [Cookbooks](https://github.com/Taghvim-dev/cookbooks). Usage and quotas are visible through the authenticated API.
6. **After trial:** New access, extensions or Production credentials require a separate authorization; the trial does not renew through key rotation.

### Privacy, consent and safeguards

The signup service message and the requested invitation are distinct from marketing updates. Product-update subscriptions require a separately checked optional opt-in. The waitlist audience excludes ordinary contact-form messages; duplicate signups do not restart the seven-day clock. Suppression/unsubscribe decisions take precedence. Do not log or share invitation tokens or API keys, and do not embed a shared server-side key in a public widget/browser bundle.

The Comms pipeline distinguishes *accepted for dispatch* from proven inbox delivery. If the protected Cloudflare D1 / Scheduler / email stack is not attested, registrations remain pending; public documentation must not represent queued or unverified invitations as successfully delivered. An expired invitation link cannot be reused. This is **invitation-based early access**, not generally available public self-service.

[Privacy](https://taghvim.dev/#privacy) · [Terms](https://taghvim.dev/#terms) · [Contact](https://taghvim.dev/#contact).

## Developer proof

After receiving a valid test key, use a trusted server:

```bash
export TAGHVIM_TEST_API_KEY="your-issued-tgv_test_key"
curl -sS -X POST "https://api.taghvim.dev/v1/dates/convert" \
  -H "Authorization: Bearer $TAGHVIM_TEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date":"1405-07-15"}'
```

Inspect the HTTP status, version and actual response; do not assume the example is itself a provisioned account. All client SDKs and cookbooks must share the pinned Engine API contract and independently pass CI plus real sandbox proofs before being described as verified.

## Operational evidence and recovery

Landing D1 is the source of truth for the opt-out-aware waitlist. Engine D1 persists retry/lease/invitation checkpoints. GitHub SHA-bound releases use Sandbox → Production promotion; failures remain blocked until recovered or explicitly approved. The seven-day scheduler can continue without an active ChatGPT session. Record actual results rather than inferring a successful email delivery from a 202 dispatch acknowledgement.
