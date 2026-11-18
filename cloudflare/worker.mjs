import { randomUUID } from "node:crypto";

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
  { id: "identity", name: "Identity & Authentication", state: "proxy_ready", implementation: "existing_node_service", endpoints: Object.keys(METHODS) },
  { id: "developer-api-keys", name: "Developer API Keys", state: "planned", implementation: "not_implemented", endpoints: [] },
  { id: "integrations", name: "Provider Integrations", state: "blocked_on_official_specs", implementation: "adapter_architecture_only", endpoints: [] },
  { id: "webhooks", name: "Webhooks", state: "planned", implementation: "not_implemented", endpoints: [] },
  { id: "audit", name: "Security Audit", state: "partial", implementation: "gateway_request_logs_only", endpoints: [] }
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
    version: "0.1.0-preview",
    description: "Cloudflare Workers edge gateway. Identity endpoints are forwarded to the existing Node.js auth service only when AUTH_ORIGIN is configured. Provider, API-key and webhook modules are not yet implemented."
  },
  servers: [{ url: "/", description: "Current Worker origin" }],
  tags: [{ name: "System" }, { name: "Platform" }, { name: "Identity" }],
  paths: {
    "/health/live": { get: { tags: ["System"], operationId: "healthLive", responses: { "200": { description: "Worker process is responding." } } } },
    "/health/ready": { get: { tags: ["System"], operationId: "healthReady", responses: { "200": { description: "Gateway and required upstream are configured." }, "503": { description: "Identity upstream is not configured." } } } },
    "/api/v1": { get: { tags: ["Platform"], operationId: "apiIndex", responses: { "200": { description: "API index and route list." } } } },
    "/api/v1/modules": { get: { tags: ["Platform"], operationId: "listModules", responses: { "200": { description: "Module registry with implementation states." } } } },
    "/api/v1/providers": { get: { tags: ["Platform"], operationId: "listProviders", responses: { "200": { description: "Provider registry; not a claim of live integration." } } } },
    "/docs": { get: { tags: ["Platform"], operationId: "getDocs", responses: { "200": { description: "Human-readable API documentation page." } } } },
    "/api/v1/openapi.json": { get: { tags: ["Platform"], operationId: "getOpenApi", responses: { "200": { description: "This OpenAPI 3.1 document." } } } },
    "/api/v1/auth/csrf": { get: { tags: ["Identity"], operationId: "getCsrf", responses: { "200": { description: "Proxied CSRF token." }, "503": { description: "AUTH_ORIGIN is not configured." } } } },
    "/api/v1/auth/register": { post: { tags: ["Identity"], operationId: "register", responses: { "201": { description: "Proxied registration response." }, "503": { description: "AUTH_ORIGIN is not configured." } } } },
    "/api/v1/auth/verify-email": { post: { tags: ["Identity"], operationId: "verifyEmail", responses: { "200": { description: "Proxied email verification response." }, "503": { description: "AUTH_ORIGIN is not configured." } } } },
    "/api/v1/auth/resend-verification": { post: { tags: ["Identity"], operationId: "resendVerification", responses: { "200": { description: "Proxied verification resend response." }, "503": { description: "AUTH_ORIGIN is not configured." } } } },
    "/api/v1/auth/request-password-reset": { post: { tags: ["Identity"], operationId: "requestPasswordReset", responses: { "200": { description: "Proxied password reset request response." }, "503": { description: "AUTH_ORIGIN is not configured." } } } },
    "/api/v1/auth/reset-password": { post: { tags: ["Identity"], operationId: "resetPassword", responses: { "200": { description: "Proxied password reset response." }, "503": { description: "AUTH_ORIGIN is not configured." } } } },
    "/api/v1/auth/login": { post: { tags: ["Identity"], operationId: "login", responses: { "200": { description: "Proxied login response." }, "503": { description: "AUTH_ORIGIN is not configured." } } } },
    "/api/v1/auth/logout": { post: { tags: ["Identity"], operationId: "logout", responses: { "200": { description: "Proxied logout response." }, "503": { description: "AUTH_ORIGIN is not configured." } } } },
    "/api/v1/me": { get: { tags: ["Identity"], operationId: "getCurrentUser", responses: { "200": { description: "Proxied current-user response." }, "503": { description: "AUTH_ORIGIN is not configured." } } } }
  }
};

function requestId(request) {
  const value = request.headers.get("x-request-id") || "";
  return /^[A-Za-z0-9._-]{8,80}$/.test(value) ? value : randomUUID();
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean);
}

function baseHeaders(request, env, id) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Request-Id": id,
    "Vary": "Origin"
  });
  const origin = request.headers.get("Origin");
  const sameOrigin = new URL(request.url).origin;
  if (origin && (origin === sameOrigin || allowedOrigins(env).includes(origin))) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, X-Request-Id");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}

function json(data, status, headers) {
  const output = new Headers(headers);
  output.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: output });
}

function error(code, message, status, id, headers) {
  return json({ error: { code, message, requestId: id } }, status, headers);
}

function getAuthOrigin(env) {
  if (typeof env.AUTH_ORIGIN !== "string" || !env.AUTH_ORIGIN.trim()) return null;
  let url;
  try { url = new URL(env.AUTH_ORIGIN); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  return url.origin;
}

async function proxyIdentity(request, env, url, id, headers) {
  const origin = getAuthOrigin(env);
  if (!origin) return error("IDENTITY_UPSTREAM_NOT_CONFIGURED", "The Node.js identity service is not connected to this Preview environment.", 503, id, headers);

  const method = request.method;
  const forward = new Headers();
  for (const name of ["accept", "content-type", "cookie", "x-csrf-token", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) forward.set(name, value);
  }
  forward.set("x-request-id", id);
  const target = new URL(url.pathname + url.search, origin);
  try {
    const response = await fetch(target, {
      method,
      headers: forward,
      body: method === "GET" || method === "HEAD" ? undefined : request.body,
      redirect: "error",
      signal: AbortSignal.timeout(8000)
    });
    const responseHeaders = new Headers(headers);
    for (const name of ["content-type", "set-cookie", "www-authenticate", "retry-after"]) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return error("IDENTITY_UPSTREAM_UNAVAILABLE", "The Node.js identity service did not respond safely.", 502, id, headers);
  }
}

async function handle(request, env, url, id, headers) {
  if (request.method === "OPTIONS") {
    if (request.headers.get("Origin") && !headers.has("Access-Control-Allow-Origin")) {
      return error("ORIGIN_NOT_ALLOWED", "This browser origin is not allowed.", 403, id, headers);
    }
    return new Response(null, { status: 204, headers });
  }

  if (request.headers.get("Origin") && !headers.has("Access-Control-Allow-Origin")) {
    return error("ORIGIN_NOT_ALLOWED", "This browser origin is not allowed.", 403, id, headers);
  }

  if (url.pathname === "/health/live" && request.method === "GET") {
    return json({ ok: true, service: "ocodejs-central-api", runtime: "cloudflare-workers-nodejs-compat", environment: "preview", requestId: id }, 200, headers);
  }

  if (url.pathname === "/health/ready" && request.method === "GET") {
    const configured = Boolean(getAuthOrigin(env));
    return json({ ready: configured, gateway: "ready", identity: configured ? "configured" : "not_configured", environment: "preview", requestId: id }, configured ? 200 : 503, headers);
  }

  if (url.pathname === API || url.pathname === API + "/") {
    if (request.method !== "GET") return error("METHOD_NOT_ALLOWED", "This route supports GET only.", 405, id, headers);
    return json({ name: "OCodeJS Central API", version: "0.1.0-preview", environment: "preview", docs: "/docs", openapi: API + "/openapi.json", routes: ["/health/live", "/health/ready", "/docs", API + "/modules", API + "/providers", API + "/openapi.json", ...Object.keys(METHODS)] }, 200, headers);
  }

  if (url.pathname === "/docs") {
    if (request.method !== "GET") return error("METHOD_NOT_ALLOWED", "This route supports GET only.", 405, id, headers);
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OCodeJS Central API Preview</title><style>:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#05070f;color:#f3f5fb}body{max-width:960px;margin:48px auto;padding:0 20px}h1{font-size:24px}p,li{line-height:1.7;color:#b9c0d0}a{color:#8bb4ff}code,pre{background:#0a0d1a;border:1px solid #303747;padding:12px;display:block;overflow:auto}a{border:1px solid #46506a;padding:10px;display:inline-block;margin:6px 8px 6px 0;text-decoration:none}</style><h1>OCodeJS Central API</h1><p>Isolated Cloudflare Workers Preview. This is not Production.</p><p><a href="/api/v1/openapi.json">OpenAPI 3.1 JSON</a><a href="/api/v1/modules">Module registry</a><a href="/api/v1/providers">Provider registry</a><a href="/health/live">Live health</a><a href="/health/ready">Readiness</a></p><h2>Identity upstream</h2><p>Identity routes proxy to the Node.js Fastify service only after AUTH_ORIGIN is configured as a valid HTTPS origin. Until then, they fail closed with HTTP 503.</p><h2>API modules</h2><pre id="modules">Loading module registry…</pre><script>fetch('/api/v1/modules').then(r=>r.json()).then(v=>document.querySelector('#modules').textContent=JSON.stringify(v,null,2)).catch(()=>document.querySelector('#modules').textContent='Unable to load registry');</script></html>`;
    const pageHeaders = new Headers(headers);
    pageHeaders.set("Content-Type", "text/html; charset=utf-8");
    pageHeaders.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    pageHeaders.set("X-Frame-Options", "DENY");
    return new Response(html, { status: 200, headers: pageHeaders });
  }

  if (url.pathname === API + "/openapi.json") {
    if (request.method !== "GET") return error("METHOD_NOT_ALLOWED", "This route supports GET only.", 405, id, headers);
    return json(OPENAPI, 200, headers);
  }

  if (url.pathname === API + "/modules") {
    if (request.method !== "GET") return error("METHOD_NOT_ALLOWED", "This route supports GET only.", 405, id, headers);
    return json({ modules: MODULES.map((item) => ({ ...item, endpoints: [...item.endpoints], state: item.id === "identity" && !getAuthOrigin(env) ? "awaiting_nodejs_upstream" : item.state })), count: MODULES.length, requestId: id }, 200, headers);
  }

  if (url.pathname === API + "/providers") {
    if (request.method !== "GET") return error("METHOD_NOT_ALLOWED", "This route supports GET only.", 405, id, headers);
    return json({ providers: PROVIDERS, count: PROVIDERS.length, requestId: id }, 200, headers);
  }

  const methods = METHODS[url.pathname];
  if (methods) {
    if (!methods.includes(request.method)) {
      headers.set("Allow", [...methods, "OPTIONS"].join(", "));
      return error("METHOD_NOT_ALLOWED", "The requested identity route does not allow this method.", 405, id, headers);
    }
    return proxyIdentity(request, env, url, id, headers);
  }

  if (url.pathname.startsWith(API + "/auth/") || url.pathname === API + "/me") {
    return error("ROUTE_NOT_ALLOWED", "This identity route is not in the gateway allowlist.", 404, id, headers);
  }

  return error("NOT_FOUND", "The requested API route does not exist.", 404, id, headers);
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const id = requestId(request);
    const headers = baseHeaders(request, env, id);
    const started = Date.now();
    let response;
    try {
      response = await handle(request, env, url, id, headers);
    } catch {
      response = error("INTERNAL_ERROR", "The API could not complete the request.", 500, id, headers);
    }
    response.headers.set("Server-Timing", "app;dur=" + Math.max(0, Date.now() - started));
    console.log(JSON.stringify({ event: "central_api.request", requestId: id, method: request.method, path: url.pathname, status: response.status }));
    return response;
  }
};
