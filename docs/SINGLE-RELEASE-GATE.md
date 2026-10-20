# One canonical public developer release gate

There is **one** coordinated public-release workflow: `.github/workflows/coordinated-public-release.yml`. It uses an approved SHA-locked `release/PUBLIC-RELEASE-MATRIX.json` and verifies:
1. Exact Git revision and one public operation index across SDK, CLI and Cookbooks
2. Full JavaScript and Python SDK tests, offline CLI tests, and executable cookbook examples with the pinned SDK
3. Immutable JSON release evidence containing each commit SHA and contract checksum
4. On explicit operator request only, deployed website ↔ API ↔ canonical contract parity

It is not executed for every intermediate SDK/CLI/Cookbook commit. Source repositories keep fast, self-contained PR CI checks with cancellation of superseded runs. The organization release pipeline is triggered when the release matrix changes, on `public-release-*` tags, or through an explicit manual dispatch.

**No live payment or user signup is authorized by this workflow.** The matrix currently records a public 2.0.0 deployment versus 2.1.0 contract and GA remains blocked until independently verified. Do not turn a failing contract gate green by downgrading its assertions.

No duplicate public SDK / Cookbook source trees should be maintained in the organization-profile repository.
