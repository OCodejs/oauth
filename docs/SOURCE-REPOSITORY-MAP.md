# Authentication source repository map

**Review date:** 2026-11-23  
**Method:** GitHub repository metadata, root/directory listings, selected README and authentication-document reads, and targeted code/document searches.  
**Limit:** this is a targeted authentication inventory, not a claim that every file in every large repository was read or that runtime behavior was tested.

## A. Canonical destination

| Repository | Decision | Evidence |
|---|---|---|
| [zskbot/Authentication](https://github.com/zskbot/Authentication) | **Selected central Auth Gateway documentation and implementation candidate** | README describes the shared OCodeJS/Velclaw identity gateway; Fastify 5, PostgreSQL, Argon2id, opaque hashed sessions, email verification/reset, CSRF and Cloudflare edge worker. |
| [OCodejs/Authentication](https://github.com/OCodejs/Authentication) | Parallel repository; compare and reconcile separately | Same package identity and similar Phase 1–2 README, but separate history and package differences. Do not assume trees, migrations, CI or deployments are identical. No automatic mirror or merge is assumed. |

This selection is a repository/documentation decision for the proposed consolidation. It does not prove a live production deployment or authorize a repository rename, mirror, merge or cutover.

## B. Authentication implementations to reconcile

| Repository | Observed material | Disposition |
|---|---|---|
| [OCodejs/mcp.auth.ocodejs](https://github.com/OCodejs/mcp.auth.ocodejs) | Auth.js v5, Google/GitHub OAuth, Credentials, Prisma/PostgreSQL, user profiles/social graph, BYOK Token Vault, Preview DB isolation; roadmap for OIDC Provider | Keep as a parallel product/account implementation during migration. Reuse reviewed profile/UI concepts; do not copy its database/session implementation into the gateway. Auth.js upstream login is not an OIDC Provider. |
| [zskbot/mcp.server.auth](https://github.com/zskbot/mcp.server.auth) | Another Auth.js v5 + Prisma/PostgreSQL login foundation | Reference only until repository ownership, deployment and consumer dependencies are verified. Avoid a second canonical user store. |
| [Velclaw/app-velclaw](https://github.com/Velclaw/app-velclaw) | `AUTH_SETUP.md`, `docs/auth-gateway-integration.md`, Auth.js port from Cloudxx, legacy JWT boundary | Important client integration source. Its gateway guide references `zskbot/Authentication` and documents CSRF, cookie, CORS and email routes. It also states the current Cloudflare Preview Worker is static-only and session validation is false. |
| [Velclaw/VelclawHost-Control-Center](https://github.com/Velclaw/VelclawHost-Control-Center) | GitHub OAuth callback, AES-GCM encrypted stateless session, admin/member claims, Netlify setup docs | Integrate identity and role claims through the central gateway; preserve Control Center-specific Netlify and hosting permissions. |
| [zskbot/VelclawHost-Control-Center](https://github.com/zskbot/VelclawHost-Control-Center) | Same top-level app/docs structure as the Velclaw-owned repository | Treat as a parallel copy until commit/tree/history comparison proves relationship. Do not assume exact equivalence. |
| [zskbot/ocodejs-api](https://github.com/zskbot/ocodejs-api) | `velclaw-identity/`: Hono/Val Town bridge, Neon Auth JWT/JWKS verification, OAuth callback, server-side SQLite sessions, OpenAPI and health endpoints | Separate legacy/bridge identity design. Keep as a migration/reference adapter until issuer, hostname, JWT claims and data ownership are verified. Do not make it a second user authority. |
| [OCodejs/ocodejs-monorepo](https://github.com/OCodejs/ocodejs-monorepo) | Proposed `services/auth` boundary and architecture governance | Use as a future consumer/workspace map only. Its architecture is explicitly proposed, not evidence that services have been migrated. |

## OCodeJS product consumer

- [OCodejs/OCODEJS](https://github.com/OCodejs/OCODEJS) — core OCodeJS product repository and a potential first-party client; this pass did not verify a distinct central-auth contract inside that repository. Integrate through the gateway API rather than copying an independent user/session store.

## C. Documentation sources to incorporate selectively

| Repository | Relevant material observed | Disposition |
|---|---|---|
| [OCodejs/docs](https://github.com/OCodejs/docs) | Integration matrix, source audit, canonical alignment, OAuth and domain verification gates | Incorporate relevant security/identity constraints; do not import the entire general documentation corpus. |
| [OCodejs/docs-ocodejs](https://github.com/OCodejs/docs-ocodejs) | OCodeJS documentation family, Cloudflare/docs/specs and design system | Reference only; import only verified identity contracts. |
| [zskbot/docs-ocodejs](https://github.com/zskbot/docs-ocodejs) | Parallel docs tree, API/agent docs, infrastructure and skills | Compare before deduplication; do not bulk-copy bundled skills or unrelated docs. |
| [Velclaw/OCodejs-docs](https://github.com/Velclaw/OCodejs-docs) | Another OCodeJS docs family | Quarantine until tree/history comparison identifies unique auth material. |
| [OCodejs/docs.rtf](https://github.com/OCodejs/docs.rtf) | Course/learning-platform sitemap and UI specification; targeted auth search returned no auth-specific document | Exclude from central Auth documentation unless a specific account/login requirement is later identified. |
| [Velclaw/docs.velclaw.ai](https://github.com/Velclaw/docs.velclaw.ai) | REST API Authentication reference (PAT, Basic, OAuth Apps), localized API docs and domain guidance | Reference for API-token and API-client concepts only; not the central user identity contract. |
| [zskbot/sandboxcode-docs](https://github.com/zskbot/sandboxcode-docs) | Large general developer documentation site | Targeted authentication search did not identify relevant product-specific auth docs. Do not import wholesale. |
| [zskbot/zskbot-sandboxcode-docs](https://github.com/zskbot/zskbot-sandboxcode-docs) | Same-name search result, separate repository | Not yet content-audited; retain as unverified reference. |
| [Velclaw/sandbox-x-api](https://github.com/Velclaw/sandbox-x-api) | Large SDK/docs corpus; contains an OpenID Connect Core 1.0 specification copy and provider docs | Standards/reference source only. Do not copy spec text into product docs or infer implementation from its presence. Prefer linking to the official OpenID Foundation specification. |
| [zskbot/ocodejs-web4s-bridge](https://github.com/zskbot/ocodejs-web4s-bridge) | Read-only GET transport foundation; partner API/auth not yet verified | Separate integration boundary; not an identity provider. |
| [zskbot/skills-agentc](https://github.com/zskbot/skills-agentc) and [OCodejs/skills-agentc](https://github.com/OCodejs/skills-agentc) | Agent skill library/site | No central authentication contract identified in the inspected roots; do not bulk-import. |

## D. Repositories not identified as Authentication sources in this pass

These were included in the request but targeted authentication searches did not identify relevant auth-specific material:

- [Velclaw/sandbox-x-api](https://github.com/Velclaw/sandbox-x-api) — retained above as standards/provider reference only.
- [zskbot/v0-chat](https://github.com/zskbot/v0-chat) — no relevant auth document found in targeted search.
- [zskbot/zskbot-Grid](https://github.com/zskbot/zskbot-Grid) — no relevant auth document found in targeted search.
- [zskbot/pages_logo](https://github.com/zskbot/pages_logo) — brand asset repository, not identity implementation.
- [Velclaw/VelCli](https://github.com/Velclaw/VelCli) — no auth-specific documentation found by the targeted query; CLI integration remains a future client contract.
- [Velclaw/Velclaw-velclaw-docs-ui-reference](https://github.com/Velclaw/Velclaw-velclaw-docs-ui-reference) — documentation UI design reference, not an auth source.
- [OCodejs/ocodejs.github.io](https://github.com/OCodejs/ocodejs.github.io) — server/dashboard docs site; no central auth implementation established in this pass.
- [Velclaw/app.velclaw](https://github.com/Velclaw/app.velclaw) — separate application repository; not yet inspected for a distinct auth contract in this pass.
- [Velclaw/docs.velclaw.ai](https://github.com/Velclaw/docs.velclaw.ai) — retained above for REST API auth reference.
- [zskbot/VelCli-Build](https://github.com/zskbot/VelCli-Build) — not listed as an auth source; verify repository identity before any inclusion.

## Additional listed consumer repositories

- [zskbot/ask-ocodejs](https://github.com/zskbot/ask-ocodejs) — listed as a potential OCodeJS consumer; no auth-specific source contract was verified in this targeted pass. Treat as a future client, not an identity authority.
- [zskbot/v0-chat](https://github.com/zskbot/v0-chat) — listed as a potential consumer; no auth-specific material was verified in the targeted search. Keep out of the central gateway until its login and API boundaries are inspected.

## E. Conflicts that must remain visible

1. **Different session formats:** central gateway opaque token + PostgreSQL hash; Auth.js JWT/database sessions; Control Center encrypted stateless cookie; Val Town bridge opaque SQLite session; older uploaded Next.js archive stateless signed cookie. These are not interchangeable.
2. **Different identity databases:** PostgreSQL gateway, Prisma/PostgreSQL Auth.js apps, SQLite bridge and separate product databases. Do not repoint them to one database without an explicit migration.
3. **Different OAuth roles:** some apps are OAuth clients; the future gateway OIDC Provider is not implemented.
4. **Different provider configuration:** callback hosts, allowed origins, cookie domains and SameSite behavior depend on the real deployment topology.
5. **Role/authorization drift:** admin/member/owner allowlists are product-specific and must be mapped explicitly; no privilege expansion is implied.
6. **Duplicate repositories:** same or similar repository names across owners do not prove identical code, history or release ownership.

## F. Source handling rules

- Preserve every source repository and its history.
- Do not bulk-copy unrelated docs, vendored specifications, agent skills, generated output, secrets or binary archives.
- Record source URL, path, branch/commit SHA and review date for any future imported contract.
- Mark claims as **documented**, **source-observed**, **Preview-verified** or **production-verified**.
- Do not state that a login flow is live solely because a README, button or health endpoint exists.
