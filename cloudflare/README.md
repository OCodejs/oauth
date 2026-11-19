# OCodeJS Central API — Cloudflare Workers-native Preview

This branch adds a Workers-native identity backend for an isolated staging environment. It does not change Production or import any existing user data.

## Dedicated Preview resources

- Worker: `ocodejs-central-api-d1-preview`
- Preview API: https://ocodejs-central-api-d1-preview.ocodejs-df1.workers.dev
- Docs: https://ocodejs-central-api-d1-preview.ocodejs-df1.workers.dev/docs
- OpenAPI: https://ocodejs-central-api-d1-preview.ocodejs-df1.workers.dev/api/v1/openapi.json
- Live health: https://ocodejs-central-api-d1-preview.ocodejs-df1.workers.dev/health/live
- Readiness: https://ocodejs-central-api-d1-preview.ocodejs-df1.workers.dev/health/ready
- Dedicated D1: `ocodejs-central-api-preview`
- D1 database ID: `c6c0e235-e1a9-4ede-9a4b-27debc9c2a9b`
- Native Worker entrypoint: `cloudflare/worker-native.mjs`
- Identity implementation: `cloudflare/identity.mjs`
- D1 migration: `cloudflare/migrations/0001_identity.sql`

Cloudflare confirmed the new Worker upload and its `workers.dev` / Preview URL settings. The Worker is separate from the earlier `ocodejs-central-api-preview` gateway Worker. No custom domain, zone route or DNS record is attached.

## Workers-native architecture

- Cloudflare Worker handles the API gateway, CORS, request IDs, health checks and OpenAPI.
- D1 stores users, sessions, single-use verification/reset tokens, audit events and rate-limit counters.
- Web Crypto implements signed double-submit CSRF, SHA-256 token hashing and versioned PBKDF2-SHA256 password hashes.
- Email uses an HTTPS JSON API compatible with Resend's email endpoint. No email key is committed; sending remains unavailable until Preview-only secrets and a verified sender are configured.
- Session tokens are opaque random values; only SHA-256 hashes are persisted. Session cookies are Secure, HttpOnly and SameSite=Lax.
- Identity routes preserve the existing route contract: CSRF, register, verify email, resend verification, request/reset password, login, logout and current user.

## Password compatibility and account isolation

The legacy Node.js service uses Argon2id. This Worker Preview uses a versioned `pbkdf2-sha256` format with 600,000 iterations so it can run through Web Crypto without native Node addons. Existing Argon2id hashes are deliberately not accepted by the new verifier, and no existing account data is copied. Any future account migration needs a separately reviewed re-enrollment or dual-verifier plan; it is not part of this Preview.

## Required Preview-only bindings and variables

- D1 binding: `DB` → the dedicated database ID above.
- Secret: `CSRF_SECRET` — random value, minimum 32 characters.
- Secret: `EMAIL_API_KEY` — Resend-compatible email provider API key; never commit it.
- Variable: `EMAIL_API_URL` — optional HTTPS endpoint; defaults to `https://api.resend.com/emails`.
- Variable: `EMAIL_FROM` — verified sender address.
- Variable: `APP_BASE_URL` — HTTPS frontend URL that receives `?verify=` and `?reset=` links.
- Variable: `ALLOWED_ORIGINS` — exact comma-separated browser origins.
- Variable: `SESSION_TTL_SECONDS` — optional, defaults to 604800 and is clamped to 300–2592000.

Do not configure these on Production. Do not reuse any Production secret, sender domain or database. Until `CSRF_SECRET`, `EMAIL_API_KEY`, `EMAIL_FROM` and `APP_BASE_URL` are set, readiness intentionally returns HTTP 503 and identity operations fail closed.

## Deployment and validation

- Dedicated staging Worker uploaded successfully on 2026-11-18; Cloudflare reports a `fetch` handler and startup time of approximately 4 ms.
- D1 migration `0001_identity.sql` applied successfully to the dedicated Preview database. Table and index inventory was verified through the D1 API.
- Automated GitHub Actions were triggered for the draft PR, but GitHub returned failed jobs with runner ID `0` and no steps. No CI test steps executed; this is not a passing test result.
- Direct HTTP smoke tests from the execution environment were blocked by network access. Open the URLs above in Safari to verify live HTTP responses after configuring Preview secrets.

Before enabling successful public registrations with real email delivery:
1. Enter the Preview-only `CSRF_SECRET` and `EMAIL_API_KEY` in Cloudflare Worker secrets.
2. Set the verified `EMAIL_FROM`, HTTPS `APP_BASE_URL` and exact `ALLOWED_ORIGINS`.
3. Verify health, CSRF, registration, email verification, login, `/me`, logout, password reset, rate limits and CORS using synthetic test accounts only.

Public registration is open to any visitor; there is no invite list or administrator approval. The endpoint enforces a per-IP rate limit and requires email verification before login. It fails closed before creating a user row unless the Preview email API key, verified sender, HTTPS app URL and allowed email endpoint are configured. If an email provider rejects a message after account creation, the account remains unverified and can use the non-enumerating resend route after the provider is restored. Do not use real customer addresses for Preview tests.

## Cost and safety

D1 is available on Workers Free and Paid plans. Free usage has daily row read/write limits; Paid usage can incur charges above included quotas. This project created one isolated database and did not upgrade the account plan. See https://developers.cloudflare.com/d1/platform/pricing/ and https://developers.cloudflare.com/d1/platform/limits/.

No Production custom domain, DNS record, zone route, account migration, real user data import, SMTP configuration, paid-plan change or automatic promotion is included.
