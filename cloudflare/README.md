# OCodeJS Central API — Cloudflare Workers Preview

This branch adds a Workers-native identity backend for an isolated staging environment. It does not change Production or import any existing user data.

## Preview resources

- Gateway Worker: `ocodejs-central-api-preview`
- Existing gateway Preview URL: https://ocodejs-central-api-preview.ocodejs-df1.workers.dev
- Dedicated D1 database: `ocodejs-central-api-preview`
- D1 database ID: `c6c0e235-e1a9-4ede-9a4b-27debc9c2a9b`
- Native Worker entrypoint: `cloudflare/worker-native.mjs`
- Identity implementation: `cloudflare/identity.mjs`
- D1 migration: `cloudflare/migrations/0001_identity.sql`

The existing Node.js 22/Fastify/PostgreSQL service remains in the repository as the legacy implementation. This Preview path does not connect to its database and does not import its accounts.

## Workers-native architecture

- Cloudflare Worker handles the API gateway, CORS, request IDs, health checks and OpenAPI.
- D1 stores users, sessions, single-use verification/reset tokens, audit events and rate-limit counters.
- Web Crypto implements signed double-submit CSRF, SHA-256 token hashing and versioned PBKDF2-SHA256 password hashes.
- Email uses an HTTPS JSON API compatible with Resend's email endpoint. No email key is committed; sending stays unavailable until a Preview-only secret is entered in Cloudflare.
- Session tokens are opaque random values; only SHA-256 hashes are persisted. Session cookies are Secure, HttpOnly and SameSite=Lax.
- Identity routes preserve the existing route contract: CSRF, register, verify email, resend verification, request/reset password, login, logout and current user.

## Password compatibility and account isolation

The legacy Node.js service uses Argon2id. This Worker Preview uses a versioned `pbkdf2-sha256` format with 600,000 iterations so it can run through Web Crypto without native Node addons. Existing Argon2id hashes are deliberately not accepted by the new verifier, and no existing account data is copied. Any future account migration needs a separately reviewed re-enrollment or dual-verifier plan; it is not part of this Preview.

## Required Preview-only bindings and variables

- D1 binding: `DB` → the dedicated database ID above.
- Secret: `CSRF_SECRET` — random value, minimum 32 characters.
- Secret: `EMAIL_API_KEY` — email provider API key; never commit it.
- Variable: `EMAIL_API_URL` — optional HTTPS endpoint; defaults to `https://api.resend.com/emails`.
- Variable: `EMAIL_FROM` — verified sender address.
- Variable: `APP_BASE_URL` — HTTPS frontend URL that receives `?verify=` and `?reset=` links.
- Variable: `ALLOWED_ORIGINS` — exact comma-separated browser origins.
- Variable: `SESSION_TTL_SECONDS` — optional, defaults to 604800 and is clamped to 300–2592000.

Do not configure these on Production. Do not reuse any Production secret, sender domain or database.

## Preview deployment

The new source is uploaded as a Worker **Version Preview**, not promoted to the active Worker deployment. The stable Worker alias must remain unchanged. The Version Preview endpoint should be tested directly after upload.

Before a Preview version can become ready:
1. Apply `cloudflare/migrations/0001_identity.sql` only to the dedicated D1 Preview database.
2. Bind the database as `DB` on the Preview version.
3. Add Preview-only `CSRF_SECRET` and email provider secret through Cloudflare's secret manager.
4. Set the exact `APP_BASE_URL`, `EMAIL_FROM` and `ALLOWED_ORIGINS`.
5. Verify health, CSRF, registration, email verification, login, `/me`, logout, reset, rate limits and CORS using synthetic test accounts.

If email is not configured, registration persists an unverified staging account and returns a safe 503; the resend route remains non-enumerating. Do not use real customer addresses.

## Cost and safety

D1 is available on Workers Free and Paid plans. Free usage has daily row read/write limits; Paid usage can incur charges above included quotas. This project creates one isolated database and does not upgrade the account plan. See https://developers.cloudflare.com/d1/platform/pricing/ and https://developers.cloudflare.com/d1/platform/limits/.

No Production custom domain, DNS record, zone route, account migration, real user data import, SMTP configuration, paid-plan change or automatic promotion is included.
