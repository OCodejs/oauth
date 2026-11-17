# Uploaded Source Audit — 2026-11-18

## Executive decision

The uploaded TAR is a separate Next.js 16 / React 19 / Prisma / SQLite application. The target repository is already a Fastify 5 / PostgreSQL authentication gateway. These are not the same codebase or compatible deployment layouts.

**Do not copy the TAR over the repository root.** Doing so would replace the target's working Fastify gateway, PostgreSQL schema, migrations, CI and API contract with a different application. The safer integration is to keep the Fastify gateway as the canonical authentication service and port only independently reviewed UI or feature components where there is a clear product requirement.

This audit is committed on `review/uploaded-nextjs-source`; it does not modify `main` or replace production code.

## 1. Uploaded archive inventory

- Framework: Next.js 16.1.1, React 19, TypeScript 5.
- Data layer: Prisma 6 with SQLite.
- Authentication endpoints: register, login, logout, current user, CSRF, email verification, resend verification, password-reset request and reset.
- Other application areas: docs CRUD, a documentation editor/viewer, UI components and runtime helper scripts.
- Main source areas: `src/app/api`, `src/lib`, `src/components`, `prisma/schema.prisma`.
- The archive contains its own Git history and is not a checkout of the target repository.

## 2. Findings in the uploaded source

### Critical — session secret has an insecure fallback

`src/lib/session.ts` falls back to the literal `dev-insecure-secret-change-me` when neither `SESSION_SECRET` nor `NEXTAUTH_SECRET` is configured. Production must fail closed when a strong secret is absent; it must never silently use a known default.

### High — session tokens are stateless and not revocable

The session cookie contains a user ID plus an HMAC. There is no persisted session record, session rotation or server-side revocation list. Password reset therefore cannot invalidate all existing sessions. The target gateway's opaque random session token, stored as a SHA-256 hash in PostgreSQL, is the stronger pattern.

### High — secret and local runtime files are tracked in the archive Git history

The uploaded archive tracks `.env`, `.zscripts/dev.pid` and `db/custom.db`. The environment file was not copied into this repository. Treat every credential that may have been present in that archive's `.env` as potentially exposed: rotate those credentials, and keep local database files and runtime state out of Git.

### High — token handling differs from the target's safer model

The uploaded application stores verification/reset token values directly in its Token table and exposes development links in API responses. The target hashes one-time tokens before persistence and sends links by email. Do not port raw-token storage or production token responses.

### Medium — synchronous password hashing

The uploaded password helper calls `scryptSync` inside a Promise wrapper. This still blocks the Node.js event loop. The target uses asynchronous Argon2id hashing.

### Medium — SQLite is not the target persistence contract

The uploaded Prisma schema is SQLite-specific and models `User`, `Token` and `Doc`. The target gateway uses PostgreSQL tables, migrations, session records and audit logs. Replacing the target schema with the uploaded Prisma schema would lose target capabilities and break its runtime.

### Medium — route protection and abuse controls need review

The uploaded routes use CSRF checks but do not show route-level rate limiting, account/session audit logging or persisted session revocation comparable to the target gateway. These should remain centralized in the Fastify service.

## 3. Target repository architecture observed

The target repository already implements:

- Fastify 5 API with strict environment validation.
- PostgreSQL connection pooling and ordered SQL migrations.
- Argon2id password hashing.
- Opaque random browser sessions; only token hashes are stored.
- Session expiry and revocation, including revocation after password reset.
- Hashed, single-use email-verification and password-reset tokens with 30-minute expiry.
- CSRF tokens signed with a dedicated secret and exact browser-origin allowlisting.
- SMTP email delivery, request rate limits and audit logs.
- GitHub Actions checks for PostgreSQL migration, typecheck, tests and build.

The current target README explicitly states that Google/GitHub federation and OAuth 2.0 / OpenID Connect provider functionality are future phases, not implemented.

## 4. Comparison

| Area | Uploaded TAR | Target repository | Integration decision |
|---|---|---|---|
| Runtime | Next.js app | Fastify API | Keep Fastify canonical |
| Database | SQLite + Prisma | PostgreSQL + SQL migrations | Do not replace target schema |
| Password hashing | Synchronous scrypt | Argon2id | Keep Argon2id |
| Browser session | Signed user ID cookie | Opaque random token + DB hash | Keep target sessions |
| Token persistence | Raw token | SHA-256 token hash | Keep target token hashing |
| CSRF | Cookie/header equality | HMAC-signed double-submit | Keep target implementation |
| Email | Dev links returned by API; no production mailer shown | SMTP delivery | Keep target email flow |
| Rate limiting | Not evident in reviewed routes | Global and route-level limits | Keep target controls |
| Documentation UI | Included | API gateway README + frontend integration contract | Port selectively only after UI review |

## 5. Deployment and integration plan

1. Keep `main` and the existing Fastify/PostgreSQL service intact.
2. Do not upload `.env`, SQLite database files, PID files, logs, dependencies or build output from the archive.
3. If the Next.js documentation/auth UI is desired, review and port only its UI components into a separate frontend package or static frontend deployment. It must call the existing Fastify API contract; it must not introduce a second independent user/session database.
4. Before production deployment, configure PostgreSQL, independent 32+ character `SESSION_SECRET` and `CSRF_SECRET`, exact `WEB_ORIGINS`, `APP_BASE_URL`, SMTP and trusted proxy hops.
5. Run the repository's migration, typecheck, test and build CI checks. A successful code upload alone is not proof of a live production deployment.

## 6. Remaining verification

This review inspected the uploaded source statically and compared it with the target repository's README, Fastify application, config, security, database, email and migration files. A full runtime build of the uploaded Next.js project and end-to-end deployment of the target service have not been performed in this audit. Production secrets and infrastructure credentials were not supplied and must not be inferred or committed.
