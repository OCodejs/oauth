# OCodeJS Central API — Architecture and Rollout

**Status:** foundation / design contract. This document does not claim that planned modules or endpoints are deployed.

## Objective

Provide one versioned API entry point for OCodeJS products and integrations. Keep identity/authentication as a dedicated capability inside the platform; isolate each third-party provider behind its own adapter.

## Existing verified foundation

The current Node.js service in this repository is a Fastify 5 + PostgreSQL identity gateway. It already implements:

- Email/password registration, email verification, login, password reset and logout.
- Argon2id password hashing.
- Opaque browser sessions; only SHA-256 session-token hashes are stored.
- Single-use, hashed account-action tokens.
- CSRF protection, exact browser-origin allowlisting, rate limits and audit logs.
- Node.js 22+, PostgreSQL migrations and GitHub Actions checks.

The current service does **not** yet implement a general API-key management plane, OAuth/OIDC provider, social-network integrations, Web4s endpoints, webhook delivery, or a complete partner API catalog.

## Target logical architecture

```text
OCodeJS apps / partner clients
          |
          v
  API edge: HTTPS, CORS, request IDs, rate limits
          |
          v
     /api/v1 router
          |
          +-- identity       (existing auth gateway routes)
          +-- developer      (API clients, keys, scopes) [planned]
          +-- catalog        (service and capability registry) [planned]
          +-- integrations   (one adapter per verified provider)
          |      +-- Web4s   [blocked on official partner OpenAPI]
          |      +-- social providers [provider-by-provider review]
          +-- webhooks      (signed outbound events) [planned]
          +-- audit         (security and admin events)
          |
          v
 PostgreSQL / provider-specific outbound clients
```

This is a logical target, not a claim that every box is implemented. Keep the current identity service as the source of truth for users and browser sessions. Do not create a second user/session database in a provider adapter.

## API conventions

- Base path: `/api/v1`; breaking changes require a new major version.
- JSON request and response bodies; UTF-8; ISO-8601 UTC timestamps.
- Stable error shape: `{ "error": { "code": "...", "message": "...", "requestId": "..." } }` for new platform modules. Existing auth response bodies remain backward-compatible until a separately reviewed migration.
- Validate every path, query and body with schemas; reject unknown or invalid values where practical.
- Apply per-route rate limits and scope checks; never rely on CORS as authentication.
- Use request IDs and structured logs. Redact cookies, authorization headers, API secrets, tokens, passwords and personal data.
- Paginate list endpoints with bounded page size and deterministic cursors.
- Use idempotency keys for future write operations that support retries.
- Publish only endpoints that are implemented, tested and backed by an authoritative provider contract.

## Authentication model

### Browser applications

Continue using the existing HttpOnly session cookie and CSRF double-submit protection. State-changing browser requests must send the CSRF token in `X-CSRF-Token` and include credentials.

### Machine-to-machine clients (planned)

Do not reuse browser cookies for server integrations. The proposed API-client model is:

1. A public key / client ID identifies a credential; it is not a secret.
2. The secret is shown once at creation and stored only as a secure hash (or encrypted only when a documented use case requires retrieval).
3. Each credential has explicit scopes, owner, creation time, expiry, last-used time and revocation state.
4. Prefer short-lived access tokens minted from the client credential. If request signing is required, use a reviewed HMAC scheme with timestamp, nonce and canonical request input.
5. Support rotation and immediate revocation; never put secret values in URLs, browser bundles, logs, docs examples or Git history.

This machine credential flow is **not implemented by the current auth routes**. Do not publish or use it until code, migrations, tests and key-management UX exist.

## Integration policy

Each provider gets a separate adapter with:

- Official base URL and version, verified authentication scheme and required scopes.
- Explicit endpoint allowlist and request/response schemas.
- Provider-specific timeout, retry policy, pagination and rate-limit handling.
- Mock tests for success, validation failure, timeout, rate limiting and malformed responses.
- Sandbox-first configuration; production credentials and production calls remain disabled until separately approved.

### Web4s

The existing `zskbot/ocodejs-web4s-bridge` is a transport-only, GET-only foundation. It intentionally does not guess Web4s paths or authentication. Do not add live Web4s routes until the account-specific official OpenAPI document confirms the API version, base URL, authentication, endpoint paths, schemas, scopes, pagination, rate limits, errors and sandbox availability.

### Social platforms

Do not claim every social API is free. Access, quotas, app review, scopes and pricing vary by provider and can change. Add each provider only after checking its current official developer terms and access requirements.

## Rollout phases

1. **Contract and inventory:** preserve old docs as a dated archive; inventory current consumers and endpoints; publish the verified auth OpenAPI contract.
2. **Core platform:** add API-client registry, scoped credentials, revocation, request IDs, common error handling and audit events behind tests.
3. **Provider adapters:** integrate Web4s and each social provider independently from verified official specifications.
4. **Sandbox verification:** mock and sandbox tests, security review, dependency and migration review, CI green.
5. **Preview deployment:** configure secrets in the hosting provider's secret manager; never commit them. Verify health, logs and rollback.
6. **Cutover:** update clients gradually, monitor error rates, retain old routes/docs during the compatibility window, then retire old interfaces only after consumer confirmation.

## Required inputs before provider implementation

- Official OpenAPI JSON/YAML or vendor documentation export with secrets removed.
- Provider account/API version and sandbox base URL.
- Authentication method and scope definitions.
- Exact endpoints and request/response schemas.
- Rate limits, pagination, error catalogue and retry guidance.
- Hosting target and non-production environment URL.
- List of existing clients that must remain compatible.

Never send API keys, secret keys, access tokens, passwords, customer records or unredacted production payloads in chat or GitHub issues.
