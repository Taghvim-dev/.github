# API Quickstart — Taghvim.dev

This guide targets **approved users with an issued API key**. The browser date demo is not the same as an authenticated live account.

## Prerequisites
- A test key granted by the Taghvim.dev team, with a `tgv_test_` prefix.
- Network access to the API endpoint.
- The versioned API schema at [taghvim.dev/openapi.json](https://taghvim.dev/openapi.json) (verify the live deployment matches its documented version).

## Convert a Jalali date
```bash
export TAGHVIM_API_KEY="tgv_test_REPLACE_WITH_YOUR_OWN_KEY"
curl -sS --fail-with-body 'https://api.taghvim.dev/v1/dates/convert' \
  -H "Authorization: Bearer $TAGHVIM_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"date":"1405-07-15"}'
```

The input date is a known test vector. Observe HTTP status, response headers, request ID, and the actual response; never assume an unissued key is valid.

## Other examples
- [JavaScript (Node 18+)](../examples/javascript/convert-date.mjs)
- [Python 3 (standard library)](../examples/python/convert_date.py)

If access is not yet available, use the [in-browser date playground](https://taghvim.dev/#playground) and request an invitation.
