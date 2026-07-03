import { describe, it, expect } from "vitest";
import { tokenHash, validateStarterBody, validateDoughBody, validateVoiceBody } from "./validate";

describe("tokenHash", () => {
  it("produces the sha256 hex of the raw token", () => {
    // echo -n "abc" | shasum -a 256
    expect(tokenHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("is deterministic and 64 hex chars", () => {
    const h = tokenHash("a".repeat(64));
    expect(h).toBe(tokenHash("a".repeat(64)));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("validateStarterBody", () => {
  it("accepts a full valid reading", () => {
    const res = validateStarterBody({
      recorded_at: "2026-02-19T18:30:00.000Z",
      distance_mm: 42.5,
      ambient_temp_c: 21.2,
      ambient_humidity_pct: 65,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.recordedAt.toISOString()).toBe("2026-02-19T18:30:00.000Z");
      expect(res.data.distanceMm).toBe(42.5);
      expect(res.data.ambientTempC).toBe(21.2);
      expect(res.data.ambientHumidityPct).toBe(65);
    }
  });

  it("defaults recorded_at to now when omitted", () => {
    const before = Date.now();
    const res = validateStarterBody({ distance_mm: 10 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.recordedAt.getTime()).toBeGreaterThanOrEqual(before);
    }
  });

  it("rejects a malformed recorded_at", () => {
    const res = validateStarterBody({ recorded_at: "not-a-date", distance_mm: 10 });
    expect(res).toEqual({ ok: false, error: "recorded_at must be a valid ISO8601 date" });
  });

  it("treats non-number fields as absent (string distance ignored)", () => {
    const res = validateStarterBody({ distance_mm: "42" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.distanceMm).toBeNull();
  });

  it("rejects non-finite distance_mm", () => {
    const res = validateStarterBody({ distance_mm: Number.NaN });
    expect(res).toEqual({ ok: false, error: "Invalid distance_mm (must be a number)" });
  });

  it("rejects out-of-range ambient_temp_c", () => {
    expect(validateStarterBody({ ambient_temp_c: -51 }).ok).toBe(false);
    expect(validateStarterBody({ ambient_temp_c: 101 }).ok).toBe(false);
    expect(validateStarterBody({ ambient_temp_c: -50 }).ok).toBe(true);
    expect(validateStarterBody({ ambient_temp_c: 100 }).ok).toBe(true);
  });

  it("rejects out-of-range ambient_humidity_pct", () => {
    expect(validateStarterBody({ ambient_humidity_pct: -1 }).ok).toBe(false);
    expect(validateStarterBody({ ambient_humidity_pct: 100.5 }).ok).toBe(false);
    expect(validateStarterBody({ ambient_humidity_pct: 0 }).ok).toBe(true);
    expect(validateStarterBody({ ambient_humidity_pct: 100 }).ok).toBe(true);
  });
});

describe("validateDoughBody", () => {
  it("accepts a full valid reading", () => {
    const res = validateDoughBody({
      recorded_at: "2026-02-19T19:00:00.000Z",
      distance_mm: 38.0,
      dough_temp_c: 24.1,
      ambient_temp_c: 22.0,
      ambient_humidity_pct: 55,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.doughTempC).toBe(24.1);
  });

  it("rejects out-of-range dough_temp_c", () => {
    expect(validateDoughBody({ dough_temp_c: -21 }).ok).toBe(false);
    expect(validateDoughBody({ dough_temp_c: 61 }).ok).toBe(false);
    expect(validateDoughBody({ dough_temp_c: -20 }).ok).toBe(true);
    expect(validateDoughBody({ dough_temp_c: 60 }).ok).toBe(true);
  });

  it("rejects a malformed recorded_at", () => {
    expect(validateDoughBody({ recorded_at: "garbage" }).ok).toBe(false);
  });
});

describe("validateVoiceBody", () => {
  it("accepts text with defaults", () => {
    const res = validateVoiceBody({ text: "fed the starter 1:1:1" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.text).toBe("fed the starter 1:1:1");
      expect(res.data.source).toBe("siri");
      expect(res.data.rawMeta).toBeUndefined();
    }
  });

  it("trims text and rejects under 3 characters", () => {
    expect(validateVoiceBody({ text: "  hi  " }).ok).toBe(false);
    expect(validateVoiceBody({ text: "   " }).ok).toBe(false);
    expect(validateVoiceBody({}).ok).toBe(false);
  });

  it("rejects invalid recorded_at", () => {
    const res = validateVoiceBody({ text: "check starter", recorded_at: "yesterday-ish" });
    expect(res).toEqual({ ok: false, error: "recorded_at must be a valid ISO8601 date" });
  });

  it("passes through source and object meta", () => {
    const res = validateVoiceBody({ text: "check bake", source: "app", meta: { a: 1 } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.source).toBe("app");
      expect(res.data.rawMeta).toEqual({ a: 1 });
    }
  });
});
