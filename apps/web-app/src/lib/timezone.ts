/**
 * User timezone: prefer account timezone (from session or API). Fallback from env for server/worker.
 */
export const APP_TIMEZONE =
  (typeof window !== "undefined" ? process.env.NEXT_PUBLIC_APP_TIMEZONE : process.env.APP_TIMEZONE) ||
  "America/Edmonton";

const DATETIME_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  hour12: true,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * Deterministic date/time formatter for SSR + client. Uses Intl.DateTimeFormat with explicit
 * timeZone so the same (dateLike, timezone) always produces the same string and avoids
 * hydration mismatch. Use this everywhere we display dates/times (never toLocaleString without timezone).
 *
 * @param dateLike - Date instance or ISO string from API
 * @param timezone - IANA timezone (e.g. users.timezone from DB, or APP_TIMEZONE / 'UTC')
 */
export function formatDateTime(dateLike: Date | string, timezone: string): string {
  const d = new Date(dateLike);
  const formatter = new Intl.DateTimeFormat("en-CA", { ...DATETIME_FORMAT_OPTS, timeZone: timezone });
  return formatter.format(d);
}

/**
 * Single canonical helper for timezone conversion: timestamps are stored in UTC in the DB.
 * Use this to display any UTC date/time in the app timezone (or a given IANA timezone).
 * Use everywhere for starter prediction times (dashboard, feedings, planning) and any
 * other UTC timestamps so display is consistent.
 *
 * @param date - UTC date (Date or ISO string from API)
 * @param timezone - IANA timezone (default APP_TIMEZONE). Use session/API user timezone when available.
 * @param format - 'datetime' (e.g. Feb 19, 9:57 PM) or 'time' (e.g. 9:57 PM)
 */
export function formatUtcInAppTz(
  date: Date | string,
  timezone: string = APP_TIMEZONE,
  format: "datetime" | "time" = "time"
): string {
  const d = new Date(date);
  if (format === "time") {
    return d.toLocaleTimeString("en-CA", {
      timeZone: timezone,
      hour12: true,
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return formatDateTime(d, timezone);
}

/**
 * Format a date in the given IANA timezone. Uses 12-hour clock (e.g. 9:57 PM) for readability.
 * Pass timezone from session.user.timezone or API (e.g. "America/Edmonton", "Europe/London").
 * Prefer formatDateTime for deterministic SSR/client output; this delegates to it.
 */
export function formatInUserTz(date: Date | string, timezone: string = APP_TIMEZONE): string {
  return formatDateTime(date, timezone);
}

/**
 * Format time only (e.g. 9:57 PM) in the given timezone.
 * Prefer formatUtcInAppTz for starter prediction timestamps (UTC in DB → display in app tz).
 */
export function formatTimeInTz(date: Date | string, timezone: string = APP_TIMEZONE): string {
  return formatUtcInAppTz(date, timezone, "time");
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Format a date in the given timezone as YYYY-MM-DDTHH:mm for use in
 * <input type="datetime-local" />. Use this so the default "now" and edited
 * values show in the user's account timezone, not UTC.
 */
export function formatForDateTimeLocalInput(date: Date | string, timezone: string = APP_TIMEZONE): string {
  const d = new Date(date);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  return `${year}-${pad2(Number(month))}-${pad2(Number(day))}T${pad2(Number(hour))}:${pad2(Number(minute))}`;
}

/** Current time in the given timezone, formatted for datetime-local input. */
export function getNowForDateTimeLocalInput(timezone: string = APP_TIMEZONE): string {
  return formatForDateTimeLocalInput(new Date(), timezone);
}

/**
 * Parse a datetime-local value (YYYY-MM-DDTHH:mm) as a moment in the given timezone
 * and return an ISO string. Use when submitting form values to the API.
 */
export function dateTimeLocalStringToISO(localStr: string, timezone: string = APP_TIMEZONE): string {
  const [datePart, timePart] = localStr.split("T");
  if (!datePart || !timePart) return new Date(localStr).toISOString();
  const [y, m, d] = datePart.split("-").map(Number);
  const [hour, min] = timePart.split(":").map(Number);
  const start = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, hour ?? 0, min ?? 0));
  for (let offsetMin = -12 * 60; offsetMin <= 12 * 60; offsetMin += 15) {
    const candidate = new Date(start.getTime() + offsetMin * 60 * 1000);
    if (formatForDateTimeLocalInput(candidate, timezone) === localStr) return candidate.toISOString();
  }
  return start.toISOString();
}

/** @deprecated Use formatUtcInAppTz or formatInUserTz with timezone from session/API */
export function formatInAppTz(date: Date | string): string {
  return formatUtcInAppTz(date, APP_TIMEZONE, "datetime");
}
