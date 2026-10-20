// Apache-2.0. Example only, not a published official SDK.
const key = process.env.TAGHVIM_API_KEY;
if (!key) throw new Error("Set TAGHVIM_API_KEY to your own issued test key");
const base = process.env.TAGHVIM_API_BASE || "https://api.taghvim.dev";
const res = await fetch(new URL("/v1/dates/convert", base), {
  method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ date: "1405-07-15" }),
  signal: AbortSignal.timeout(15_000),
});
const body = await res.json();
if (!res.ok) {
  console.error({ status: res.status, requestId: res.headers.get("taghvim-request-id"), code: body.code });
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(body, null, 2));
}
