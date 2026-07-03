# Split stack: hub + app host

Run **Postgres, Redis, and the ingest API** on an always-on "hub" host (e.g. a Raspberry Pi)
and **web-app + worker** on a second machine. Sensors send telemetry to the hub 24/7; the app
host can come and go.

Throughout this guide, replace:

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `<HUB_IP>`  | LAN IP of the hub host (Pi) | `192.168.1.50` |
| `<APP_IP>`  | LAN IP of the app host      | `192.168.1.51` |

> If you just want everything on one machine, skip this and use the main
> `docker compose up` path in the README.

---

## 1. On the hub host

Clone the repo (the ingest image builds from source), then create `.env`:

```env
POSTGRES_USER=sourdough
POSTGRES_PASSWORD=<choose-a-real-password>   # Postgres is exposed on your LAN!
POSTGRES_DB=sourdough
```

Start the hub stack:

```bash
docker compose -f docker-compose.pi.yml up -d --build
```

Check:

- Postgres: `docker compose -f docker-compose.pi.yml exec postgres pg_isready -U sourdough`
- Ingest: `curl -s http://localhost:3001/health` → `{"ok":true}`

From the app host, confirm you can reach the hub:

```bash
nc -zv <HUB_IP> 5432
nc -zv <HUB_IP> 6379
nc -zv <HUB_IP> 3001
```

---

## 2. On the app host

Create `.env` pointing at the hub:

```env
DATABASE_URL=postgresql://sourdough:<password>@<HUB_IP>:5432/sourdough
REDIS_URL=redis://<HUB_IP>:6379

NEXTAUTH_URL=http://<APP_IP>:3000        # or http://localhost:3000 if only local
NEXTAUTH_SECRET=<openssl rand -base64 32>
APP_TIMEZONE=UTC                          # your IANA timezone
NEXT_PUBLIC_APP_TIMEZONE=UTC

# Optional — enables voice logging, insights, recipe scraping
# OPENAI_API_KEY=sk-...
```

Start the app stack (the `migrate` service applies migrations to the hub DB
automatically on every `up`; it's idempotent):

```bash
docker compose -f docker-compose.mac.yml up -d --build
```

- Web: `http://localhost:3000` (or `http://<APP_IP>:3000` from other devices)
- Worker runs in the background (voice jobs, bake analysis, etc.)

Stop with `docker compose -f docker-compose.mac.yml down`.

---

## 3. Device / sensor / app config

Point long-running senders at the **hub** so they keep working when the app host is off:

- **Starter / dough monitors:** `POST http://<HUB_IP>:3001/ingest/starter` (or `/ingest/dough`)
  with `Authorization: Bearer <device_token>`.
- **Siri / voice shortcuts:** `POST http://<HUB_IP>:3001/ingest/voice` (device or voice token).
- **Mobile app / browser:** the web app at `http://<APP_IP>:3000`.

---

## 4. Checklist (common issues)

- **App host `.env` must use the hub IP** for `DATABASE_URL` and `REDIS_URL`. If you see
  "Can't reach database server at postgres:5432", the URL still points at a local container.
- **Hub firewall:** open 5432, 6379, 3001 to your LAN only, e.g.
  `sudo ufw allow from 192.168.1.0/24 to any port 5432` (repeat for 6379 and 3001).
  Never expose these ports to the internet.
- **Postgres password:** the hub exposes Postgres on the LAN — don't keep the default password.
- **`NEXTAUTH_URL`** must match how you open the app in the browser, or auth redirects break.
- **Worker queue flow:** voice logs enqueue jobs into Redis on the hub; the app host's worker
  consumes them. Both must share the same `REDIS_URL`.
- **Voice audio across hosts:** web-app and worker share an uploads volume when they run in the
  same compose stack (default). If you split them further apart, set the same
  `INTERNAL_API_SECRET` in both so the worker can fetch audio over HTTP.

---

## 5. Troubleshooting

- **App host can't reach hub:** hub firewall (5432/6379/3001) or wrong IP.
- **401 on ingest:** wrong/revoked device token; copy it from the Devices page.
- **Web can't reach DB / worker can't reach Redis:** re-check `<HUB_IP>` in `.env`, then
  `docker compose -f docker-compose.mac.yml up -d` to recreate with the new values.
