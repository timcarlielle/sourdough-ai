# Smoke-test checklist

Manual QA pass for a release. Run against a fresh stack (`docker compose up`) unless noted.
Items marked **[AI]** require `OPENAI_API_KEY`; run the whole list once **without** a key
(AI features should be hidden/disabled, nothing should error) and once with one.

## Accounts & auth

- [ ] Sign up with a new email; default recipe and starter model are created.
- [ ] Log out, log back in. Session survives a page reload.
- [ ] Wrong password is rejected.
- [ ] `POST /api/auth/mobile` with valid credentials returns a token; with bad credentials returns 401; 6+ rapid attempts return 429.
- [ ] A Bearer token works on `/api/dashboard`; after revoking it in Account → API access tokens, the same request returns 401.
- [ ] `GET /api/meta` (no auth) returns version + `features.ai` matching whether the key is set.

## Feedings & starter cycles

- [ ] Create a feeding (web form). It appears in `/feedings` and starts a cycle ("Current cycle" badge).
- [ ] Dashboard shows the cycle with fed-at time in the account timezone.
- [ ] Edit a feeding; changes persist. Delete a feeding.
- [ ] Change account timezone; times across dashboard/feedings/planning update accordingly.

## Devices & telemetry

- [ ] Create a starter-monitor device; the token is shown once.
- [ ] `POST /ingest/starter` with the token returns 204; reading appears on the device page and dashboard live readings.
- [ ] Invalid token → 401. Revoked/deactivated device token → 401. Out-of-range `ambient_temp_c` → 400. Malformed `recorded_at` → 400.
- [ ] Set device baseline from latest reading; rise height derives correctly.
- [ ] Same for a dough-monitor device via `POST /ingest/dough`.

## Bakes

- [ ] Start a bake from a recipe; it shows on the dashboard as Current Bake.
- [ ] Log events across phases (mix, folds, shape, proof, bake); the timeline reflects them.
- [ ] Complete the bake and log an outcome (ratings + toggles + notes).
- [ ] **[AI]** After the outcome, an analyze_bake job runs and recommendations appear on the bake page; Accept/Ignore feedback saves.

## Recipes

- [ ] Create, edit, delete a recipe with steps and ingredients.
- [ ] **[AI]** Scrape-preview a recipe from a URL.

## Voice

- [ ] **[AI]** Record a voice note in the widget (works in iOS Safari too); it uploads, the worker transcribes, and a parsed log appears in `/voice-logs`.
- [ ] **[AI]** Voice log detail shows transcript, intent, applied actions; rerun works.
- [ ] **[AI]** Create a voice token; `POST /ingest/voice` with "check starter" returns a spoken-style `response_text` within ~5s.
- [ ] `GET /api/voice/file/<filename>` without auth → 401; with another user's session → 404; owner can play back the clip.

## Planning & analytics

- [ ] Planning page renders ("starter ready?" and "plan a bake") without errors on a fresh account.
- [ ] After ≥3 completed cycles with temperature data, predictions appear (peak time + window).

## Mobile / responsive

- [ ] At 375 px width: no horizontal scroll on any page; hamburger menu opens/closes and navigates.
- [ ] Charts fit their cards on mobile; forms usable with the on-screen keyboard.

## Failure modes

- [ ] Stop the worker; voice uploads and outcome logging still succeed (jobs queue). Restart the worker; queued jobs process.
- [ ] Stop Redis: web pages still load; queue-dependent actions fail gracefully (no crash loop).
- [ ] Run the stack without `OPENAI_API_KEY`: worker starts, logs "AI features disabled", non-AI features all work.
- [ ] Invalid `OPENAI_API_KEY`: voice jobs fail with a clear error status on the voice log, not silent hangs.
