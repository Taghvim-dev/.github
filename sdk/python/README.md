# Taghvim Python SDK (preview)

Apache-2.0 reference SDK source. **Not on PyPI; do not claim published availability.** Requires a separately provisioned `tgv_test_` key.

```python
import os
from taghvim_sdk import TaghvimClient
client = TaghvimClient(api_key=os.environ["TAGHVIM_TEST_API_KEY"])
print(client.convert_date("1405-07-15"))
```

Standard-library HTTP client; explicit errors, server request IDs, no hidden tenant creation. Install from a reviewed source checkout only. Run tests from this repository with `PYTHONPATH=sdk/python python -m unittest discover -s sdk/python/tests -v`.
