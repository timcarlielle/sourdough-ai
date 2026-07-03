# Contributing

Thanks for your interest! This is a hobby-scale project — issues and PRs welcome.

## Dev setup

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis
npm install
cp .env.example .env          # defaults match the dev compose (Postgres on 5433)
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev:web               # + dev:ingest / dev:worker as needed
```

## Before you open a PR

- `npm test` — vitest across all workspaces
- `npm run build` — typechecks ingest-api/worker and production-builds the web app
- For user-facing changes, check the relevant items in [docs/smoke-test.md](docs/smoke-test.md)
- Match the existing code style; no new dependencies without a good reason

## Repo layout

- `apps/web-app` — Next.js UI + API routes (auth via `getSessionUserId()` — session cookie or Bearer API token)
- `apps/ingest-api` — Fastify sensor/voice ingestion (device tokens)
- `apps/worker` — BullMQ job processors (AI jobs register only when `OPENAI_API_KEY` is set)
- `packages/db` — Prisma schema, migrations, seed, and the starter prediction/analysis engine

## Database changes

Edit `packages/db/prisma/schema.prisma` and add a migration under
`packages/db/prisma/migrations/<timestamp>_<name>/migration.sql` (match the existing
style). Migrations must be idempotent-safe for existing installs — self-hosters run
`prisma migrate deploy` automatically on upgrade.

## Reporting security issues

Please report vulnerabilities privately via GitHub security advisories rather than
public issues.
