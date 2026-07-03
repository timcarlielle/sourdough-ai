/**
 * Bake event taxonomy (PRD). event_type is stored as string; event_phase is enum.
 * Quick-add buttons use QUICK_ADD_TYPES.
 */
export const BAKE_EVENT_PHASES = [
  "mixing",
  "bulk_fermentation",
  "dividing",
  "shaping",
  "proofing",
  "baking",
  "cooling",
  "evaluation",
  "environment",
  "custom",
] as const;

export type BakeEventPhase = (typeof BAKE_EVENT_PHASES)[number];

/** All event types by phase (professional sourdough taxonomy) */
export const EVENT_TYPES_BY_PHASE: Record<BakeEventPhase, readonly string[]> = {
  mixing: [
    "ingredient_scaled",
    "mix_started",
    "mix_completed",
    "autolyse_started",
    "autolyse_ended",
    "salt_added",
    "starter_added",
  ],
  bulk_fermentation: [
    "bulk_started",
    "fold_performed",
    "bulk_temp_check",
    "bulk_volume_check",
    "bulk_completed",
  ],
  dividing: ["divide_started", "pre_shape_completed", "bench_rest_started", "bench_rest_completed"],
  shaping: ["final_shape_completed"],
  proofing: [
    "proof_started",
    "proof_temp_check",
    "proof_volume_check",
    "retard_started",
    "retard_ended",
    "proof_completed",
  ],
  baking: [
    "oven_preheat_started",
    "oven_ready",
    "score_performed",
    "steam_added",
    "bake_started",
    "steam_released",
    "bake_completed",
  ],
  cooling: ["cooling_started", "cooling_completed"],
  evaluation: ["crumb_evaluated", "flavor_evaluated"],
  environment: ["ambient_temp_logged", "environment_change"],
  custom: ["note"],
};

export const ALL_EVENT_TYPES = BAKE_EVENT_PHASES.flatMap((p) => EVENT_TYPES_BY_PHASE[p]);

/** Default phase for an event type */
export const EVENT_TYPE_TO_PHASE: Record<string, BakeEventPhase> = (() => {
  const m: Record<string, BakeEventPhase> = {};
  for (const phase of BAKE_EVENT_PHASES) {
    for (const t of EVENT_TYPES_BY_PHASE[phase]) m[t] = phase;
  }
  return m;
})();

/** Recommended quick-add event types */
export const QUICK_ADD_TYPES = [
  "mix_started",
  "autolyse_started",
  "fold_performed",
  "final_shape_completed",
  "proof_started",
  "bake_started",
  "bake_completed",
] as const;

/** Event types that are "prep" (e.g. preheat, score) — show in timeline but no Log step / status colors. */
export const PREP_EVENT_TYPES = new Set([
  "ingredient_scaled",
  "autolyse_started",
  "autolyse_ended",
  "salt_added",
  "starter_added",
  "oven_preheat_started",
  "oven_ready",
  "score_performed",
  "steam_added",
  "steam_released",
]);

export function isPrepEventType(eventType: string | null): boolean {
  return eventType != null && PREP_EVENT_TYPES.has(eventType);
}

/** Baking steps with no eventType (e.g. "flip out of banneton") are prep — no Log step. */
export function isBakingPrepStep(step: { eventType: string | null; eventPhase?: string | null }): boolean {
  const phase = (step.eventPhase ?? "").toLowerCase();
  if (phase !== "baking") return false;
  return step.eventType == null || step.eventType === "" || PREP_EVENT_TYPES.has(step.eventType);
}

/** First step that is about building/feeding starter — we use our monitoring, not recipe time. */
export function isStarterPrepStep(step: { section: string; stepText: string; eventType: string | null }, sortOrder: number): boolean {
  if (sortOrder !== 0) return false;
  const section = (step.section || "").toLowerCase();
  if (section !== "mixing") return false;
  const text = (step.stepText || "").toLowerCase();
  if (/starter|feed|build|ripen|active|levain|refresh/.test(text)) return true;
  if (step.eventType === "mix_started" && /starter|feed|build/.test(text)) return true;
  return false;
}

export function getPhaseForEventType(eventType: string): BakeEventPhase {
  return EVENT_TYPE_TO_PHASE[eventType] ?? "custom";
}

export function labelForEventType(eventType: string): string {
  return eventType.replace(/_/g, " ");
}

/** Canonical display labels for phases (recipe section + timeline). Single source of truth so "Mixing" in recipe and timeline match. */
export const PHASE_LABELS: Record<BakeEventPhase, string> = {
  mixing: "Mixing",
  bulk_fermentation: "Bulk fermentation",
  dividing: "Dividing / Pre-shaping",
  shaping: "Shaping",
  proofing: "Proofing",
  baking: "Baking",
  cooling: "Cooling",
  evaluation: "Evaluation",
  environment: "Environment",
  custom: "Other",
};

/** Short summary of event types per phase (for settings UI: "Mixing (mix, autolyse, salt…)"). */
export const PHASE_EVENT_SUMMARY: Record<BakeEventPhase, string> = {
  mixing: "mix, autolyse, salt, starter",
  bulk_fermentation: "bulk start/end, folds",
  dividing: "divide, pre-shape, bench rest",
  shaping: "final shape",
  proofing: "proof, retard",
  baking: "preheat, score, steam, bake",
  cooling: "cooling start/end",
  evaluation: "crumb, flavor",
  environment: "temp, environment",
  custom: "notes",
};

/** Section names the recipe scrape LLM should use for steps (same as phase labels where applicable). */
export const RECIPE_SECTION_OPTIONS = [
  "Mixing",
  "Bulk fermentation",
  "Dividing / Pre-shaping",
  "Shaping",
  "Proofing",
  "Baking",
  "Cooling",
  "Evaluation",
  "Other",
] as const;

/** Display label for a timeline item: phase-based so recipe steps and logged events match (e.g. "Mixing" not "mix started"). */
export function displayLabelForStep(step: { section: string; eventPhase?: string | null }): string {
  const phase = step.eventPhase as BakeEventPhase | undefined;
  if (phase && phase in PHASE_LABELS) return PHASE_LABELS[phase];
  return step.section;
}

/** Display label for a logged event in timeline (phase-based for consistency with recipe steps). */
export function displayLabelForEvent(event: { eventType: string; eventPhase: string }): string {
  const phase = event.eventPhase as BakeEventPhase;
  if (phase && phase in PHASE_LABELS) return PHASE_LABELS[phase];
  return labelForEventType(event.eventType);
}

/** Whether a phase is tracked (shown in bake/dashboard timelines). null/empty trackedPhases = track all. */
export function isPhaseTracked(phase: string, trackedPhases: string[] | null): boolean {
  if (!trackedPhases || trackedPhases.length === 0) return true;
  return trackedPhases.includes(phase);
}

/** Effective phase for a recipe step (for filtering). Uses eventPhase if set, else infers from section. */
export function effectivePhaseForStep(step: { section: string; eventPhase?: string | null }): BakeEventPhase {
  const phase = step.eventPhase as BakeEventPhase | undefined;
  if (phase && phase in PHASE_LABELS) return phase;
  const sectionLower = step.section.trim().toLowerCase();
  for (const [p, label] of Object.entries(PHASE_LABELS) as [BakeEventPhase, string][]) {
    if (label.toLowerCase() === sectionLower) return p;
  }
  if (/retard|cold proof|fridge/i.test(sectionLower)) return "proofing";
  return "custom";
}
