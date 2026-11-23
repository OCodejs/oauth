# Authentication ecosystem — staged integration and migration plan

**Status:** proposal; documentation-only consolidation  
**Target:** `zskbot/Authentication`  
**Default environment:** isolated Preview  
**Non-goals:** no Production cutover, DNS/callback changes, database merge, secrets migration, repository deletion/rename, or automatic PR merge.

## Phase 0 — Freeze and establish evidence

1. Preserve every source repository and its default branch.
2. Record the exact commit SHA, deployment owner and environment for each candidate implementation.
3. Inventory all identity tables, session formats, OAuth providers, callback URLs, cookies, origins and authorization checks.
4. Identify real consumers and API calls from source code; a README mention alone is not proof of use.
5. Confirm the canonical gateway's current CI, health endpoint and Preview deployment separately.

**Exit:** reviewed source inventory and no unresolved ownership ambiguity for the selected Preview consumer.

## Phase 1 — Make the gateway contract authoritative

1. Treat the current Fastify API and `docs/openapi-identity-v1.yaml` as the only published central identity contract.
2. Keep existing endpoint request/response formats backward-compatible.
3. Add contract tests for CSRF, Origin, cookies, registration, verification, login, current user, reset and logout.
4. Publish an integration guide with exact cookie/CORS requirements.
5. Do not document Google/GitHub federation or OIDC issuer endpoints as available until implemented and tested.

**Exit:** OpenAPI matches implemented routes; CI validates code and contract; no undocumented endpoint is advertised.

## Phase 2 — Integrate one low-risk Preview client

Suggested first client: VelclawHost Control Center or one dedicated OCodeJS app Preview, selected after confirming its deployment hostname and owner.

1. Add a server-side gateway client adapter; keep the UI as a relying application.
2. Configure only the public API base URL in the frontend. Keep all secrets server-side.
3. Add the exact Preview origin to the gateway allowlist.
4. Test CSRF bootstrap, registration, email verification, login, `/api/v1/me`, logout and session persistence in the real browser.
5. Test access control with two users and admin/member roles.
6. Keep old login available until parity and rollback are proven.

**Exit:** Preview E2E passes on the actual hostnames, including cookie behavior in iPhone Safari; old and new paths can be rolled back without data loss.

## Phase 3 — Reconcile Auth.js applications

Candidates:
- `OCodejs/mcp.auth.ocodejs`
- `zskbot/mcp.server.auth`
- `Velclaw/app-velclaw`

Do not merge these codebases into the Fastify service. Implement a gateway adapter and migrate the UI/account responsibilities selectively.

Required work:
- Map Auth.js user IDs and provider account IDs to immutable gateway user IDs.
- Define explicit account-linking proof; never merge by matching email alone.
- Decide whether an app uses a same-site shared HttpOnly gateway cookie or a backend session exchange. Never expose a gateway session token to JavaScript.
- Preserve product-owned profile, social graph and BYOK data as separate modules with stable owner references.
- Remove duplicate local authentication only after consumer-by-consumer Preview verification and a rollback window.

**Exit:** each consumer has one canonical user identity; no silent account merges; no second active user/session authority.

## Phase 4 — Reconcile Velclaw bridge and legacy JWT

Candidate: `zskbot/ocodejs-api/velclaw-identity`.

1. Verify the actual OAuth issuer, JWKS URL, issuer/audience claims, hostname and callback routing.
2. Establish whether this bridge is still used by any deployed client.
3. If retained, make it a protocol adapter that validates upstream tokens and maps the stable subject to the central identity ID.
4. Avoid storing a second independent password or user directory.
5. Keep SQLite session data isolated until an export/reconciliation/rollback plan is approved.

**Exit:** token issuer and trust chain verified; clients migrated; no identity collision or unverified JWT trust.

## Phase 5 — Provider federation

Implement Google/GitHub and other providers one at a time inside the central gateway.

Required controls:
- Exact callback URI and origin allowlists.
- OAuth authorization code flow with PKCE where supported.
- State/nonce validation, issuer/audience/signature/expiry validation for OIDC.
- Verified-email semantics and stable provider subject.
- Secure account linking, token retention policy, revocation and provider outage handling.
- Provider-specific tests and secrets stored only in Preview secret managers.

**Exit:** each provider has real Preview callback tests and a documented security review. A configured client ID alone is not proof of a working login.

## Phase 6 — OAuth 2.0 Authorization Server / OIDC Provider

This is a separate product capability, not a small extension to upstream login.

Implement only after an explicit protocol design and independent review:
- Authorization Code + PKCE S256; reject implicit and resource-owner-password grants.
- Exact redirect URI matching, client registry and consent.
- One-time short-lived authorization codes.
- Token endpoint with client authentication appropriate to client type.
- ID Token signing, key IDs, JWKS and planned key rotation.
- Discovery metadata, userinfo, revocation, logout semantics and refresh-token rotation/reuse detection.
- Scope/audience policy, audit trail and interoperability tests.

**Exit:** protocol conformance and interoperability suites pass; do not claim OIDC conformance before then.

## Phase 7 — Authorization, organizations and operations

1. Standardize role vocabulary without silently changing existing product permissions.
2. Enforce authorization at each API/resource boundary.
3. Add organization/tenant membership only with a clear data model and migration.
4. Add MFA/passkeys, device/session management and account deletion policy.
5. Add abuse detection, audit retention, privacy controls and operational alerts.
6. Add machine clients/API keys only with scopes, expiry, rotation and revocation.

## Data migration safety checklist

- [ ] Identify source and target database owners and exact environments.
- [ ] Take a backup and prove restore into an isolated database.
- [ ] Export identity records without plaintext passwords or live session secrets.
- [ ] Map users using verified stable identifiers; flag duplicate/unverified emails for manual resolution.
- [ ] Never copy old session cookies or raw verification/reset tokens.
- [ ] Hash/rehash credentials only through a reviewed compatible password migration.
- [ ] Map provider identities by provider + stable subject, not email alone.
- [ ] Preserve product records and map owner IDs through a reviewed table.
- [ ] Compare row counts, foreign keys, representative ownership and access tests.
- [ ] Keep old authentication available during the rollback window.
- [ ] Record cutover and rollback evidence before any production approval.

## Approval boundaries

This plan authorizes documentation and design only. It does not authorize:
- Production deployments or promotion.
- DNS, domain, OAuth callback or CORS changes on live domains.
- Secrets, OAuth applications or provider permissions changes.
- Database writes, schema migration, data export/import or connection-string changes.
- Paid resources, repository renames/deletions, merges or archival.
- Automatic merge of the documentation PR.

Each such action requires separate explicit approval after Preview evidence is available.
