# Unified Authentication — OCodeJS × Velclaw

**Status:** architecture and documentation consolidation proposal  
**Canonical implementation candidate:** this repository, `zskbot/Authentication`  
**Scope:** shared identity, authentication, sessions and authorization contracts for OCodeJS and Velclaw products.

This document defines the intended single Authentication platform. It does not claim that planned federation, OAuth/OIDC issuer, SSO, MFA or every client integration is implemented or deployed.

## 1. Decision

Use this repository's Fastify + PostgreSQL Auth Gateway as the shared identity authority for OCodeJS and Velclaw applications.

- One canonical user identity and account lifecycle.
- One browser-session contract for integrated first-party applications.
- One server-side authorization policy and audit boundary.
- Provider-specific adapters remain separate modules behind the gateway.
- Product repositories retain their UI and domain APIs; they do not create competing user stores.
- Existing parallel implementations remain untouched until migration and rollback are verified.

The gateway's current Phase 1–2 implementation is the baseline: email/password, email verification, password reset, opaque browser sessions, CSRF and API routes. Google/GitHub federation and OAuth 2.0 / OpenID Connect Provider functions are future work, not current capabilities.

## 2. Canonical logical architecture

```text
 OCodeJS apps                    Velclaw apps
 (Ask, Profile, CLI, docs)       (Host, VelCli, Control Center)
          |                                |
          +---------------+----------------+
                          |
             First-party client adapters
        (cookie + CSRF / server-to-server auth)
                          |
                 HTTPS API / Edge
             Cloudflare Worker (optional)
          strict route allowlist; no identity DB
                          |
                 Fastify /api/v1
             Canonical Authentication Core
        +-----------------+------------------+
        |                 |                  |
     Identity           Sessions          Authorization
     accounts           opaque tokens     RBAC / policy
     credentials        revoke/expire     resource checks
     verification       CSRF/origin       audit events
     recovery           device lifecycle (planned)
        |                 |                  |
        +-----------------+------------------+
                          |
                 Dedicated PostgreSQL
             canonical users + sessions
                          |
             Provider Adapter Registry
       Google / GitHub / generic OIDC / email
                          |
             External OAuth / OIDC providers

 Future, separately gated:
 OAuth 2.0 Authorization Server / OIDC Provider
 discovery + authorize + token + userinfo + JWKS
 client registry + consent + refresh/revocation
```

The Cloudflare Worker is an edge/transport layer only. It must forward a strict allowlist to the Fastify service and must not become a second identity database or an alternate source of user truth.

## 3. Protocol boundaries — do not conflate these roles

| Role | Meaning | Current status |
|---|---|---|
| Local account authentication | Email/password, verification, recovery | Implemented in this gateway; runtime still needs environment-specific verification |
| Upstream OAuth/OIDC login | User signs into OCodeJS/Velclaw using Google/GitHub or another provider | Auth.js apps have provider code; gateway federation is not yet implemented |
| OAuth 2.0 Authorization Server | Issues authorization codes/access tokens to client applications | Planned; not implemented by current gateway routes |
| OpenID Connect Provider (OP) | Issues ID Tokens and publishes discovery/JWKS | Planned; do not claim OIDC Provider conformance yet |
| Resource-server authorization | Validates a session/token and enforces permissions for each resource | Must be integrated per product API; a frontend login state is never sufficient |
| Machine-to-machine credentials | API clients, scoped keys or short-lived tokens | Planned; not part of current browser-session API |

OAuth login as a relying party/client is not the same thing as operating an OAuth Authorization Server or OIDC Provider. SAML, WebAuthn/passkeys and email delivery are separate protocol/capability families, not interchangeable OAuth providers.

## 4. Current canonical gateway contract

Base path: `/api/v1`.

| Method | Route | Purpose | Status |
|---|---|---|---|
| GET | `/health` | Liveness/readiness | Implemented; does not prove end-to-end login |
| GET | `/api/v1/auth/csrf` | Issue CSRF cookie/token | Implemented |
| POST | `/api/v1/auth/register` | Create unverified account and send verification | Implemented |
| POST | `/api/v1/auth/verify-email` | Consume one-time verification token | Implemented |
| POST | `/api/v1/auth/resend-verification` | Resend verification without account enumeration | Implemented |
| POST | `/api/v1/auth/login` | Verified email/password login | Implemented |
| POST | `/api/v1/auth/request-password-reset` | Request password reset | Implemented |
| POST | `/api/v1/auth/reset-password` | Consume reset token, update password and revoke sessions | Implemented |
| GET | `/api/v1/me` | Current authenticated identity | Implemented |
| POST | `/api/v1/auth/logout` | Revoke current session | Implemented |

The OpenAPI contract in [openapi-identity-v1.yaml](./openapi-identity-v1.yaml) is the API reference for routes actually implemented in this repository. Keep it synchronized with code and tests. Do not add planned endpoints to the published contract until implementation and tests exist.

### Browser request contract

1. Request `GET /api/v1/auth/csrf`.
2. Preserve cookies and send the returned token in `X-CSRF-Token` on state-changing requests.
3. Use `credentials: "include"` for cross-origin browser requests.
4. Allow only exact HTTPS origins in `WEB_ORIGINS`; never use wildcard CORS with credentials.
5. Keep session cookies HttpOnly, Secure in HTTPS production, and SameSite according to the verified domain topology.
6. The browser never reads, stores or forwards session secrets itself.

### Machine clients

Do not reuse browser cookies for server-to-server integrations. A future client credential must have an owner, explicit scopes, expiry, rotation, revocation and last-used metadata. Show a secret once and store only a strong hash unless a documented protocol requires encrypted retrieval. Never put credentials in URLs, browser bundles or logs.

## 5. Identity, sessions and authorization

### Identity

- The gateway's immutable internal user ID is the ownership key.
- Provider identity is keyed by the provider's stable subject/account identifier, not by email alone.
- Email matching alone must never silently merge accounts.
- Account linking requires proof of control of both identities, unique provider-subject ownership and an audit event.

### Sessions

The gateway's stronger session pattern is an opaque random browser token with only its SHA-256 hash stored in PostgreSQL. Keep server-side expiry and revocation. Do not replace it with a stateless user-ID cookie or assume Auth.js JWT sessions are interchangeable.

### Authorization

- Start with explicit RBAC roles (for example owner/admin/member) and resource-level checks.
- Keep role assignment server-side and auditable.
- Every product API that exposes projects, credentials, deployments, domains, billing or private account data must independently validate the gateway session and authorize the requested resource.
- React state, hidden buttons and client-side route guards are UX only, not authorization.
- ABAC and organization/tenant policy are later layers; do not silently broaden privileges during migration.

## 6. Security baseline

Keep these properties central and testable:

- Argon2id password hashing (asynchronous); never store plaintext passwords.
- Random, single-use, expiring verification/reset tokens; persist token digests, not raw values.
- Opaque session tokens; persist hashes; support logout and global session revocation after password reset.
- CSRF protection with signed double-submit and exact Origin allowlisting.
- Rate limits on registration, login, verification resend and password reset; shared/distributed storage is required for multi-instance production.
- Generic responses for account-existence-sensitive flows.
- Strict redirect URI allowlists, state/nonce and PKCE S256 for OAuth/OIDC.
- Validate issuer, audience, signature, expiry, nonce and signing algorithm for ID Tokens.
- Keep provider secrets, database URLs, session/CSRF secrets and SMTP credentials in the host secret manager only.
- Redact cookies, Authorization headers, passwords, tokens, API keys and personal data from logs.
- Audit security-sensitive account, session, role and credential events.
- Add abuse controls, privacy/retention rules, security headers and dependency review before public production release.

## 7. Integration policy for existing applications

| Application/source | Intended integration | Migration rule |
|---|---|---|
| VelclawHost Control Center | Gateway browser session + server-side role checks | Replace local GitHub-only session only after Preview E2E and admin-policy mapping |
| Velclaw app / app-velclaw | Gateway identity for account UI and protected APIs | Keep hosting/domain/deployment APIs in Velclaw; add server-side authorization adapter |
| VelCli | Gateway login for account identity; local CLI credential flow later | Prefer device authorization or scoped short-lived CLI credentials; never copy browser cookies |
| OCodeJS Profile / `mcp.auth.ocodejs` | Migrate profile/account UI to gateway identity | Preserve Profile/social graph and Token Vault as separate bounded modules; map owner by immutable gateway subject |
| `zskbot/mcp.server.auth` | Parallel Auth.js implementation/reference | Do not run a second canonical user store; extract only reviewed UI/provider patterns |
| Ask OCodeJS / v0-chat | Gateway client integration where login is required | No app may trust client-side auth state for private APIs |
| OCodeJS docs / docs.velclaw.ai | Documentation and examples | Link to this canonical contract; keep product-specific docs local |
| MCP services | Service-to-service auth in a later phase | Use scoped machine credentials, not browser cookies or user OAuth secrets |

No consumer is considered integrated until its exact origin, callback/redirect rules, cookie behavior, API authorization and end-to-end flow have been tested on a Preview hostname.

## 8. Data ownership and migration

- The gateway owns canonical user identities, credential hashes, browser sessions and account lifecycle.
- Product databases may own product-specific profiles, projects, subscriptions, deployments and audit domains, but reference the canonical identity using a stable external user ID.
- BYOK/model-provider credentials remain in the separate Token Vault boundary; they are not identity credentials.
- Do not connect this service to another product's database or merge databases by changing environment variables.
- Before any migration: inventory source/target schema, prove backup and restore on an isolated target, map identities, detect collisions, export/import with counts, verify ownership, then test rollback.
- Use additive migrations only. No Production schema writes or data cutover are authorized by this architecture document.

## 9. Release gates

A successful build or `/health` response is not proof that authentication works end-to-end.

Before a Preview integration is accepted, verify:
1. Dedicated Preview PostgreSQL target and backup/restore.
2. Email registration, verification, login, resend, password reset and logout.
3. CSRF rejection, Origin rejection, rate limits and account enumeration resistance.
4. Session expiry, revocation, password-reset invalidation and multi-instance behavior.
5. OAuth callback state/PKCE/issuer/audience/signature checks when federation is implemented.
6. Resource-level authorization across two users and at least two roles.
7. Cookie/CORS behavior on the actual Preview hostnames and iPhone Safari.
8. Logs contain no secrets; audit events are attributable and privacy-bounded.
9. CI tests, dependency audit, migration validation and rollback evidence.

Production promotion, DNS/callback changes, database cutover, paid services and destructive migration require separate explicit approval.

## 10. Source of truth and change control

- This repository owns the shared Authentication API contract and security baseline.
- Product repos own their product-specific integration adapters and UI.
- Standards/specification repos are references, not runtime dependencies.
- Preserve all source repositories and their histories during the migration.
- Keep the source inventory in [SOURCE-REPOSITORY-MAP.md](./SOURCE-REPOSITORY-MAP.md) and staged cutover in [INTEGRATION-MIGRATION-PLAN.md](./INTEGRATION-MIGRATION-PLAN.md).
