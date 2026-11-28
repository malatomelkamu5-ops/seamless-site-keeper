import { describe, expect, it } from "vitest";
import { rankRows } from "../lib/results";
import { backOnline, DISCONNECT_GRACE_SEC, HEARTBEAT_MS, SESSION_TOUCH_MS, shouldTouchSession, mergeAnswers, admittedToRoom, activeBankIds } from "../lib/exam-timing";

describe("exam room and both streams", () => {
  it("lets only selected students start when a room list is saved", () => {
    expect(admittedToRoom("BH-12A-01", ["BH-12A-01", "BH-12A-02"])).toBe(true);
    expect(admittedToRoom("BH-12A-03", ["BH-12A-01", "BH-12A-02"])).toBe(false);
    expect(admittedToRoom("BH-12A-03", null)).toBe(true);
  });
  it("keeps a Natural and a Social paper active at the same time", () => {
    expect(activeBankIds({ active_bank_id: "nat", social_bank_id: "soc" })).toEqual(["nat", "soc"]);
    expect(activeBankIds({ active_bank_id: null, social_bank_id: "soc" })).toEqual(["soc"]);
  });
});

describe("results matrix ranking", () => {
  it("ranks highest total first, shares ties and skips students without marks", () => {
    const ranked = rankRows([
      { id: "a", total: 480, hasMarks: true },
      { id: "b", total: 450, hasMarks: true },
      { id: "c", total: 450, hasMarks: true },
      { id: "d", total: 300, hasMarks: true },
      { id: "e", total: 0, hasMarks: false },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4, null]);
  });
});

describe("connection loss", () => {
  it("keeps heartbeats lightweight (15s) while still freezing silent devices within the grace window", () => {
    expect(HEARTBEAT_MS).toBeGreaterThanOrEqual(15_000);
    expect(DISCONNECT_GRACE_SEC).toBeGreaterThanOrEqual(30);
    expect(HEARTBEAT_MS * 2).toBeLessThan(DISCONNECT_GRACE_SEC * 1000);
  });
  it("shows a paused student as back online only after they report again", () => {
    const now = Date.parse("2026-11-04T10:05:00Z");
    expect(backOnline("2026-11-04T10:04:55Z", "2026-11-04T10:01:00Z", now)).toBe(true);
    expect(backOnline("2026-11-04T10:04:25Z", "2026-11-04T10:01:00Z", now)).toBe(true);
    expect(backOnline("2026-11-04T10:01:00Z", "2026-11-04T10:01:00Z", now)).toBe(false);
    expect(backOnline(null, "2026-11-04T10:01:00Z", now)).toBe(false);
  });
  it("throttles session timestamp writes and merges answers without wiping earlier work", () => {
    const now = Date.parse("2026-11-28T10:00:00Z");
    expect(shouldTouchSession("2026-11-28T09:59:30Z", now)).toBe(false);
    expect(shouldTouchSession(new Date(now - SESSION_TOUCH_MS).toISOString(), now)).toBe(true);
    expect(mergeAnswers({ q1: 0, q2: 1 }, { q2: 3, q3: 2 })).toEqual({ q1: 0, q2: 3, q3: 2 });
  });
});
