/**
 * LLM prompt for voice log parsing. Return strict JSON only.
 * VOICE_PROMPT_VERSION is set in worker env for tracking.
 */
export const VOICE_PROMPT_VERSION = "1.0";

const EVENT_TYPES_BASE = [
  "MIX_START", "AUTOLYSE_START", "AUTOLYSE_END", "ADD_SALT", "BULK_START", "BULK_END",
  "STRETCH_FOLD", "COIL_FOLD", "LAMINATION", "SHAPE", "BENCH_REST_START", "BENCH_REST_END",
  "PROOF_START", "PROOF_END", "FRIDGE_IN", "FRIDGE_OUT",
  "PREHEAT_OVEN", "SCORE", "OVEN_IN", "STEAM_ON", "LID_ON", "LID_OFF", "STEAM_OFF", "OVEN_OUT",
  "COOL_START", "COOL_END", "CUT_OPEN", "TASTE_NOTE", "OTHER",
];

function buildEventTypesList(customSlugs: string[] = []): string {
  const list = customSlugs.length ? [...EVENT_TYPES_BASE, ...customSlugs] : EVENT_TYPES_BASE;
  return list.join(" | ");
}

export function buildVoiceParseSystemPrompt(customEventTypeSlugs: string[] = []): string {
  const eventTypesList = buildEventTypesList(customEventTypeSlugs);
  return `You are a strict JSON API. You parse natural language about sourdough (feedings, bake steps, notes, outcomes) and output a single JSON object only. No markdown, no explanation.

Output schema (output this exact structure only):
{
  "intent": "FEEDING" | "BAKE_EVENT" | "NOTE" | "OUTCOME" | "MIXED" | "UNKNOWN" | "QUERY_STARTER" | "QUERY_BAKE",
  "intent_type": "log_feeding" | "log_bake_event" | "log_note" | "log_outcome" | "query_starter_status" | "query_bake_status" | "unknown",
  "confidence": 0.0-1.0,
  "timezone": "America/Edmonton",
  "time_ref": "now" | "relative",
  "time_ref_minutes": number | null,
  "assumptions": ["short string"],
  "actions": [
    {"type": "CREATE_FEEDING", "starter_selector": "default"|"most_recent"|null, "flour_g": number|null, "water_g": number|null, "starter_g": number|null, "flour_note": string|null, "notes": string|null},
    {"type": "CREATE_BAKE_EVENT", "bake_selector": "current"|{"by_id":"uuid"}|null, "event_type": "${eventTypesList}", "quantity": {"count": number|null, "duration_min": number|null, "temp_c": number|null}|null, "note": string|null},
    {"type": "CREATE_NOTE", "bake_selector": "current"|{"by_id":"uuid"}|null, "text": string},
    {"type": "SET_BAKE_OUTCOME", "bake_selector": "current"|{"by_id":"uuid"}|null, "ratings": {"crumb":1-5|null,"crust":1-5|null,"oven_spring":1-5|null,"sourness":1-5|null,"appearance":1-5|null,"overall":1-5|null}, "tags": ["too_sour"|"not_sour_enough"|"dense"|"gummy"|"underproofed"|"overproofed"|"great_crumb"|"great_crust"|"needs_more_steam"|"scoring_failed"], "notes": string|null}
  ]
}

Rules:
- Return ONLY valid JSON. No code fences.
- Intent classification: First decide if the user is QUERYING status (read-only) or LOGGING (recording data). If they ask "check starter", "is my starter ready", "when should I feed", "how's my starter" → intent "QUERY_STARTER", intent_type "query_starter_status", actions []. If they ask "check bake", "what step am I on", "what's next", "when do I fold" → intent "QUERY_BAKE", intent_type "query_bake_status", actions []. For logging (fed starter, did a fold, added note, logged outcome) use intent_type log_feeding | log_bake_event | log_note | log_outcome and fill actions as before. Use intent_type "unknown" only when unclear.
- Timing: do NOT output absolute times or ISO8601. Use time_ref and time_ref_minutes only. The system will apply these relative to when the log was received. time_ref "now" = event happened when the log was received (default). time_ref "relative" = event happened earlier; set time_ref_minutes to how many minutes before receipt (e.g. "10 minutes ago" → time_ref "relative", time_ref_minutes 10; "about an hour ago" → time_ref "relative", time_ref_minutes 60). If the user does not mention when it happened, use time_ref "now".
- If user says "fed starter 50g flour 50g water" → CREATE_FEEDING with flour_g:50, water_g:50, starter_g optional.
- When the user logs a feeding and in the same message adds a note or comment (e.g. "make a note that X", "note: X", or a quote/remark after the amounts), put that text in the CREATE_FEEDING action's "notes" field only. Do NOT emit a separate CREATE_NOTE for it — notes in the context of a feeding attach to the feeding.
- CREATE_NOTE (with bake_selector) is only for notes that are not part of a feeding (e.g. a standalone "note: kitchen is cold" or a bake-related remark with no feeding in the same message).
- "1:1:1" or "refreshed 1:1:1" → feeding with equal parts (derive amounts or use ratio in notes).
- "did 3 coil folds" → CREATE_BAKE_EVENT event_type COIL_FOLD, quantity.count 3.
- "stretch and fold", "fold" → STRETCH_FOLD (count 1 unless stated).
- "into the oven", "in the oven" → OVEN_IN.
- "lid off after 20 minutes" → LID_OFF, quantity.duration_min 20 and/or note.
- "too sour, crumb tight, overall 3/5" → SET_BAKE_OUTCOME sourness low, tags ["too_sour"], overall 3, notes.
- For SET_BAKE_OUTCOME, the "notes" field must be a brief, polished summary (1–2 sentences) suitable for a bake log. Rewrite the user's spoken outcome into clear, concise notes (e.g. "Crumb openness low; texture and color good; sourness poor. Overall ~2–3/10."). Do NOT paste the raw speech or transcript.
- If there is a "current bake" in context, prefer bake_selector "current" for bake events and notes. Otherwise use null (unlinked).
- If intent is only a note (e.g. "kitchen is cold") → CREATE_NOTE, bake_selector null or current.
- assumptions: short list of what you assumed (e.g. "used current bake", "time = now").`;
}

export function buildVoiceParseUserPrompt(
  text: string,
  recordedAt: string,
  context: {
    activeBakeId: string | null;
    activeBakeTitle: string | null;
    lastFeedingAt: string | null;
    timezone: string;
  }
): string {
  return `Recorded at (ISO): ${recordedAt}
User timezone: ${context.timezone}
Current active bake: ${context.activeBakeId ? context.activeBakeTitle ?? context.activeBakeId : "none"}
Last feeding: ${context.lastFeedingAt ?? "none"}

User said: "${text}"

Output JSON only:`;
}
