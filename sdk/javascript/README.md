# Taghvim.dev JavaScript SDK — public preview

**Apache-2.0.** This directory is distributable public SDK source, currently hosted within the organization's public community repository. It is **not yet an npm release**. A dedicated public SDK repository and formal package release are subject to organization-admin creation, CI and owner approval.

The SDK deliberately performs no automatic retries for state-changing calls and does not create tenants or obtain admin credentials. Developer sandbox keys are issued only after an invitation.

```js
import {createTestClient} from "./index.js";
const taghvim=createTestClient({apiKey:process.env.TAGHVIM_TEST_API_KEY});
const {data,requestId}=await taghvim.convertDate({date:"1405-07-15"});
console.log(data,requestId);
```

Run `node --test test/*.test.mjs`. API compatibility is pinned in `../../contracts/operation-index.json`. Do not publish an SDK artifact until it matches the deployed contract revision and real authentication/sandbox tests pass.

[Cookbooks](../../cookbooks/README.md) · [Developer onboarding](../../docs/DEVELOPER-ONBOARDING.md)
