/** Class quizzes: a teacher's own short test for chosen sections, separate from the Director's exams. */
export const QUIZ_MAX_WARNINGS = 2;
/** Leaving fullscreen (or switching away) more than twice blocks the student until the teacher re-admits them. */
export const quizShouldBlock = (violations: number) => violations > QUIZ_MAX_WARNINGS;
export const QUIZ_MIN_MINUTES = 5;
export const QUIZ_MAX_MINUTES = 180;
export const QUIZ_MAX_QUESTIONS = 100;
export const QUIZ_ENTRY_SECONDS = 1200;
export const QUIZ_ENTRY_OPTIONS = [600, 1200, 1800, null] as const;
export const QUIZ_ENTRY_WARNING_SECONDS = 120;
/** Existing attempts and teacher-permitted latecomers are not subject to the entry cutoff. */
export function quizEntryState(openedAt: string, windowSec: number | null, time: number, permitted = false, started = false) {
  if (windowSec === null || permitted || started) return { locked: false, warning: false, secondsLeft: null };
  const secondsLeft = Math.max(0, Math.ceil((Date.parse(openedAt) + windowSec * 1000 - time) / 1000));
  return { locked: secondsLeft === 0, warning: secondsLeft > 0 && secondsLeft <= QUIZ_ENTRY_WARNING_SECONDS, secondsLeft };
}
/** "12A" style class label used to target a quiz. */
export const classLabel = (grade: string, section: string) => `${grade}${section}`.toUpperCase();
/** Only students of a chosen section (and the quiz's stream) can see or start the quiz. */
export const canTakeQuiz = (student: { grade: string; section: string; stream: string }, quiz: { stream: string; sections: string[] }) =>
  student.stream === quiz.stream && quiz.sections.includes(classLabel(student.grade, student.section));
export function quizScore(questions: { id: string; answer: number; marks: number }[], answers: Record<string, number>) {
  let score = 0, total = 0;
  for (const q of questions) { total += q.marks; if (answers[q.id] === q.answer) score += q.marks; }
  return { score, total };
}
