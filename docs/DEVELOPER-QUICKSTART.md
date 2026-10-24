# Developer quickstart — early access

**Current distribution stage: invitation-based testing.** No publicly documented workflow on this page guarantees that keys are issued automatically, that every API endpoint is deployed, or that the demonstrated output is live.

1. Try [interactive calendar samples](https://taghvim.dev/#playground) without a credential.
2. Request early access at [taghvim.dev](https://taghvim.dev/#start).
3. After an invitation, obtain a test key from the authorized Taghvim.dev team; keep it on your server and never commit it.
4. Compare the versioned [OpenAPI contract](https://taghvim.dev/openapi.json) with the **deployed** API version.
5. Call the test-approved endpoint and record the returned request identifier.

```bash
export TAGHVIM_TEST_API_KEY='tgv_test_REPLACE_WITH_ISSUED_KEY'

curl --fail-with-body -sS \
  -X POST https://api.taghvim.dev/v1/dates/convert \
  -H "Authorization: Bearer ${TAGHVIM_TEST_API_KEY}" \
  -H 'Content-Type: application/json' \
  --data '{"date":"1405-07-15"}'
```

The secret shown is a placeholder. Only invoke authenticated operations when the issuer confirms your test access is active. A missing endpoint or unauthorized response is not evidence of an issued account.

## JavaScript SDK preview

```js
import { createTestClient } from "@taghvim/sdk"; // Private preview; not publicly distributed yet
const client = createTestClient({ apiKey: process.env.TAGHVIM_TEST_API_KEY });
const { data, requestId } = await client.convertDate({ date: "1405-07-15" });
console.log(data, requestId);
```

The SDK import above is a **future distribution example** until the package is released. Never expose API keys in frontend JavaScript.

[Cookbooks](COOKBOOKS.md) · [Use cases](B2B2B2C.md) · [Product site](https://taghvim.dev/)
