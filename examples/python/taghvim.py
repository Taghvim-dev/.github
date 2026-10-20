# SPDX-License-Identifier: Apache-2.0
"""Taghvim.dev reference client (not an officially published SDK)."""
import json
import urllib.error
import urllib.request
from urllib.parse import urlparse


class TaghvimApiError(Exception):
    def __init__(self, status, code, request_id=None):
        super().__init__(f"Taghvim API error {status}: {code or 'unknown'}")
        self.status = status
        self.code = code
        self.request_id = request_id


class TaghvimClient:
    def __init__(self, api_key, base_url="https://api.taghvim.dev", timeout=15):
        if not isinstance(api_key, str) or not api_key.startswith(("tgv_test_", "tgv_live_")):
            raise ValueError("An issued Taghvim API key is required")
        if urlparse(base_url).scheme != "https":
            raise ValueError("API endpoint must use HTTPS")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def call(self, method, path, body=None, idempotency_key=None):
        if not path.startswith("/v1/") or "?" in path or ".." in path:
            raise ValueError("Invalid API route")
        headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key
        req = urllib.request.Request(self.base_url + path,
            data=None if body is None else json.dumps(body).encode("utf-8"),
            headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.load(res)
        except urllib.error.HTTPError as err:
            try:
                data = json.load(err)
            except (ValueError, OSError):
                data = {}
            raise TaghvimApiError(err.code, data.get("code"), err.headers.get("Taghvim-Request-Id")) from None

    def convert_date(self, date):
        return self.call("POST", "/v1/dates/convert", {"date": date})

    def usage(self):
        return self.call("GET", "/v1/usage")
