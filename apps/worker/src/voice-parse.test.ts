import { describe, it, expect } from "vitest";
import { normalizeParsedPlan, computeEffectiveTime, LLM_EVENT_TO_OUR, type ParsedPlan } from "./voice-parse";

describe("normalizeParsedPlan", () => {
  it("normalizes a canned feeding response", () => {
    const plan = normalizeParsedPlan({
      intent: "LOG_FEEDING",
      intent_type: "log_feeding",
      confidence: 0.92,
      time_ref: "relative",
      time_ref_minutes: 30,
      actions: [
        { type: "CREATE_FEEDING", flour_g: 50, water_g: 50, starter_g: 25, notes: "whole wheat" },
      ],
    });
    expect(plan.intent).toBe("LOG_FEEDING");
    expect(plan.confidence).toBe(0.92);
    expect(plan.time_ref).toBe("relative");
    expect(plan.time_ref_minutes).toBe(30);
    expect(plan.actions).toHaveLength(1);
  });

  it("throws on missing intent", () => {
    expect(() => normalizeParsedPlan({})).toThrow("Invalid schema: missing intent");
    expect(() => normalizeParsedPlan(null)).toThrow("Invalid schema: missing intent");
    expect(() => normalizeParsedPlan({ intent: 42 })).toThrow("Invalid schema: missing intent");
  });

  it("defaults malformed fields instead of failing", () => {
    const plan = normalizeParsedPlan({
      intent: "QUERY_STARTER",
      confidence: "high",
      time_ref: "someday",
      time_ref_minutes: "30",
      actions: "not-an-array",
      assumptions: null,
    });
    expect(plan.confidence).toBe(0);
    expect(plan.time_ref).toBe("now");
    expect(plan.time_ref_minutes).toBeNull();
    expect(plan.actions).toEqual([]);
    expect(plan.assumptions).toEqual([]);
  });
});

describe("computeEffectiveTime", () => {
  const receivedAt = new Date("2026-02-20T18:00:00.000Z");
  const recordedAt = new Date("2026-02-20T17:59:00.000Z");
  const base: ParsedPlan = { intent: "LOG_FEEDING", confidence: 1, actions: [] };

  it("uses receipt time for time_ref=now", () => {
    const t = computeEffectiveTime({ ...base, time_ref: "now" }, receivedAt, recordedAt, "UTC");
    expect(t.toISOString()).toBe(receivedAt.toISOString());
  });

  it("subtracts relative minutes from receipt time", () => {
    const t = computeEffectiveTime(
      { ...base, time_ref: "relative", time_ref_minutes: 45 },
      receivedAt,
      recordedAt,
      "UTC"
    );
    expect(t.toISOString()).toBe("2026-02-20T17:15:00.000Z");
  });

  it("ignores negative relative minutes (falls back to receipt time)", () => {
    const t = computeEffectiveTime(
      { ...base, time_ref: "relative", time_ref_minutes: -10 },
      receivedAt,
      recordedAt,
      "UTC"
    );
    expect(t.toISOString()).toBe(receivedAt.toISOString());
  });

  it("defaults to receipt time when time_ref missing", () => {
    const t = computeEffectiveTime(base, receivedAt, recordedAt, "UTC");
    expect(t.toISOString()).toBe(receivedAt.toISOString());
  });
});

describe("LLM_EVENT_TO_OUR", () => {
  it("maps core bake events to known phases", () => {
    expect(LLM_EVENT_TO_OUR.MIX_START).toEqual({ eventType: "mix_started", eventPhase: "mixing" });
    expect(LLM_EVENT_TO_OUR.BULK_START!.eventPhase).toBe("bulk_fermentation");
    expect(LLM_EVENT_TO_OUR.OVEN_IN).toEqual({ eventType: "bake_started", eventPhase: "baking" });
    expect(LLM_EVENT_TO_OUR.OTHER).toEqual({ eventType: "note", eventPhase: "custom" });
  });

  it("maps both fold variants to fold_performed", () => {
    expect(LLM_EVENT_TO_OUR.STRETCH_FOLD!.eventType).toBe("fold_performed");
    expect(LLM_EVENT_TO_OUR.COIL_FOLD!.eventType).toBe("fold_performed");
  });
});
