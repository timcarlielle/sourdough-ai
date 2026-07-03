/**
 * Request-body parsing/validation for ingest endpoints. Pure functions so they
 * can be unit-tested without Fastify or a database.
 */
import { createHash } from "crypto";

/** SHA-256 hash of token (hex). Device.tokenHash and VoiceToken.tokenHash are stored this way. */
export function tokenHash(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export type Validated<T> = { ok: true; data: T } | { ok: false; error: string };

export type StarterReading = {
  recordedAt: Date;
  distanceMm: number | null;
  ambientTempC: number | null;
  ambientHumidityPct: number | null;
  meta: unknown;
};

export type DoughReading = {
  recordedAt: Date;
  distanceMm: number | null;
  doughTempC: number | null;
  ambientTempC: number | null;
  ambientHumidityPct: number | null;
};

export type VoiceMessage = {
  recordedAt: Date;
  text: string;
  source: string;
  rawMeta: object | undefined;
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function parseRecordedAt(value: unknown): Date | null {
  if (value == null) return new Date();
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateStarterBody(body: Record<string, unknown>): Validated<StarterReading> {
  const recordedAt = parseRecordedAt(body.recorded_at);
  if (!recordedAt) return { ok: false, error: "recorded_at must be a valid ISO8601 date" };
  const distanceMm = numberOrNull(body.distance_mm);
  const ambientTempC = numberOrNull(body.ambient_temp_c);
  const ambientHumidityPct = numberOrNull(body.ambient_humidity_pct);

  if (distanceMm != null && !Number.isFinite(distanceMm)) {
    return { ok: false, error: "Invalid distance_mm (must be a number)" };
  }
  if (ambientTempC != null && (!Number.isFinite(ambientTempC) || ambientTempC < -50 || ambientTempC > 100)) {
    return { ok: false, error: "Invalid ambient_temp_c" };
  }
  if (ambientHumidityPct != null && (!Number.isFinite(ambientHumidityPct) || ambientHumidityPct < 0 || ambientHumidityPct > 100)) {
    return { ok: false, error: "Invalid ambient_humidity_pct" };
  }
  return { ok: true, data: { recordedAt, distanceMm, ambientTempC, ambientHumidityPct, meta: body.meta } };
}

export function validateDoughBody(body: Record<string, unknown>): Validated<DoughReading> {
  const recordedAt = parseRecordedAt(body.recorded_at);
  if (!recordedAt) return { ok: false, error: "recorded_at must be a valid ISO8601 date" };
  const distanceMm = numberOrNull(body.distance_mm);
  const doughTempC = numberOrNull(body.dough_temp_c);
  const ambientTempC = numberOrNull(body.ambient_temp_c);
  const ambientHumidityPct = numberOrNull(body.ambient_humidity_pct);

  if (distanceMm != null && !Number.isFinite(distanceMm)) {
    return { ok: false, error: "Invalid distance_mm (must be a number)" };
  }
  if (doughTempC != null && (!Number.isFinite(doughTempC) || doughTempC < -20 || doughTempC > 60)) {
    return { ok: false, error: "Invalid dough_temp_c" };
  }
  if (ambientTempC != null && (!Number.isFinite(ambientTempC) || ambientTempC < -50 || ambientTempC > 100)) {
    return { ok: false, error: "Invalid ambient_temp_c" };
  }
  if (ambientHumidityPct != null && (!Number.isFinite(ambientHumidityPct) || ambientHumidityPct < 0 || ambientHumidityPct > 100)) {
    return { ok: false, error: "Invalid ambient_humidity_pct" };
  }
  return { ok: true, data: { recordedAt, distanceMm, doughTempC, ambientTempC, ambientHumidityPct } };
}

export function validateVoiceBody(body: Record<string, unknown>): Validated<VoiceMessage> {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 3) {
    return { ok: false, error: "text is required and must be at least 3 characters" };
  }
  const recordedAt = parseRecordedAt(body.recorded_at);
  if (!recordedAt) return { ok: false, error: "recorded_at must be a valid ISO8601 date" };
  const source = typeof body.source === "string" ? body.source : "siri";
  const rawMeta = body.meta != null && typeof body.meta === "object" ? (body.meta as object) : undefined;
  return { ok: true, data: { recordedAt, text, source, rawMeta } };
}
