# API reference clients — JavaScript & Python

These **small, unversioned reference clients** demonstrate the documented Taghvim.dev API contract. They are Apache-2.0 examples in this public organization repository; **they are not yet distributed as an official npm or PyPI SDK**. The server and API contract remain the source of truth.

## JavaScript
```javascript
import { TaghvimClient } from "../examples/javascript/client.mjs";

const client = new TaghvimClient({ apiKey: process.env.TAGHVIM_API_KEY });
const result = await client.convertDate("1405-07-15");
console.log(result);
```

## Python
```python
import os
from taghvim import TaghvimClient

client = TaghvimClient(api_key=os.environ["TAGHVIM_API_KEY"])
print(client.convert_date("1405-07-15"))
```

Never hard-code or commit real keys. The environment variable must contain a genuine scoped key issued to an approved test tenant.

## API safety
- The client explicitly handles non-2xx errors, timeout and the server request identifier.
- All use authenticated TLS requests. The examples do **not** create tenants, issue keys or bypass invitations.
- A real SDK release requires versioning, compatibility matrices, packaging, CI, signature/provenance, and broader coverage of OpenAPI operations.

[Quickstart](API-QUICKSTART.md) · [Cookbooks](COOKBOOKS.md) · [Onboarding](DEVELOPER-ONBOARDING.md)
