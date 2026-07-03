# Self-hosting guide

## Requirements

- Docker + Docker Compose
- ~1 GB RAM for the full stack (runs fine on a Raspberry Pi 4/5)
- Optional: an OpenAI API key for voice/AI features

## Install

```bash
git clone <this-repo> sourdough-ai && cd sourdough-ai
cp .env.example .env
# REQUIRED: set NEXTAUTH_SECRET (openssl rand -base64 32)
# Recommended: set APP_TIMEZONE / NEXT_PUBLIC_APP_TIMEZONE to your IANA timezone
docker compose up -d --build
```

- Web UI: `http://<host>:3000`
- Sensor ingest API: `http://<host>:3001`
- Data lives in named Docker volumes: `postgres_data`, `redis_data`, `uploads_data`.

The `migrate` service applies database migrations on every `up`; it's safe to re-run.

## HTTPS & remote access

The stack serves plain HTTP. For anything beyond your own LAN, put it behind TLS —
the future iOS app also expects HTTPS by default. Two easy paths:

**Caddy reverse proxy** (automatic Let's Encrypt):

```
sourdough.example.com {
    reverse_proxy localhost:3000
}
ingest.sourdough.example.com {
    reverse_proxy localhost:3001
}
```

Set `NEXTAUTH_URL=https://sourdough.example.com` in `.env` and `docker compose up -d`
again. (You can also route ingest as a path on the same host if you prefer.)

**Tailscale** (private, no ports exposed): install Tailscale on the server and your
devices, then use the tailnet hostname. `tailscale serve` can provide HTTPS with valid
certificates on your tailnet.

Never expose Postgres (5432) or Redis (6379) to the internet.

## Sensors & Siri

Devices authenticate with per-device tokens created in the web UI (Devices → Add device).
Point their firmware at the ingest API. Full request/response reference:
[ingest-api.md](ingest-api.md).

## Backups

Everything that matters is in Postgres plus the uploads volume:

```bash
# database
docker compose exec postgres pg_dump -U sourdough sourdough | gzip > backup-$(date +%F).sql.gz

# voice uploads
docker run --rm -v sourdough-ai_uploads_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

Restore with `psql` and untar into the volume respectively.

## Upgrades

```bash
git pull
docker compose up -d --build     # rebuilds images; migrate applies new migrations
```

Check the release notes for breaking changes before major upgrades.

## AI features

Set `OPENAI_API_KEY` in `.env` and `docker compose up -d`. This enables:

- Voice logging (record in the web app; transcription + structured parsing)
- Siri/voice queries via the ingest API
- Dashboard "coach" insights
- Recipe import from a URL

`GET /api/meta` shows `features.ai` so clients (including the mobile app) adapt
automatically. Costs are per-use against your OpenAI account; the default models are
`gpt-4o-mini-transcribe` and `gpt-4o-mini`.

## API tokens

Personal access tokens (Account → API access tokens, or `POST /api/auth/mobile`) grant
full API access for scripts and the mobile app. They're stored hashed, shown once, and
revocable; revoke any token you no longer use.
