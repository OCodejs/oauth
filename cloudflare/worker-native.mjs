import { handleIdentity } from "./identity.mjs";

const API = "/api/v1";
const METHODS = {
  "/api/v1/auth/csrf": ["GET"],
  "/api/v1/auth/register": ["POST"],
  "/api/v1/auth/verify-email": ["POST"],
  "/api/v1/auth/resend-verification": ["POST"],
  "/api/v1/auth/request-password-reset": ["POST"],
  "/api/v1/auth/reset-password": ["POST"],
  "/api/v1/auth/login": ["POST"],
  "/api/v1/auth/logout": ["POST"],
  "/api/v1/me": ["GET"]
};
const MODULES = [
  { id: "identity", name: "Identity & Authentication", state: "workers_native_preview", implementation: "cloudflare_workers_d1", endpoints: Object.keys(METHODS) },
  { id: "developer-api-keys", name: "Developer API Keys", state: "planned", implementation: "not_implemented", endpoints: [] },
  { id: "integrations", name: "Provider Integrations", state: "blocked_on_official_specs", implementation: "adapter_architecture_only", endpoints: [] },
  { id: "webhooks", name: "Webhooks", state: "planned", implementation: "not_implemented", endpoints: [] },
  { id: "audit", name: "Security Audit", state: "preview", implementation: "d1_audit_logs", endpoints: [] }
];
const PROVIDERS = [
  { id: "web4s", name: "Web4s", state: "blocked_on_official_partner_spec", auth: "unverified", sandbox: "unverified", writeOperationsEnabled: false },
  { id: "meta", name: "Meta", state: "not_configured", auth: "not_configured", sandbox: "not_verified", writeOperationsEnabled: false },
  { id: "github", name: "GitHub", state: "not_configured", auth: "not_configured", sandbox: "not_verified", writeOperationsEnabled: false },
  { id: "google", name: "Google", state: "not_configured", auth: "not_configured", sandbox: "not_verified", writeOperationsEnabled: false }
];
const OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "OCodeJS Central API",
    version: "0.2.0-preview",
    description: "Cloudflare Workers-native Preview API. Identity routes use the isolated D1 database. Email delivery requires an HTTPS provider secret. No Production data or domain is connected."
  },
  servers: [{ url: "/", description: "Current Preview Worker origin" }],
  tags: [{ name: "System" }, { name: "Platform" }, { name: "Identity" }],
  paths: {
    "/health/live": { get: { tags: ["System"], operationId: "healthLive", responses: { "200": { description: "Worker is responding." } } } },
    "/health/ready": { get: { tags: ["System"], operationId: "healthReady", responses: { "200": { description: "D1, CSRF and email provider are configured." }, "503": { description: "Preview configuration is incomplete." } } } },
    "/api/v1": { get: { tags: ["Platform"], operationId: "apiIndex", responses: { "200": { description: "API index." } } } },
    "/api/v1/modules": { get: { tags: ["Platform"], operationId: "listModules", responses: { "200": { description: "Module registry." } } } },
    "/api/v1/providers": { get: { tags: ["Platform"], operationId: "listProviders", responses: { "200": { description: "Provider registry; not a claim of live integration." } } } },
    "/docs": { get: { tags: ["Platform"], operationId: "getDocs", responses: { "200": { description: "Human-readable API docs." } } } },
    "/api/v1/openapi.json": { get: { tags: ["Platform"], operationId: "getOpenApi", responses: { "200": { description: "OpenAPI 3.1 document." } } } },
    "/api/v1/auth/csrf": { get: { tags: ["Identity"], operationId: "getCsrf", responses: { "200": { description: "Signed CSRF token and cookie." }, "503": { description: "Preview secret or D1 binding is missing." } } } },
    "/api/v1/auth/register": { post: { tags: ["Identity"], operationId: "register", responses: { "201": { description: "Account created and verification email sent." }, "503": { description: "Email delivery is not configured." } } } },
    "/api/v1/auth/verify-email": { post: { tags: ["Identity"], operationId: "verifyEmail", responses: { "200": { description: "Single-use email token consumed." } } } },
    "/api/v1/auth/resend-verification": { post: { tags: ["Identity"], operationId: "resendVerification", responses: { "200": { description: "Non-enumerating response." } } } },
    "/api/v1/auth/request-password-reset": { post: { tags: ["Identity"], operationId: "requestPasswordReset", responses: { "200": { description: "Non-enumerating response." } } } },
    "/api/v1/auth/reset-password": { post: { tags: ["Identity"], operationId: "resetPassword", responses: { "200": { description: "Password changed and sessions revoked." } } } },
    "/api/v1/auth/login": { post: { tags: ["Identity"], operationId: "login", responses: { "200": { description: "Authenticated session cookie." }, "401": { description: "Invalid credentials." }, "403": { description: "Email not verified." } } } },
    "/api/v1/auth/logout": { post: { tags: ["Identity"], operationId: "logout", responses: { "200": { description: "Session revoked." } } } },
    "/api/v1/me": { get: { tags: ["Identity"], operationId: "getCurrentUser", responses: { "200": { description: "Current user." }, "401": { description: "Unauthenticated." } } } }
  }
};

function requestId(request) {
  const supplied = request.headers.get("x-request-id") || "";
  return /^[A-Za-z0-9._-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
}
function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
}
function headersFor(request, env, id) {
  const headers = new Headers({
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-request-id": id,
    "vary": "Origin"
  });
  const origin = request.headers.get("Origin");
  const sameOrigin = new URL(request.url).origin;
  if (origin && (origin === sameOrigin || allowedOrigins(env).includes(origin))) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set("access-control-allow-headers", "Content-Type, X-CSRF-Token, X-Request-Id");
    headers.set("access-control-max-age", "600");
  }
  return headers;
}
function json(data, status, headers) {
  const output = new Headers(headers);
  output.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: output });
}
function error(code, message, status, id, headers) {
  return json({ error: { code, message, requestId: id } }, status, headers);
}
function configured(env) {
  return Boolean(env.DB && typeof env.CSRF_SECRET === "string" && env.CSRF_SECRET.length >= 32 &&
    typeof env.EMAIL_API_KEY === "string" && env.EMAIL_API_KEY.length > 0 &&
    typeof env.APP_BASE_URL === "string" && env.APP_BASE_URL.startsWith("https://"));
}
async function handle(request, env, url, id, headers) {
  if (request.method === "OPTIONS") {
    if (request.headers.get("Origin") && !headers.has("access-control-allow-origin")) return error("ORIGIN_NOT_ALLOWED", "This browser origin is not allowed.", 403, id, headers);
    return new Response(null, { status: 204, headers });
  }
  if (request.headers.get("Origin") && !headers.has("access-control-allow-origin")) return error("ORIGIN_NOT_ALLOWED", "This browser origin is not allowed.", 403, id, headers);

  if (url.pathname === "/health/live" && request.method === "GET") {
    return json({ ok: true, service: "ocodejs-central-api", runtime: "cloudflare-workers-native", environment: "preview", requestId: id }, 200, headers);
  }
  if (url.pathname === "/health/ready" && request.method === "GET") {
    const ready = configured(env);
    return json({ ready, gateway: "ready", identity: env.DB && env.CSRF_SECRET ? "database_and_csrf_configured" : "not_configured",
      email: env.EMAIL_API_KEY ? "configured" : "not_configured", environment: "preview", requestId: id }, ready ? 200 : 503, headers);
  }
  if (url.pathname === "/docs" && request.method === "GET") {
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OCodeJS Central API Preview</title><style>:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#05070f;color:#f3f5fb}body{max-width:960px;margin:48px auto;padding:0 20px}h1{font-size:24px}p,li{line-height:1.7;color:#b9c0d0}a{color:#8bb4ff;border:1px solid #46506a;padding:10px;display:inline-block;margin:6px 8px 6px 0;text-decoration:none}code,pre{background:#0a0d1a;border:1px solid #303747;padding:12px;display:block;overflow:auto}</style><h1>OCodeJS Central API</h1><p>Isolated Cloudflare Workers + D1 Preview. This is not Production.</p><p><a href="/api/v1/openapi.json">OpenAPI 3.1 JSON</a><a href="/api/v1/modules">Modules</a><a href="/api/v1/providers">Providers</a><a href="/health/live">Live health</a><a href="/health/ready">Readiness</a></p><h2>Identity backend</h2><p>Authentication, sessions, single-use tokens, audit events and rate limits run on the dedicated D1 Preview database. Email is sent only when the HTTPS email API secret is configured.</p><h2>Security</h2><p>CSRF double-submit HMAC, HttpOnly Secure session cookies, hashed opaque session tokens, PBKDF2-SHA256 password hashes and exact-origin CORS. No production data is connected.</p><pre id="modules">Loading module registry…</pre><script>fetch('/api/v1/modules').then(r=>r.json()).then(v=>document.querySelector('#modules').textContent=JSON.stringify(v,null,2)).catch(()=>document.querySelector('#modules').textContent='Unable to load registry');</script></html>`;
    const pageHeaders = new Headers(headers);
    pageHeaders.set("content-type", "text/html; charset=utf-8");
    pageHeaders.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    pageHeaders.set("x-frame-options", "DENY");
    return new Response(html, { status: 200, headers: pageHeaders });
  }
  if (url.pathname === API && request.method === "GET") return json({ name: "OCodeJS Central API", version: "0.2.0-preview", environment: "preview", docs: "/docs", openapi: API + "/openapi.json" }, 200, headers);
  if (url.pathname === API + "/openapi.json" && request.method === "GET") return json(OPENAPI, 200, headers);
  if (url.pathname === API + "/modules" && request.method === "GET") return json({ modules: MODULES, count: MODULES.length, requestId: id }, 200, headers);
  if (url.pathname === API + "/providers" && request.method === "GET") return json({ providers: PROVIDERS, count: PROVIDERS.length, requestId: id }, 200, headers);

  const methods = METHODS[url.pathname];
  if (methods) {
    if (!methods.includes(request.method)) {
      headers.set("allow", [...methods, "OPTIONS"].join(", "));
      return error("METHOD_NOT_ALLOWED", "The requested identity route does not allow this method.", 405, id, headers);
    }
    const response = await handleIdentity(request, env, url);
    const output = new Response(response.body, { status: response.status, headers: response.headers });
    for (const name of ["cache-control", "x-content-type-options", "referrer-policy", "x-request-id", "vary",
      "access-control-allow-origin", "access-control-allow-credentials", "access-control-allow-methods",
      "access-control-allow-headers", "access-control-max-age"]) {
      const value = headers.get(name);
      if (value) output.headers.set(name, value);
    }
    return output;
  }
  if (url.pathname.startsWith(API + "/auth/") || url.pathname === API + "/me") return error("ROUTE_NOT_ALLOWED", "This identity route is not in the gateway allowlist.", 404, id, headers);
  return error("NOT_FOUND", "The requested API route does not exist.", 404, id, headers);
}
export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const id = requestId(request);
    const headers = headersFor(request, env, id);
    const started = Date.now();
    let response;
    try { response = await handle(request, env, url, id, headers); }
    catch { response = error("INTERNAL_ERROR", "The API could not complete the request.", 500, id, headers); }
    response.headers.set("server-timing", "app;dur=" + Math.max(0, Date.now() - started));
    console.log(JSON.stringify({ event: "central_api.request", requestId: id, method: request.method, path: url.pathname, status: response.status }));
    return response;
  }
};
