// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { TaghvimClient, TaghvimApiError } from "./client.mjs";

test("rejects missing keys and insecure endpoints", () => {
  assert.throws(() => new TaghvimClient({}), /issued/);
  assert.throws(() => new TaghvimClient({ apiKey: "tgv_test_EXAMPLE", baseURL: "http://example.invalid" }), /HTTPS/);
});

test("passes scoped bearer auth and typed request body", async () => {
  const requests = [];
  const client = new TaghvimClient({ apiKey: "tgv_test_EXAMPLE", fetchImpl: async (url, init) => {
    requests.push({ url: url.href, init });
    return new Response(JSON.stringify({ date: { iso: "2026-10-07" } }), { status: 200, headers: { "content-type": "application/json" } });
  } });
  const result = await client.convertDate("1405-07-15");
  assert.equal(result.date.iso, "2026-10-07");
  assert.equal(requests[0].url, "https://api.taghvim.dev/v1/dates/convert");
  assert.equal(requests[0].init.headers.authorization, "Bearer tgv_test_EXAMPLE");
  assert.deepEqual(JSON.parse(requests[0].init.body), { date: "1405-07-15" });
});

test("returns structured API errors without leaking credentials", async () => {
  const client = new TaghvimClient({ apiKey: "tgv_test_EXAMPLE", fetchImpl: async () => new Response(
    JSON.stringify({ code: "quota_exceeded" }), { status: 429, headers: { "Taghvim-Request-Id": "req_42" } }
  ) });
  await assert.rejects(() => client.usage(), (e) =>
    e instanceof TaghvimApiError && e.status === 429 && e.code === "quota_exceeded" &&
    e.requestId === "req_42" && !String(e).includes("tgv_test_EXAMPLE"));
});
