/**
 * Taghvim.dev JavaScript API client (early-access preview).
 * No runtime dependencies. Node >= 20 or browsers with fetch.
 * Never put live keys in public browser bundles or logs.
 */
const DEFAULT_BASE = "https://api.taghvim.dev";
export class TaghvimApiError extends Error {
  constructor(message, { status, code, requestId, problem, retryAfter } = {}) {
    super(message);
    this.name = "TaghvimApiError";
    this.status = status ?? 0;
    this.code = code ?? "unknown_error";
    this.requestId = requestId ?? null;
    this.problem = problem ?? null;
    this.retryAfter = retryAfter ?? null;
  }
}
function validateKey(key, mode) {
  if (key == null || key === "") return null;
  if (typeof key !== "string" || !/^tgv_(test|live)_[a-zA-Z0-9_-]+$/.test(key))
    throw new TypeError("Expected an authorized tgv_test_ or tgv_live_ key");
  if (mode === "test" && !key.startsWith("tgv_test_"))
    throw new TypeError("Test mode requires a tgv_test_ key");
  return key;
}
function encodePart(part) { return encodeURIComponent(String(part)); }
export class TaghvimClient {
  constructor({ apiKey, baseUrl = DEFAULT_BASE, fetch: fetcher = globalThis.fetch, mode = "test" } = {}) {
    if (mode !== "test" && mode !== "live") throw new TypeError("mode must be test or live");
    this.apiKey = validateKey(apiKey, mode);
    this.mode = mode;
    if (typeof fetcher !== "function") throw new TypeError("fetch function is required");
    this.fetcher = fetcher;
    const base = new URL(baseUrl);
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash)
      throw new TypeError("Invalid API URL");
    if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname))
      throw new TypeError("Insecure API base URLs are only supported for local development");
    this.base = base.toString().replace(/\/$/, "");
  }
  async request(method, path, { body, query, idempotencyKey, signal, auth = true } = {}) {
    if (auth && !this.apiKey) throw new TypeError("An API key is required for this operation");
    if (!/^(GET|POST|DELETE)$/.test(method) || typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") ||
      path.includes("?") || path.includes("#") || path.includes(".."))
      throw new TypeError("Invalid API method or path");
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 200))
      throw new TypeError("Idempotency key must be between 8 and 200 characters");
    if (method === "GET" && body !== undefined) throw new TypeError("GET requests cannot send a body");
    const url = new URL(this.base + path);
    for (const [k,v] of Object.entries(query || {})) if (v !== undefined && v !== null)
      url.searchParams.set(k, String(v));
    const headers = { "accept": "application/json" };
    if (auth) headers.authorization = "Bearer " + this.apiKey;
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    const response = await this.fetcher(url.toString(), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal,
    });
    const requestId = response.headers.get("Taghvim-Request-Id");
    const retryAfter = response.headers.get("Retry-After");
    const mediaType = response.headers.get("content-type") || "";
    const payload = response.status === 204 ? null : mediaType.includes("json")
      ? await response.json().catch(() => null) : await response.text().catch(() => "");
    if (!response.ok) {
      const problem = payload && typeof payload === "object" ? payload : null;
      throw new TaghvimApiError(problem?.detail || problem?.title || `API request failed (${response.status})`, {
        status: response.status, code: problem?.code || "http_error", problem, requestId, retryAfter,
      });
    }
    return { data: payload, status: response.status, requestId, rateLimit: response.headers.get("RateLimit") };
  }
  health(options) { return this.request("GET", "/v1/health", { ...options, auth: false }); }
  readiness(options) { return this.request("GET", "/v1/readiness", { ...options, auth: false }); }
  versions(options) { return this.request("GET", "/v1/versions", { ...options, auth: false }); }
  me(options) { return this.request("GET", "/v1/me", options); }
  convertDate(body, options) { return this.request("POST", "/v1/dates/convert", { ...options, body }); }
  resolveDate(body, options) { return this.request("POST", "/v1/dates/resolve", { ...options, body }); }
  addBusinessDays(body, options) { return this.request("POST", "/v1/business-days/add", { ...options, body }); }
  diffBusinessDays(body, options) { return this.request("POST", "/v1/business-days/diff", { ...options, body }); }
  isBusinessDay(body, options) { return this.request("POST", "/v1/business-days/is-business-day", { ...options, body }); }
  holidays(query, options) { return this.request("GET", "/v1/holidays", { ...options, query }); }
  deadline(body, options) { return this.request("POST", "/v1/deadlines", { ...options, body }); }
  reminderPreview(body, options) { return this.request("POST", "/v1/reminders/preview", { ...options, body }); }
  schedulePreview(body, options) { return this.request("POST", "/v1/schedules/preview", { ...options, body }); }
  usage(options) { return this.request("GET", "/v1/usage", options); }
  subscription(options) { return this.request("GET", "/v1/subscription", options); }
  listKeys(options) { return this.request("GET", "/v1/keys", options); }
  createKey(body, options) { return this.request("POST", "/v1/keys", { ...options, body }); }
  revokeKey(id, options) { return this.request("DELETE", "/v1/keys/" + encodePart(id), options); }
  listWebhooks(options) { return this.request("GET", "/v1/webhooks", options); }
  createWebhook(body, options) { return this.request("POST", "/v1/webhooks", { ...options, body }); }
  webhookDeliveries(id, options) { return this.request("GET", "/v1/webhooks/" + encodePart(id) + "/deliveries", options); }
}
export function createTestClient(options) { return new TaghvimClient({ ...options, mode: "test" }); }
