// SPDX-License-Identifier: Apache-2.0
/**
 * Early-access Taghvim.dev API reference client.
 * Not an officially published, versioned SDK.
 */
export class TaghvimApiError extends Error {
  constructor(status, code, requestId) {
    super(`Taghvim API error ${status}: ${code || "unknown"}`);
    this.name = "TaghvimApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export class TaghvimClient {
  constructor({ apiKey, baseURL = "https://api.taghvim.dev", fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
    if (typeof apiKey !== "string" || !/^tgv_(test|live)_/.test(apiKey)) throw new TypeError("An issued Taghvim API key is required");
    if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
    const endpoint = new URL(baseURL);
    if (endpoint.protocol !== "https:") throw new TypeError("API endpoint must use HTTPS");
    this.apiKey = apiKey;
    this.baseURL = endpoint;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async call(method, path, { body, idempotencyKey } = {}) {
    if (!/^\/v1\/[a-z0-9/-]+$/.test(path)) throw new TypeError("Invalid API route");
    const headers = { authorization: `Bearer ${this.apiKey}`, accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey !== undefined) headers["Idempotency-Key"] = idempotencyKey;
    const response = await this.fetchImpl(new URL(path, this.baseURL), {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new TaghvimApiError(response.status, data.code, response.headers.get("Taghvim-Request-Id"));
    return data;
  }

  convertDate(date) { return this.call("POST", "/v1/dates/convert", { body: { date } }); }
  usage() { return this.call("GET", "/v1/usage"); }
}
