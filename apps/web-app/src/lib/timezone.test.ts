import { describe, it, expect } from "vitest";
import { formatDateTime, formatForDateTimeLocalInput, dateTimeLocalStringToISO } from "./timezone";

/** en-CA am/pm rendering varies by ICU version ("p.m." vs "PM") — normalize before comparing. */
const norm = (s: string) => s.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");

describe("formatDateTime", () => {
  /**
   * Deterministic output for (date, timezone) so SSR and client render the same string.
   * en-CA locale with hour12: true; exact am/pm punctuation may vary by Node/browser Intl.
   */
  it("formats fixed UTC instant in America/Edmonton consistently", () => {
    const iso = "2026-02-25T04:16:43.000Z";
    const out = formatDateTime(iso, "America/Edmonton");
    expect(norm(out)).toBe("2026-02-24, 9:16 pm");
  });

  it("formats same instant in UTC", () => {
    const iso = "2026-02-25T04:16:43.000Z";
    const out = formatDateTime(iso, "UTC");
    expect(norm(out)).toBe("2026-02-25, 4:16 am");
  });

  it("accepts Date instance", () => {
    const d = new Date("2026-02-25T04:16:43.000Z");
    expect(norm(formatDateTime(d, "UTC"))).toBe("2026-02-25, 4:16 am");
  });

  it("same inputs produce same output (SSR/client consistency)", () => {
    const iso = "2026-02-25T04:16:43.000Z";
    const tz = "America/Edmonton";
    expect(formatDateTime(iso, tz)).toBe(formatDateTime(iso, tz));
  });
});

describe("formatForDateTimeLocalInput", () => {
  it("renders UTC instant as local wall time in the given timezone", () => {
    expect(formatForDateTimeLocalInput("2026-02-25T04:16:43.000Z", "America/Edmonton")).toBe("2026-02-24T21:16");
    expect(formatForDateTimeLocalInput("2026-02-25T04:16:43.000Z", "UTC")).toBe("2026-02-25T04:16");
  });
});

describe("dateTimeLocalStringToISO", () => {
  it("round-trips a wall time through the given timezone", () => {
    const iso = dateTimeLocalStringToISO("2026-02-24T21:16", "America/Edmonton");
    expect(iso).toBe("2026-02-25T04:16:00.000Z");
  });

  it("handles DST-summer offsets", () => {
    // July 1: Edmonton is MDT (UTC-6)
    const iso = dateTimeLocalStringToISO("2026-07-01T12:00", "America/Edmonton");
    expect(iso).toBe("2026-07-01T18:00:00.000Z");
  });
});
