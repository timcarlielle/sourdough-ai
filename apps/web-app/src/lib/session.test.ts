import { describe, it, expect } from "vitest";
import { apiTokenHash } from "./session";

describe("apiTokenHash", () => {
  it("matches the ingest-api token hash scheme (sha256 hex)", () => {
    // echo -n "abc" | shasum -a 256
    expect(apiTokenHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("is deterministic and 64 hex chars for a 64-hex token", () => {
    const raw = "f".repeat(64);
    expect(apiTokenHash(raw)).toBe(apiTokenHash(raw));
    expect(apiTokenHash(raw)).toMatch(/^[0-9a-f]{64}$/);
  });
});
