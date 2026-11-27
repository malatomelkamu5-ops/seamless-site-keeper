import * as XLSX from "xlsx";

type Attempt = { code: string; name: string; section: string; status: string; score: number | null; total: number | null; submittedAt: string | null };
export type ExportQuiz = { id: string; title: string; subject: string; createdAt: string; marks: number; attempts: Attempt[] };

export function quizWorkbook(quizzes: ExportQuiz[]) {
  const workbook = XLSX.utils.book_new();
  const students = new Map<string, { code: string; name: string; section: string }>();
  for (const quiz of quizzes) for (const a of quiz.attempts) students.set(a.code, a);
  const summary = [...students.values()].sort((a, b) => a.name.localeCompare(b.name)).map((a) => [
    a.code, a.name, a.section,
    ...quizzes.map((q) => { const attempt = q.attempts.find((x) => x.code === a.code); return attempt?.status === "submitted" ? attempt.score ?? "" : ""; }),
  ]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Student ID", "Full name", "Section", ...quizzes.map((q) => `${q.title} (${q.marks})`)], ...summary,
  ]), "Selected tests summary");
  quizzes.forEach((q, i) => {
    const rows = q.attempts.map((a) => [a.code, a.name, a.section, a.status === "submitted" ? a.score ?? "" : "", q.marks,
      a.status === "submitted" && a.total ? Math.round((a.score ?? 0) * 100 / a.total) : "", a.status, a.submittedAt ?? ""]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      [q.title, q.subject, q.createdAt],
      ["Student ID", "Full name", "Section", "Score", "Total", "Percentage", "Status", "Completed at"], ...rows,
    ]), `Test ${i + 1}`);
  });
  return workbook;
}

export function downloadQuizExcel(quizzes: ExportQuiz[]) {
  if (!quizzes.length) return;
  const bytes = XLSX.write(quizWorkbook(quizzes), { type: "array", bookType: "xlsx" });
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "BHSSS-class-test-results.xlsx";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}