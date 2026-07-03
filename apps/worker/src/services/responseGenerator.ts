import type { StarterStatusResult } from "./starterStatusEngine";
import type { BakeStatusResult } from "./bakeStatusEngine";

export type Tone = "neutral" | "friendly" | "dry";

/** Threshold (hours) for "too long since feeding" — triggers dry/sassy variant. */
export const STARTER_FED_TOO_LONG_HOURS = 48;

/** Format a UTC date in local time for speech (12-hour, e.g. 9:00 AM). */
function formatTimeLocal(d: Date, tz: string): string {
  return d.toLocaleTimeString("en-CA", {
    timeZone: tz,
    hour12: true,
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} minutes`;
  if (h < 24) return `${h.toFixed(1)} hours`;
  return `${(h / 24).toFixed(1)} days`;
}

function formatTime(d: Date, tz: string = "America/Edmonton"): string {
  return formatTimeLocal(d, tz);
}

/** Human-readable "until peak" or "past peak" from now. */
function formatUntilOrPastPeak(peakAt: Date): string {
  const now = Date.now();
  const diffMs = peakAt.getTime() - now;
  const diffMin = Math.round(diffMs / (60 * 1000));
  const absMin = Math.abs(diffMin);
  if (absMin < 60) return diffMin >= 0 ? `about ${absMin} minutes until peak` : `peak was about ${absMin} minutes ago`;
  const hours = Math.floor(absMin / 60);
  const mins = absMin % 60;
  const h = hours > 0 ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "";
  const m = mins > 0 ? ` ${mins} min` : "";
  return diffMin >= 0 ? `${h}${m} until peak`.trim() : `peak was ${h}${m} ago`.trim();
}

/** Generate plain-text spoken response for starter status. All times in local (tz). Includes last fed time, peak time, until/past peak, peak window. */
export function generateStarterResponse(
  data: StarterStatusResult,
  tone: Tone = "dry",
  tz: string = "America/Edmonton"
): string {
  const sass = data.sassLevel > 0 && tone !== "neutral";
  const fedTooLong = data.timeSinceFeedHours != null && data.timeSinceFeedHours > STARTER_FED_TOO_LONG_HOURS;

  if (data.recommendation === "no_data") {
    if (data.message) return data.message;
    return sass
      ? "I have no idea. You haven't logged a feeding yet."
      : "No starter feeding has been logged yet. Log a feeding to get status.";
  }

  const fedAgo = data.timeSinceFeedHours != null ? formatHours(data.timeSinceFeedHours) : "unknown";
  const lines: string[] = [];

  // Last fed: absolute time (local) + relative
  if (data.lastFedAt) {
    lines.push(`Last fed at ${formatTimeLocal(data.lastFedAt, tz)} — that was ${fedAgo} ago.`);
  } else {
    lines.push(`Your starter was fed ${fedAgo} ago.`);
  }

  // Peak time + until peak / past peak + peak window (all in local time)
  if (data.predictedPeakTime) {
    lines.push(`Peak time around ${formatTimeLocal(data.predictedPeakTime, tz)} — ${formatUntilOrPastPeak(data.predictedPeakTime)}.`);
  }
  if (data.predictedPeakStartAt && data.predictedPeakEndAt) {
    lines.push(`Peak window ${formatTimeLocal(data.predictedPeakStartAt, tz)} to ${formatTimeLocal(data.predictedPeakEndAt, tz)}.`);
  }

  // Dry/sassy when way overdue (>48h)
  if (fedTooLong) {
    lines.push(
      sass
        ? "It's been over 48 hours. I'm not even mad, I'm impressed. Or dead. Feed me."
        : "It's been over 48 hours since the last feed. Time to feed your starter."
    );
    return lines.join(" ");
  }

  if (data.activityPhase === "peak") {
    lines.push("It's at peak activity right now.");
    lines.push(sass ? "This is the moment. Don't blow it." : "Best time to use it or bake.");
  } else if (data.activityPhase === "rising") {
    lines.push("It's rising.");
    if (!data.predictedPeakTime) lines.push("It'll be ready soon.");
  } else if (data.activityPhase === "falling") {
    lines.push(sass ? "It's past its prime and judging you." : "Past peak. Consider feeding again soon.");
  }

  if (data.recommendation === "overdue" && !fedTooLong) {
    lines.push(sass ? "It's been over 24 hours. I'm starving. Feed me." : "It's been over 24 hours since the last feed. Time to feed.");
  } else if (data.recommendation === "feed_now") {
    lines.push("Still early in the cycle. No action needed yet.");
  } else if (data.recommendation === "past_prime_feed" && !lines.some((l) => l.includes("past its prime"))) {
    lines.push("Consider feeding again to refresh.");
  }

  return lines.join(" ");
}

/** Generate plain-text spoken response for bake status. Short sentences, no markdown. */
export function generateBakeResponse(
  data: BakeStatusResult,
  tone: Tone = "dry",
  tz: string = "America/Edmonton"
): string {
  if (!data.hasActiveBake) {
    return tone === "dry" ? "No active bake. Start one in the app." : "You don't have an active bake right now.";
  }

  const lines: string[] = [];
  const title = data.recipeTitle ? ` ${data.recipeTitle}.` : "";

  if (data.currentPhase) {
    lines.push(`You're in ${data.currentPhase.toLowerCase()}${title}`);
  }

  if (data.nextStepName && data.nextDueAt) {
    lines.push(`Next step: ${data.nextStepName} at ${formatTime(data.nextDueAt, tz)}.`);
    if (data.stepNotes) {
      lines.push(data.stepNotes);
    }
  } else {
    lines.push("No upcoming steps in the timeline. Add events or check your recipe.");
  }

  if (data.upcomingStepName && data.upcomingStepTime) {
    lines.push(`After that: ${data.upcomingStepName} at ${formatTime(data.upcomingStepTime, tz)}.`);
  }

  return lines.join(" ");
}

/** One-off for "unknown" query intent. */
export function generateUnknownQueryResponse(): string {
  return "I didn't catch that. Try asking about your starter or your current bake.";
}
