/**
 * Rule-driven recipe adjustment suggestions (no ML).
 * Input: bake with recipe, events, outcomes, starter/dough metrics.
 * Output: list of suggestions with type, old_value, suggested, reason.
 */

export type Suggestion = {
  type: string;
  old_value?: string;
  suggested?: string;
  reason?: string;
};

export type RuleContext = {
  bake: {
    startedAt: Date;
    endedAt: Date | null;
    recipeId: string;
    recipe: {
      steps: Array<{
        estimatedMinutesFromStart: number | null;
        targetState: string | null;
        section: string;
        eventType: string | null;
      }>;
    };
    events: Array<{ eventType: string; eventPhase: string; occurredAt: Date }>;
    outcomes: Array<{
      sournessRating: number | null;
      overallRating: number | null;
      ovenSpringRating: number | null;
      tooSour: boolean;
      underproofed: boolean;
      overproofed: boolean;
      dense: boolean;
      gummy: boolean;
    }>;
    starterCycle: { startedAt: Date; deviceId: string | null } | null;
  };
  starterMetrics: {
    timeToPeakMinutes: number | null;
    peakHeightMm: number | null;
    growthRatePerHour: number | null;
    state: string;
  } | null;
  doughMetrics: {
    avgTempC: number | null;
    maxRiseMm: number | null;
  } | null;
};

export function runRuleEngine(ctx: RuleContext): { suggestions: Suggestion[]; rulesTriggered: string[] } {
  const suggestions: Suggestion[] = [];
  const rulesTriggered: string[] = [];

  const { bake, starterMetrics, doughMetrics } = ctx;
  const outcome = bake.outcomes[0];
  const steps = bake.recipe.steps;
  const events = bake.events;

  // ---- 1. Starter timing mismatch ----
  const starterStep = steps.find((s) => s.targetState === "starter_peak" || (s.eventType != null && s.estimatedMinutesFromStart != null));
  const recipeOffsetMinutes = starterStep?.estimatedMinutesFromStart ?? null;
  if (starterMetrics?.timeToPeakMinutes != null && recipeOffsetMinutes != null) {
    const diff = Math.abs(starterMetrics.timeToPeakMinutes - recipeOffsetMinutes);
    if (diff > 60) {
      rulesTriggered.push("starter_timing_mismatch");
      const suggestedHours = Math.round(starterMetrics.timeToPeakMinutes / 60);
      suggestions.push({
        type: "adjust_starter_timing",
        old_value: `${Math.round(recipeOffsetMinutes / 60)}h`,
        suggested: `${suggestedHours}h`,
        reason: `Recipe expects peak at ${Math.round(recipeOffsetMinutes / 60)}h; your starter peaked at ${(starterMetrics.timeToPeakMinutes / 60).toFixed(1)}h.`,
      });
    }
  }

  if (!outcome) return { suggestions, rulesTriggered };

  const sourness = outcome.sournessRating ?? (outcome.tooSour ? 5 : 3);
  const ovenSpring = outcome.ovenSpringRating ?? 3;
  const bulkMinutes = eventsDurationMinutes(events, "bulk_fermentation");
  const proofMinutes = eventsDurationMinutes(events, "proofing");

  // ---- 2. Sourness ----
  if (sourness >= 4 && bulkMinutes != null && bulkMinutes > 180) {
    rulesTriggered.push("sourness_high_long_bulk");
    suggestions.push({
      type: "adjust_bulk_duration",
      old_value: `${Math.round(bulkMinutes / 60)}h`,
      suggested: `${Math.round((bulkMinutes * 0.75) / 60)}h`,
      reason: "High sourness with long bulk — try shortening bulk fermentation.",
    });
  }
  if (sourness <= 2 && starterMetrics?.state === "rising") {
    rulesTriggered.push("sourness_low_starter_pre_peak");
    suggestions.push({
      type: "use_starter_later",
      reason: "Low sourness; starter may have been used before peak. Try using starter at or just after peak.",
    });
  }

  // ---- 3. Oven spring ----
  if (ovenSpring <= 2 && proofMinutes != null && proofMinutes > 60) {
    rulesTriggered.push("oven_spring_low_long_proof");
    suggestions.push({
      type: "adjust_proof_duration",
      old_value: `${Math.round(proofMinutes / 60)}h`,
      suggested: `${Math.round((proofMinutes * 0.7) / 60)}h`,
      reason: "Low oven spring with long proof — try shorter proof.",
    });
  }

  // ---- 4. Crumb density ----
  if (outcome.dense && bulkMinutes != null && bulkMinutes < 120) {
    rulesTriggered.push("dense_low_fermentation");
    suggestions.push({
      type: "adjust_bulk_duration",
      old_value: `${Math.round(bulkMinutes / 60)}h`,
      suggested: `${Math.round((bulkMinutes * 1.5) / 60)}h`,
      reason: "Dense crumb with relatively short bulk — try longer bulk fermentation.",
    });
  }

  // ---- 5. Temperature ----
  if (doughMetrics?.avgTempC != null && doughMetrics.avgTempC > 26 && sourness >= 4) {
    rulesTriggered.push("temp_high_sourness_high");
    suggestions.push({
      type: "lower_dough_temp",
      old_value: `${Math.round(doughMetrics.avgTempC)}°C`,
      suggested: "22–24°C",
      reason: "High dough temp with high sourness — try cooler bulk (e.g. 22–24°C).",
    });
  }

  // ---- 6. Starter strength ----
  if (
    starterMetrics?.growthRatePerHour != null &&
    starterMetrics.growthRatePerHour < 2 &&
    ovenSpring <= 2
  ) {
    rulesTriggered.push("starter_slow_poor_spring");
    suggestions.push({
      type: "extra_feed_cycle",
      reason: "Starter growth was slow and oven spring was low — consider an extra feed cycle before mixing.",
    });
  }

  return { suggestions, rulesTriggered };
}

function eventsDurationMinutes(
  events: Array<{ eventType: string; eventPhase: string; occurredAt: Date }>,
  phase: string
): number | null {
  const phaseEvents = events.filter((e) => e.eventPhase === phase);
  if (phaseEvents.length < 2) return null;
  const sorted = phaseEvents.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const start = sorted[0].occurredAt.getTime();
  const end = sorted[sorted.length - 1].occurredAt.getTime();
  return (end - start) / (1000 * 60);
}
