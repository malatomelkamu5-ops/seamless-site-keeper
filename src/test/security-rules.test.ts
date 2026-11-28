import { describe, expect, it } from "vitest";
import { generateRegistrationCode, matchesRegistrationCode, normalizeRegistrationCode } from "@/lib/admin-rules";

describe("registration access code protection", () => {
  it("generates an 8-character formatted code without ambiguous characters", () => {
    const code = generateRegistrationCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("normalizes spacing, dashes and casing when checking a registration code", () => {
    expect(normalizeRegistrationCode(" abcd - ef23 ")).toBe("ABCDEF23");
    expect(matchesRegistrationCode("abcd ef23", "ABCD-EF23")).toBe(true);
    expect(matchesRegistrationCode("ABCDEF23", "ABCD-EF23")).toBe(true);
  });

  it("rejects empty, missing or wrong registration codes", () => {
    expect(matchesRegistrationCode("WRONG-CODE", "ABCD-EF23")).toBe(false);
    expect(matchesRegistrationCode("", "ABCD-EF23")).toBe(false);
    expect(matchesRegistrationCode("ABCD-EF23", null)).toBe(false);
    expect(matchesRegistrationCode("ABCD-EF23", "")).toBe(false);
  });
});