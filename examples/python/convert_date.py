"""Apache-2.0. Simple API example; not a published official SDK."""
import json
import os
import sys
import urllib.error
import urllib.request

key = os.environ.get("TAGHVIM_API_KEY")
if not key:
    raise SystemExit("Set TAGHVIM_API_KEY to your own issued test key")
base = os.environ.get("TAGHVIM_API_BASE", "https://api.taghvim.dev").rstrip("/")
req = urllib.request.Request(
    base + "/v1/dates/convert",
    data=json.dumps({"date": "1405-07-15"}).encode("utf-8"),
    headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=15) as res:
        print(json.dumps(json.load(res), indent=2, ensure_ascii=False))
except urllib.error.HTTPError as exc:
    print("HTTP", exc.code, "request_id:", exc.headers.get("Taghvim-Request-Id"), file=sys.stderr)
    raise SystemExit(1)
