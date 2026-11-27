import { describe, expect, it } from "vitest";
import { canTakeQuiz, quizScore, quizShouldBlock, quizEntryState, QUIZ_ENTRY_SECONDS } from "../lib/quiz-rules";

describe("class quizzes", () => {
  const quiz = { stream: "Natural Science", sections: ["12A"] };
  it("lets only the chosen section take the quiz", () => {
    expect(canTakeQuiz({ grade: "12", section: "A", stream: "Natural Science" }, quiz)).toBe(true);
    expect(canTakeQuiz({ grade: "12", section: "B", stream: "Natural Science" }, quiz)).toBe(false);
  });
  it("allows 2 fullscreen warnings and blocks on the 3rd exit", () => {
    expect(quizShouldBlock(2)).toBe(false);
    expect(quizShouldBlock(3)).toBe(true);
  });
  it("adds the marks of correct answers", () => {
    const qs = [{ id: "a", answer: 1, marks: 2 }, { id: "b", answer: 0, marks: 1 }];
    expect(quizScore(qs, { a: 1, b: 3 })).toEqual({ score: 2, total: 3 });
  });
  const opened = "2026-11-28T06:00:00Z";
  const start = Date.parse(opened);
  it("warns at 8 minutes with 2 minutes remaining", () => {
    expect(quizEntryState(opened, QUIZ_ENTRY_SECONDS, start + 479_000).warning).toBe(false);
    expect(quizEntryState(opened, QUIZ_ENTRY_SECONDS, start + 480_000)).toEqual({ locked: false, warning: true, secondsLeft: 120 });
  });
  it("locks new starts at exactly 10 minutes", () => {
    expect(quizEntryState(opened, QUIZ_ENTRY_SECONDS, start + 599_000).locked).toBe(false);
    expect(quizEntryState(opened, QUIZ_ENTRY_SECONDS, start + 600_000).locked).toBe(true);
  });
  it("allows a teacher-permitted late student", () => {
    expect(quizEntryState(opened, QUIZ_ENTRY_SECONDS, start + 900_000, true).locked).toBe(false);
  });
  it("never cuts off a student who already started", () => {
    expect(quizEntryState(opened, QUIZ_ENTRY_SECONDS, start + 900_000, false, true).locked).toBe(false);
  });
  it("preserves unrestricted entry for older tests", () => {
    expect(quizEntryState(opened, null, start + 900_000).locked).toBe(false);
  });
});
