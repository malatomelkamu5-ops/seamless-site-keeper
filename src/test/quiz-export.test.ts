import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { quizWorkbook, type ExportQuiz } from "../lib/quiz-export";

const test1: ExportQuiz = { id: "1", title: "Test 1", subject: "Mathematics", createdAt: "2026-11-28", marks: 20,
  attempts: [{ code: "BH-12A-01", name: "Student One", section: "12A", status: "submitted", score: 18, total: 20, submittedAt: "2026-11-28T06:30:00Z" }] };
const test2: ExportQuiz = { ...test1, id: "2", title: "Test 2", attempts: [{ ...test1.attempts[0] as NonNullable<typeof test1.attempts[number]>, score: 15 }] };

describe("selected class-test Excel export", () => {
  it("exports only the selected test", () => {
    const wb = quizWorkbook([test2]);
    const summary = wb.Sheets["Selected tests summary"];
    if (!summary) throw new Error("Missing summary");
    expect(XLSX.utils.sheet_to_json(summary, { header: 1 })).toEqual([
      ["Student ID", "Full name", "Section", "Test 2 (20)"], ["BH-12A-01", "Student One", "12A", 15],
    ]);
    expect(wb.SheetNames).toEqual(["Selected tests summary", "Test 1"]);
  });
  it("combines Test 1 and Test 2 side by side and produces a readable xlsx", () => {
    const bytes = XLSX.write(quizWorkbook([test1, test2]), { type: "array", bookType: "xlsx" });
    const wb = XLSX.read(bytes, { type: "array" });
    const summary = wb.Sheets["Selected tests summary"];
    if (!summary) throw new Error("Missing summary");
    expect(XLSX.utils.sheet_to_json(summary, { header: 1 })[1]).toEqual(["BH-12A-01", "Student One", "12A", 18, 15]);
  });
  it("does not report unfinished marks as final results", () => {
    const wb = quizWorkbook([{ ...test1, attempts: test1.attempts.map((a) => ({ ...a, status: "in_progress", score: null })) }]);
    const summary = wb.Sheets["Selected tests summary"];
    if (!summary) throw new Error("Missing summary");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(summary, { header: 1 });
    expect(rows[1]?.[3]).toBe("");
  });
});