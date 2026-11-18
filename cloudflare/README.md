# Cloudflare Workers Preview — OCodeJS Central API

This repository contains two distinct runtimes:

- `server/`: the existing Node.js 22 Fastify identity service. It requires PostgreSQL and SMTP; it is not a Cloudflare Worker entrypoint.
- `cloudflare/worker.mjs`: a Cloudflare Workers edge gateway using Node.js compatibility. It serves health, module/provider registry and OpenAPI documentation, and forwards only the explicit identity route allowlist to the Node.js service.

## Preview worker

The isolated Staging Worker name is `ocodejs-central-api-preview`.

- Staging URL: https://ocodejs-central-api-preview.ocodejs-df1.workers.dev
- Human-readable docs: https://ocodejs-central-api-preview.ocodejs-df1.workers.dev/docs
- OpenAPI JSON: https://ocodejs-central-api-preview.ocodejs-df1.workers.dev/api/v1/openapi.json
- Live health: https://ocodejs-central-api-preview.ocodejs-df1.workers.dev/health/live
- Readiness: https://ocodejs-central-api-preview.ocodejs-df1.workers.dev/health/ready

The Worker is deployed in the OCodeJS Cloudflare account with its own `workers.dev` hostname; Cloudflare Version Preview URLs are also enabled. It is not attached to a production custom domain or zone route. The existing `ocodejs-server-api-staging` Worker is not modified by this project.

The Worker uses a current compatibility date and the Node.js compatibility runtime for `node:crypto`. Cloudflare Workers does not provide a complete Node.js server runtime: do not try to run Fastify's `app.listen()`, PostgreSQL's `pg.Pool`, Nodemailer SMTP sockets, or native `argon2` inside this Worker. Keep those operations in the Node.js identity service and connect it through the explicit HTTPS `AUTH_ORIGIN` upstream.

## Environment configuration

Set these as non-secret Worker variables in the Preview environment:

- `ALLOWED_ORIGINS`: comma-separated exact frontend origins. Same-origin browser requests are allowed automatically. Do not use `*` with credentialed requests.
- `AUTH_ORIGIN`: optional HTTPS origin of the Node.js Fastify auth service (origin only, no path, credentials, query or fragment). Until configured, identity routes fail closed with HTTP 503 and readiness returns HTTP 503.

No API keys or passwords are required by the edge gateway itself. Configure database, SMTP and session secrets only in the Node.js service's secret manager, never in Git or this Worker source.

## Preview API routes

- `GET /health/live`
- `GET /health/ready`
- `GET /docs` — human-readable API docs page.
- `GET /api/v1`
- `GET /api/v1/modules`
- `GET /api/v1/providers`
- `GET /api/v1/openapi.json`
- The identity routes in `cloudflare/worker.mjs` are forwarded only when `AUTH_ORIGIN` is valid and configured.

Provider modules, API-key management, webhooks, Web4s and social-network integrations remain explicitly unimplemented or blocked on official specifications. The registry reports these states; it does not simulate success.

## Deploying a separate Staging Worker

The deployment target is a new Worker named `ocodejs-central-api-preview` in the OCodeJS account. Upload the module with metadata:

```json
{
  "main_module": "worker.mjs",
  "compatibility_date": "2026-11-18",
  "compatibility_flags": ["nodejs_compat"],
  "bindings": [],
  "observability": {
    "enabled": true,
    "logs": { "enabled": true, "invocation_logs": true, "persist": true },
    "traces": { "enabled": false }
  }
}
```

Enable the `workers.dev` hostname and Preview URLs only for this dedicated Staging Worker. Do not attach custom domains, zone routes, queues, schedules, or production resources.

After upload, verify:
1. `GET /docs` serves the human-readable API docs and links to OpenAPI JSON.
2. `GET /health/live` returns HTTP 200 and identifies `environment: preview`.
3. `GET /health/ready` returns HTTP 503 until the Node.js upstream is configured.
4. `GET /api/v1/openapi.json` returns OpenAPI 3.1.
5. `GET /api/v1/modules` clearly identifies planned and blocked modules.
6. Browser CORS rejects origins not explicitly allowlisted.
7. Every identity proxy route returns 503 until a verified HTTPS `AUTH_ORIGIN` is configured.

This Staging Worker is isolated by name and hostname. It is not the Production API and must not be treated as a cutover.
