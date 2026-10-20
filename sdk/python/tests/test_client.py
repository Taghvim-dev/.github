import io
import json
import unittest
from unittest.mock import patch
from taghvim_sdk import TaghvimClient, TaghvimApiError

class FakeResponse:
    def __init__(self, body, status=200, headers=None):
        self.data=io.BytesIO(json.dumps(body).encode("utf-8"))
        self.headers=headers or {"Taghvim-Request-Id":"req_python"}
        self.status=status
    def __enter__(self): return self
    def __exit__(self,*_): return False
    def read(self,*args): return self.data.read(*args)

class ClientTests(unittest.TestCase):
    def test_invalid_url_and_missing_key(self):
        with self.assertRaises(ValueError): TaghvimClient(api_key="not-a-key")
        with self.assertRaises(ValueError): TaghvimClient(api_key="tgv_test_example",base_url="https://user:pass@example.com")
    @patch("urllib.request.urlopen")
    def test_conversion_with_auth(self,send):
        sent=[]
        def response(req,timeout=None):
            sent.append(req)
            return FakeResponse({"date":{"iso":"2026-10-07"}})
        send.side_effect=response
        sdk=TaghvimClient(api_key="tgv_test_example")
        data=sdk.convert_date("1405-07-15")
        self.assertEqual(data["date"]["iso"],"2026-10-07")
        self.assertEqual(sent[0].get_header("Authorization"),"Bearer tgv_test_example")
        self.assertEqual(json.loads(sent[0].data)["date"],"1405-07-15")
    def test_path_guard(self):
        sdk=TaghvimClient(api_key="tgv_test_example")
        with self.assertRaises(ValueError): sdk.call("GET","/v1/../admin")
        with self.assertRaises(ValueError): sdk.call("GET","/v1/anything?api_key=bad")
if __name__=="__main__": unittest.main()
