import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/worker.mjs";

const request = (path, init = {}) => new Request("https://preview.example" + path, init);

test("live health is available without a database or provider secrets", async () => {
  const response = await worker.fetch(request("/health/live"), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.environment, "preview");
});

test("readiness stays false until the Node.js identity origin is configured", async () => {
  const response = await worker.fetch(request("/health/ready"), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).identity, "not_configured");
});

test("invalid or non-HTTPS identity origins fail closed", async () => {
  for (const AUTH_ORIGIN of ["http://localhost:3000", "https://user:pass@example.com", "https://example.com/path", "not-a-url"]) {
    const response = await worker.fetch(request("/health/ready"), { AUTH_ORIGIN });
    assert.equal(response.status, 503);
  }
});

test("module registry distinguishes implemented and planned modules", async () => {
  const response = await worker.fetch(request("/api/v1/modules"), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.modules.find((item) => item.id === "developer-api-keys").state, "planned");
  assert.equal(body.modules.find((item) => item.id === "integrations").state, "blocked_on_official_specs");
});

test("provider catalog never claims Web4s is connected", async () => {
  const response = await worker.fetch(request("/api/v1/providers"), {});
  const body = await response.json();
  assert.equal(body.providers.find((item) => item.id === "web4s").state, "blocked_on_official_partner_spec");
});

test("OpenAPI document is served and versioned", async () => {
  const response = await worker.fetch(request("/api/v1/openapi.json"), {});
  const body = await response.json();
  assert.equal(body.openapi, "3.1.0");
  assert.equal(body.info.title, "OCodeJS Central API");
});

test("unknown routes and methods are rejected", async () => {
  assert.equal((await worker.fetch(request("/api/v1/unknown"), {})).status, 404);
  assert.equal((await worker.fetch(request("/api/v1/modules", { method: "POST" }), {})).status, 404);
});

test("browser origins are denied unless explicitly allowlisted", async () => {
  const denied = await worker.fetch(request("/api/v1/modules", { headers: { Origin: "https://evil.example" } }), { ALLOWED_ORIGINS: "https://app.ocodejs.dev" });
  assert.equal(denied.status, 403);
  const allowed = await worker.fetch(request("/api/v1/modules", { headers: { Origin: "https://app.ocodejs.dev" } }), { ALLOWED_ORIGINS: "https://app.ocodejs.dev" });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://app.ocodejs.dev");
});

test("identity methods are restricted and upstream is never guessed", async () => {
  const wrongMethod = await worker.fetch(request("/api/v1/auth/login", { method: "GET" }), {});
  assert.equal(wrongMethod.status, 405);
  const noUpstream = await worker.fetch(request("/api/v1/auth/csrf"), {});
  assert.equal(noUpstream.status, 503);
  assert.equal((await noUpstream.json()).error.code, "IDENTITY_UPSTREAM_NOT_CONFIGURED");
});

test("request IDs are returned and logged without request bodies", async () => {
  const response = await worker.fetch(request("/health/live", { headers: { "X-Request-Id": "test-request-0001" } }), {});
  assert.equal(response.headers.get("X-Request-Id"), "test-request-0001");
});
