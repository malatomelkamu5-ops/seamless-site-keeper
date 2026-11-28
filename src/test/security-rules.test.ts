import { describe, expect, it } from "vitest";
import {
  generateRegistrationCode,
  generateStaffPasscode,
  matchesRegistrationCode,
  normalizeRegistrationCode,
  faceCheckQuotaError,
  FACE_CHECK_STUDENT_LIMIT,
  FACE_CHECK_SCHOOL_LIMIT,
  teacherBankRemovalError,
  signPinGuard,
  verifyPinGuard,
} from "@/lib/admin-rules";
import { isVerifiedTelegramLink, normalizeStudentCode, STUDENT_CODE_PATTERN } from "@/lib/telegram-bot";

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

describe("cryptographic staff reset passwords", () => {
  it("generates role-prefixed 8-character unpredictable passcodes", () => {
    const dirCode = generateStaffPasscode("director");
    const tchCode = generateStaffPasscode("teacher");
    expect(dirCode).toMatch(/^BH-DIR-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(tchCode).toMatch(/^BH-TCH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(generateStaffPasscode("teacher")).not.toBe(tchCode);
  });
});

describe("teacher bank removal ownership enforcement", () => {
  it("rejects removing another teacher's bank before any active exam slot is touched", () => {
    expect(teacherBankRemovalError("T-NAT-01", "T-NAT-02", true, false)).toBe("Could not remove the question bank.");
    expect(teacherBankRemovalError(null, "T-NAT-02", true, false)).toBe("Could not remove the question bank.");
  });

  it("blocks removing an owned bank while the exam is live, and allows removing an owned non-live bank", () => {
    expect(teacherBankRemovalError("T-NAT-01", "T-NAT-01", true, true)).toBe("This paper is live right now and cannot be removed.");
    expect(teacherBankRemovalError("T-NAT-01", "T-NAT-01", true, false)).toBeNull();
    expect(teacherBankRemovalError("T-NAT-01", "T-NAT-01", false, true)).toBeNull();
  });
});

describe("face verification abuse quota", () => {
  it("allows checks below per-student and school-wide limits", () => {
    expect(faceCheckQuotaError(0, 0)).toBeNull();
    expect(faceCheckQuotaError(FACE_CHECK_STUDENT_LIMIT - 1, FACE_CHECK_SCHOOL_LIMIT - 1)).toBeNull();
  });

  it("blocks checks once per-student or school-wide limit is reached", () => {
    expect(faceCheckQuotaError(FACE_CHECK_STUDENT_LIMIT, 3)).toMatch(/Too many face verification attempts/);
    expect(faceCheckQuotaError(0, FACE_CHECK_SCHOOL_LIMIT)).toMatch(/temporarily paused/);
  });
});

describe("caller-scoped sign-in throttle cookie", () => {
  it("round-trips a signed failure state and rejects tampered or foreign cookies", async () => {
    const state = { pin_failures: 3, pin_locked_until: "2026-11-28T04:00:00.000Z" };
    const cookie = await signPinGuard(state, "server-secret");
    expect(await verifyPinGuard(cookie, "server-secret")).toEqual(state);
    expect(await verifyPinGuard(cookie, "other-secret")).toEqual({ pin_failures: 0, pin_locked_until: null });
    expect(await verifyPinGuard(`${cookie}x`, "server-secret")).toEqual({ pin_failures: 0, pin_locked_until: null });
  });
});

describe("verified Telegram student link", () => {
  it("requires both a student code and passcode-confirmed identity before treating a chat as linked", () => {
    expect(isVerifiedTelegramLink({ student_code: "BH-12A-01", id_confirmed: false })).toBe(false);
    expect(isVerifiedTelegramLink({ student_code: null, id_confirmed: true })).toBe(false);
    expect(isVerifiedTelegramLink({ student_code: "BH-12A-01", id_confirmed: true })).toBe(true);
  });

  it("normalizes student IDs and rejects plain names", () => {
    expect(normalizeStudentCode(" bh-12a-01 ")).toBe("BH-12A-01");
    expect(STUDENT_CODE_PATTERN.test(normalizeStudentCode("bh-12a-01"))).toBe(true);
    expect(STUDENT_CODE_PATTERN.test(normalizeStudentCode("Abebe Bikila!"))).toBe(false);
  });
});