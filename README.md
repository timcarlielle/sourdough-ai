# Sourdough AI

Self-hosted sourdough tracking with sensor telemetry, peak prediction, and voice logging.

Track starter feedings, bakes, and recipes; hook up cheap distance/temperature sensors to
watch your starter rise in real time; get a trained per-starter prediction of when it will
peak; and (optionally) log everything by voice — "just fed the starter, 60 grams of each" —
via the web app or Siri.

- **Web app** — dashboard, feedings, bakes, recipes, planning, analytics. Responsive, works on phones.
- **Sensor ingest API** — token-authenticated HTTP endpoint for DIY starter/dough monitors
  (any board that can POST JSON). See [docs/ingest-api.md](docs/ingest-api.md).
- **Prediction engine** — learns your starter's time-to-peak vs. temperature from real cycles.
- **Voice + AI (optional)** — transcription, structured parsing, bake insights, and recipe
  import, powered by an OpenAI API key. Everything else works without one.
- **API tokens** — personal access tokens for scripts and the (upcoming) iOS app.

## Quick start (Docker)

```bash
git clone <this-repo> sourdough-ai && cd sourdough-ai
cp .env.example .env
# edit .env: set NEXTAUTH_SECRET (openssl rand -base64 32)
docker compose up -d --build
```

Open http://localhost:3000 and sign up. The sensor ingest API listens on port 3001.
Migrations and a starter recipe seed run automatically.

Optional: set `OPENAI_API_KEY` in `.env` to enable voice logging, dashboard insights, and
recipe import. Without it those features are hidden and the rest of the app works normally.

For HTTPS, remote access, and backups, see [docs/self-hosting.md](docs/self-hosting.md).
To run the data/ingest services on an always-on box (e.g. a Raspberry Pi) separate from the
web app, see [docs/Split-Stack.md](docs/Split-Stack.md).

## Stack

| Piece | Tech |
|-------|------|
| `apps/web-app` | Next.js 14 (App Router), NextAuth, Tailwind, Chart.js |
| `apps/ingest-api` | Fastify — device-token telemetry + voice ingestion |
| `apps/worker` | BullMQ jobs — voice pipeline, bake analysis, insights |
| `packages/db` | Prisma + PostgreSQL |
| Queue/cache | Redis |

## Development

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis   # or the whole dev stack
npm install
cp .env.example .env    # DATABASE_URL default matches the dev compose (port 5433)
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev:web         # http://localhost:3000
npm run dev:ingest      # http://localhost:3001
npm run dev:worker      # needs OPENAI_API_KEY for voice jobs
```

Tests and builds:

```bash
npm test                # vitest across all workspaces
npm run build           # typecheck + production builds
```

Before a release, walk [docs/smoke-test.md](docs/smoke-test.md).

## API access (scripts & mobile)

Create a personal access token in **Account → API access tokens** (or via
`POST /api/auth/mobile` with your email/password), then call any API route with
`Authorization: Bearer <token>`:

```bash
curl -H "Authorization: Bearer $TOKEN" https://your-server/api/dashboard
```

`GET /api/meta` (unauthenticated) reports the server version and enabled features.

## Docs

- [Self-hosting guide](docs/self-hosting.md) — HTTPS, reverse proxy, backups, upgrades
- [Split stack](docs/Split-Stack.md) — hub (Pi) + app host deployment
- [Ingest API / firmware reference](docs/ingest-api.md) — build your own sensor
- [Smoke-test checklist](docs/smoke-test.md)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE)
