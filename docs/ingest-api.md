# Ingest API & firmware reference

How devices (sensor rigs, Siri shortcuts) send data to the ingest service.


The ingest API accepts sensor readings from **starter monitor** and **dough monitor** devices. Use this section to implement firmware that POSTs telemetry to the server.

### Base URL and auth

- **Base URL:** Your deploy URL (e.g. `https://your-app.onrender.com`) or local `http://localhost:3001`. The ingest service runs on the port set by `INGEST_API_PORT` (default **3001**).
- **Authentication:** Bearer token. The token is the **device token** (64-character hex string) shown once when the device is created in the web app. The server looks up the device by SHA-256 hash of the token (no bcrypt in ingest-api). Store the token securely on the device (e.g. in non-volatile storage or secure element).
- **Header:** `Authorization: Bearer <device_token>`
- **Content-Type:** `application/json`

The device type (starter vs dough) is fixed when the device is created in the web app. A **starter monitor** must POST only to `/ingest/starter`; a **dough monitor** only to `/ingest/dough`. Using the wrong endpoint for a device type may work at the API level but will mislabel data in the app.

### Getting a device token

1. Log in to the web app.
2. Go to **Devices** → **Add device** (or **New device**).
3. Enter a **name** (e.g. "Starter Jar A", "Kitchen dough probe") and choose **Starter monitor** or **Dough monitor**.
4. Submit. The response includes a **token** (long hex string). Copy and store it on the device; the app will not show it again. If lost, create a new device or use the web app to regenerate the token for that device (if your app supports it).

---

### Starter monitor — `POST /ingest/starter`

Use for a sensor rig that measures **starter** (e.g. in a jar): rise (distance), and optionally ambient conditions.

**Request**

- **Method:** `POST`
- **Path:** `/ingest/starter`
- **Headers:** `Authorization: Bearer <device_token>`, `Content-Type: application/json`
- **Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recorded_at` | string (ISO 8601) | No | When the reading was taken. If omitted, server uses request time. Prefer sending sensor time for accuracy. |
| `distance_mm` | number | No* | **Raw** distance in **mm** (sensor to surface). As the starter rises, this value gets smaller. Stored as-is; server applies the device’s baseline (empty jar) to compute height = baseline − raw. Must be finite if present. |
| `ambient_temp_c` | number | No | Ambient temperature in **°C**. Valid range: -50 to 100. |
| `ambient_humidity_pct` | number | No | Ambient relative humidity in **percent** (0–100). |
| `meta` | object | No | Arbitrary JSON stored with the reading (e.g. sensor IDs, calibration flags). |

\* At least one of `distance_mm`, `ambient_temp_c`, or `ambient_humidity_pct` should be sent so the reading is useful.

**Validation (400 if failed)**

- `distance_mm`: if present, must be a finite number.
- `ambient_temp_c`: if present, must be a number in **[-50, 100]**.
- `ambient_humidity_pct`: if present, must be a number in **[0, 100]**.

**Responses**

- **204 No Content** — Reading stored; device `last_seen_at` updated.
- **400 Bad Request** — Invalid body (e.g. `{ "error": "Invalid distance_mm" }`).
- **401 Unauthorized** — Missing or invalid device token (e.g. `{ "error": "Invalid or missing device token" }`).

**Example (cURL)**

```bash
curl -X POST "https://your-ingest-host/ingest/starter" \
  -H "Authorization: Bearer YOUR_64_CHAR_HEX_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recorded_at":"2025-02-19T18:30:00.000Z","distance_mm":42.5,"ambient_temp_c":21.2,"ambient_humidity_pct":65}'
```

**Firmware notes (starter)**

- **Distance sensor:** Send **raw** mm from sensor (e.g. lid) to the starter surface. As the starter rises, the distance decreases. No transformation needed on device; the server uses a per-device **baseline** (empty jar) to compute rise height. Set the baseline in the app: **Devices** → device → **Set from latest reading** (with jar empty).
- **Optional:** Send `ambient_temp_c` and `ambient_humidity_pct` if you have a BME280/DHT/etc. for environment context.
- **Clock:** If the device has no RTC, omit `recorded_at` and rely on server time; otherwise send ISO 8601 for better accuracy.

---

### Dough monitor — `POST /ingest/dough`

Use for a sensor rig that measures **dough** during a bake: rise (distance) and optionally dough temperature and ambient conditions.

**Request**

- **Method:** `POST`
- **Path:** `/ingest/dough`
- **Headers:** `Authorization: Bearer <device_token>`, `Content-Type: application/json`
- **Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recorded_at` | string (ISO 8601) | No | When the reading was taken. If omitted, server uses request time. |
| `distance_mm` | number | No* | Raw distance in mm (sensor to surface). Must be finite if present. Baseline (empty vessel) can be set per device in the app for height derivation. |
| `dough_temp_c` | number | No | Dough (or probe) temperature in **°C**. Valid range: -20 to 60. |
| `ambient_temp_c` | number | No | Ambient temperature in **°C**. Valid range: -50 to 100. |
| `ambient_humidity_pct` | number | No | Ambient relative humidity in **percent** (0–100). |

\* At least one of `distance_mm`, `dough_temp_c`, `ambient_temp_c`, or `ambient_humidity_pct` is recommended.

**Validation (400 if failed)**

- `distance_mm`: if present, must be a finite number.
- `dough_temp_c`: if present, must be a number in **[-20, 60]**.
- `ambient_temp_c`: if present, must be a number in **[-50, 100]**.
- `ambient_humidity_pct`: if present, must be a number in **[0, 100]**.

**Responses**

- **204 No Content** — Reading stored; device `last_seen_at` updated.
- **400 Bad Request** — Invalid body (e.g. `{ "error": "Invalid dough_temp_c" }`).
- **401 Unauthorized** — Missing or invalid device token.

**Example (cURL)**

```bash
curl -X POST "https://your-ingest-host/ingest/dough" \
  -H "Authorization: Bearer YOUR_64_CHAR_HEX_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recorded_at":"2025-02-19T19:00:00.000Z","distance_mm":38.0,"dough_temp_c":24.1,"ambient_temp_c":22.0}'
```

**Firmware notes (dough)**

- **Distance:** Same idea as starter—mm from a fixed reference to the dough surface. Often used in a proofing vessel or under a dome; higher frequency (e.g. every 1–5 minutes) is useful during active proofing/baking.
- **Dough temp:** Use a probe or surface sensor; report in °C. Helps correlate rise with temperature.
- **When to send:** Start posting when the user attaches the monitor to a bake (e.g. when they start the bake in the app). You can send until the bake is done or the probe is removed.

---

### Health check

- **GET /health** — No auth. Returns `{ "ok": true }`. Use this to verify the ingest service is up and reachable from the device (e.g. on boot or before first POST).

### Firmware implementation tips

- **Store the token securely:** The 64‑hex device token is the only secret. Store it in flash or secure storage; avoid logging or exposing it.
- **HTTPS:** In production always use `https://` so the token and payload are encrypted in transit.
- **Retries:** On network or 5xx errors, retry with backoff (e.g. exponential: 1s, 2s, 4s, cap at 5 min). On **401**, do not retry—token is invalid or revoked; user must re-register or get a new token.
- **Timestamps:** Send `recorded_at` in ISO 8601 (e.g. `2025-02-19T18:30:00.000Z`). If the device has no RTC, either omit it (server time is used) or sync time via NTP and then send sensor time.
- **Payload size:** Keep the JSON small. Extra keys are stored in `payload` (dough) or under `meta` (starter) but are not used by the app; avoid huge blobs.
- **Rate:** There is no strict rate limit documented; sending every 1–15 minutes per reading type is typical. Avoid sub-second bursts.

## Voice / Siri

The ingest API accepts **voice text** for both **logging** (feedings, bake events, notes, outcomes) and **conversational queries** (starter status, bake progress).

- **POST /ingest/voice** — Auth: Bearer token (voice token or device token). Body: `{ "text": "string", "recorded_at": "ISO8601?", "source": "siri?" }`. The worker classifies intent:
  - **Query** (e.g. “check starter”, “check bake”, “what’s next”): status engines run and a spoken response is generated. The API **polls** for up to 5 seconds for the worker to finish, then returns **200** with `{ "response_text": "…" }` for Siri to read aloud. On timeout it returns `response_text: "One moment please."`
  - **Action** (log feeding, event, note, outcome): existing pipeline applies; API returns **204** when the job has been applied (or after timeout).
- **Response:** Plain text only (no markdown). Short sentences for TTS. Siri Shortcuts can send the request and speak `response_text` when present.
- **Database:** Voice logs store `response_text`, `intent_type`, and `processed_at` when the message was a query. The web app shows the response on the voice log detail page.

Apply the migration `20260222100000_voice_log_query_response` so `voice_logs` has the new columns (`npm run db:migrate`). **If you use Docker Compose** and "check starter" / "check bake" return 500 or the voice log stays "pending", the ingest-api and worker containers may be using a cached Prisma client that doesn't include `response_text` / `intent_type` / `processed_at`. Recreate their node_modules volumes so Prisma generate runs with the current schema:

```bash
docker compose down
docker volume rm sourdough-ai_ingest_node_modules sourdough-ai_worker_node_modules 2>/dev/null || true
docker compose up -d
```

If your project name differs, run `docker volume ls` and remove the volumes named `*_ingest_node_modules` and `*_worker_node_modules`. Then ensure migrations have run (the migrate service runs on first up; if the DB already existed, run `docker compose run --rm migrate npm run db:migrate` to apply the voice_log_query_response migration).

**Starter status (check starter):** Responses use the user’s account timezone (or `APP_TIMEZONE`) and include: last fed time (local), peak time, “until peak” / “past peak”, and peak window. If the last feeding was over 48 hours ago, a dry/sassy variant is used (e.g. “It’s been over 48 hours. I’m not even mad, I’m impressed. Or dead. Feed me.”).

