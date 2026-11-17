# Imported source archive

This folder is reserved for the extracted Next.js / React / Prisma source from the uploaded TAR archive.

The source archive is intentionally kept separate from the Fastify/PostgreSQL authentication gateway at the repository root. Do not copy these files over the gateway.

## Import procedure

Upload the sanitized archive as:

`source-import/Authentication-uploaded-source-sanitized.tar.gz`

to branch `review/uploaded-nextjs-source`. The workflow `.github/workflows/import-uploaded-source.yml` will extract it into this folder and commit the files.

The sanitized archive excludes:
- `.env` and other environment files
- local SQLite/database files
- PID/runtime files
- the archive's nested `.git` history
- `node_modules`

## Security notes

This source is for review and integration, not production deployment as-is. In particular, review the session-secret fallback in `src/lib/session.ts`, the publicly callable demo seed endpoint in `src/app/api/seed/route.ts`, token persistence, and the stateless session design before enabling the app. The Next.js app uses SQLite/Prisma and must not replace the canonical Fastify/PostgreSQL gateway without a migration and API integration plan.
