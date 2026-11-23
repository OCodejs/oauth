# OCodeJS Identity — Auth Gateway

Central identity and authentication gateway for the Velclaw ecosystem (Velclaw, Velcli, Velclawhost and OCodeJS).

> Current implementation: Phase 1–2 foundation, email/password accounts, email verification, password reset and browser session APIs. Google/GitHub federation and the OAuth 2.0 / OpenID Connect provider are later phases and are not implemented yet.

## OCodeJS API documentation

- [Unified OCodeJS × Velclaw Authentication architecture](docs/UNIFIED-AUTHENTICATION.md) — canonical identity, session, protocol and authorization boundaries.
- [Authentication source repository map](docs/SOURCE-REPOSITORY-MAP.md) — repositories reviewed, relevant sources and quarantine decisions.
- [Staged integration and migration plan](docs/INTEGRATION-MIGRATION-PLAN.md) — Preview-first rollout and data-safety gates.
- [Central API architecture and rollout plan](docs/platform-api-architecture.md) — target platform boundaries, module status, security and phased cutover.
- [Identity API OpenAPI 3.1 contract](docs/openapi-identity-v1.yaml) — verified contract for endpoints implemented in this repository only.
- [Cloudflare Workers Preview](cloudflare/README.md) — edge gateway architecture, environment variables and Preview verification.

**Important:** the OpenAPI file documents the current identity routes. It does not claim that planned API-key management, Web4s, social-network, webhook or developer-console endpoints are live. Provider adapters require official provider specifications and sandbox verification.

## Architecture

- Fastify API and PostgreSQL persistence for the Node.js identity service.
- Cloudflare Workers edge gateway in `cloudflare/worker.mjs`; it forwards a strict identity-route allowlist to the Node.js service when `AUTH_ORIGIN` is configured.
- Passwords are hashed with Argon2id.
- Browser sessions use opaque random tokens in HttpOnly cookies; only SHA-256 token hashes are stored.
- Email verification and password-reset tokens are random, single-use, expire after 30 minutes, and are stored as hashes. Issuance is serialized per account; verification and password reset apply token consumption and account changes transactionally.
- CSRF uses a signed double-submit token and exact browser-origin allowlisting.
- SMTP delivers verification and password-reset emails. In development without SMTP, links are logged to the server console only.

## Requirements and setup

- Node.js 22+
- PostgreSQL 14+
- SMTP credentials for production email delivery

```bash
npm install
cp .env.example .env
```

Configure `DATABASE_URL`, independent `SESSION_SECRET` and `CSRF_SECRET` values (at least 32 characters), `APP_BASE_URL`, exact `WEB_ORIGINS`, and SMTP settings. In production, `SMTP_HOST` is mandatory. Set `TRUST_PROXY_HOPS` only to the number of trusted reverse-proxy hops in front of the app; leave it at `0` unless the hosting topology is known.

```bash
npm run db:migrate
npm run dev
```

The API listens on `http://localhost:3000` by default. Migrations are ordered and tracked in `schema_migrations`; they are safe to rerun.

## API

- `GET /health` — health check.
- `GET /api/v1/auth/csrf` — issues CSRF cookie and token.
- `POST /api/v1/auth/register` — creates an unverified account and sends verification email. No session is created.
- `POST /api/v1/auth/verify-email` — consumes a single-use verification token.
- `POST /api/v1/auth/resend-verification` — sends a new verification link; response does not reveal account existence.
- `POST /api/v1/auth/login` — email/password login; verified email is required.
- `POST /api/v1/auth/request-password-reset` — requests a reset link with a non-enumerating response.
- `POST /api/v1/auth/reset-password` — consumes a single-use reset token, changes the password and revokes all sessions.
- `GET /api/v1/me` — returns the current authenticated user.
- `POST /api/v1/auth/logout` — revokes the current session and clears its cookie.

All state-changing browser requests must first call the CSRF endpoint, send cookies with `credentials: "include"`, and include the returned value in `X-CSRF-Token`.

## Frontend integration

The existing `index.html` now calls the API for login, registration, email verification, resend verification and password reset. By default it expects the API on the same origin. If the UI is hosted separately, define `window.AUTH_API_BASE = "https://<auth-host>"` before the page script and add the exact UI origin to `WEB_ORIGINS`. Configure `APP_BASE_URL` as the public URL where the UI handles the verification/reset query parameters.

## CI and local checks

```bash
npm run typecheck
npm test
npm run build
```

A GitHub Actions workflow is configured to run these checks on pull requests and pushes to `main`; confirm a successful run in the PR before merging. Automated tests cover token generation/hashing, CSRF validation, and a PostgreSQL-backed registration/login gate. They do not yet exercise successful email delivery, token consumption end-to-end, or a full browser flow.

## Production safety

- Use HTTPS; `NODE_ENV=production` enables Secure cookies.
- Never use wildcard CORS origins with credentials.
- Set `COOKIE_DOMAIN` only when UI and API intentionally share a parent domain.
- Configure PostgreSQL backups, monitoring, SMTP deliverability and the exact trusted proxy hop count before production.
- Email verification and reset links use the public `APP_BASE_URL`; the UI sends a no-referrer policy and removes reset tokens from browser history immediately.
- Public registration should remain disabled until deployment-level abuse controls, monitoring and mail delivery have been verified.
- Do not put provider secrets or database credentials in frontend code.
- Google/GitHub OAuth, OIDC issuer endpoints, client registry, consent, refresh tokens and ecosystem SSO are not implemented yet.
