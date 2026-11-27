import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookCheck, Lock, Maximize, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Panel, Btn } from "@/components/Shell";
import { MathText, FigureImage } from "@/components/MathText";
import { enterFullscreen } from "@/lib/fullscreen";
import { QUIZ_MAX_WARNINGS } from "@/lib/quiz-rules";
import { studentQuizList, studentQuizReview } from "@/lib/quiz.functions";
import type { PublicStudent } from "@/lib/students.functions";

/** Student home: quizzes the student's own teachers opened for their section, and released quiz results. */
export function ClassQuizzes({ student, onStart }: { student: PublicStudent; onStart: (quizId: string) => void }) {
  const list = useServerFn(studentQuizList);
  const who = { name: student.name, id: student.id, token: student.sessionToken ?? "" };
  const { data = [] } = useQuery({ queryKey: ["quizzes", student.id], queryFn: () => list({ data: who }), refetchInterval: 5000 });
  const [time, setTime] = useState(0);
  useEffect(() => { setTime(Date.now()); const timer = setInterval(() => setTime(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const [review, setReview] = useState<string | null>(null);
  if (!data.length) return null;
  return (
    <div className="mb-4">
      <Panel title="Class quizzes" icon={<BookCheck className="h-4 w-4" />}>
        <ul className="space-y-2">
          {data.map((q) => {
            const left = q.entryDeadline === null ? null : Math.max(0, Math.ceil((q.entryDeadline - time) / 1000));
            const locked = q.entry.locked || (!q.status && q.entry.secondsLeft !== null && left === 0);
            return (
            <li key={q.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-[10rem] flex-1">
                <div className="break-words font-semibold">{q.title}</div>
                <div className="text-xs text-muted-foreground">{q.subject} · {q.count} questions · {q.minutes} minutes</div>
              </div>
              {q.status === "submitted" || q.status === "blocked" ? (
                q.released ? <div className="flex items-center gap-2"><span className="font-mono font-bold text-primary">{q.score}/{q.total}</span><Btn variant="ghost" className="py-1" onClick={() => setReview(q.id)}>See answers</Btn></div>
                  : q.status === "blocked" && q.live ? <span className="text-xs text-destructive">Blocked — ask your teacher to re-admit you</span>
                  : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" />Waiting for your teacher to release results</span>
              ) : q.live ? (
                locked ? <span role="status" className="text-xs text-destructive">Late entry locked — ask your teacher to permit entry</span> : <div className="flex flex-wrap items-center gap-2">
                {q.entry.secondsLeft !== null && left !== null && left > 0 && left <= 120 && <span role="status" className="text-xs text-warning">Start within {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} — entry closes soon</span>}
                <Btn onClick={async () => { await enterFullscreen(); onStart(q.id); }}><Maximize className="h-4 w-4" />{q.status === "in_progress" ? "Continue quiz" : "Start quiz"}</Btn></div>
              ) : <span className="text-xs text-muted-foreground">Closed</span>}
            </li>
          ); })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Quizzes open in fullscreen. Leaving it more than {QUIZ_MAX_WARNINGS} times blocks you until your teacher re-admits you. Quiz marks are separate from the official exam results.</p>
      </Panel>
      {review && <QuizReview student={student} quizId={review} onClose={() => setReview(null)} />}
    </div>
  );
}

function QuizReview({ student, quizId, onClose }: { student: PublicStudent; quizId: string; onClose: () => void }) {
  const fn = useServerFn(studentQuizReview);
  const [index, setIndex] = useState(0);
  const { data, error } = useQuery({ queryKey: ["quiz-review", quizId, student.id], queryFn: () => fn({ data: { name: student.name, id: student.id, token: student.sessionToken ?? "", quizId } }), retry: false });
  const current = data?.paper[index];
  const isCorrect = (id: string) => data?.answers[id] !== undefined && data?.answers[id] === data?.correct[id];
  const nextMistake = () => {
    if (!data) return;
    for (let step = 1; step <= data.paper.length; step++) { const i = (index + step) % data.paper.length; const q = data.paper[i]; if (q && !isCorrect(q.id)) { setIndex(i); return; } }
  };
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-background/95 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="break-words text-lg font-bold">{data?.title ?? "Quiz results"}</h2>
          <Btn variant="ghost" onClick={onClose}><X className="h-4 w-4" />Close</Btn>
        </div>
        {error && <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Could not load the results."}</p>}
        {!data && !error && <p className="text-muted-foreground">Loading…</p>}
        {data && <>
          <div className="glass p-5 text-center">
            <p className="text-4xl font-bold text-primary">{data.score} / {data.total}</p>
            <p className="text-sm text-muted-foreground">{data.total ? Math.round(data.score * 100 / data.total) : 0}% · {data.subject}{data.blocked ? " · blocked during the quiz" : ""}</p>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="Review questions">
            {data.paper.map((q, i) => <Btn key={q.id} variant="ghost" aria-label={`Question ${i + 1}: ${isCorrect(q.id) ? "correct" : data.answers[q.id] === undefined ? "not answered" : "wrong"}`} aria-current={i === index} onClick={() => setIndex(i)} className={`h-9 w-9 px-0 ${i === index ? "ring-2 ring-primary" : ""} ${isCorrect(q.id) ? "text-accent" : data.answers[q.id] === undefined ? "text-muted-foreground" : "text-destructive"}`}>{i + 1}</Btn>)}
          </div>
          {current && (() => {
            const q = current; const i = index;
            const mine = data.answers[q.id]; const right = data.correct[q.id]; const ok = mine !== undefined && mine === right;
            return (
              <div key={q.id} className={`glass p-4 ${ok ? "border-accent/50" : "border-destructive/50"}`}>
                <p className="mb-3 text-xs text-muted-foreground">Question {index + 1} of {data.paper.length} · {q.marks} marks</p>
                {q.passage && <div className="mb-3 border-b border-border pb-3"><MathText text={q.passage} /></div>}
                {q.figureUrl && <FigureImage src={q.figureUrl} />}
                <div className="flex items-start gap-2"><span className={`font-bold ${ok ? "text-accent" : "text-destructive"}`}>{i + 1}.</span><div className="min-w-0 flex-1"><MathText text={q.text} /></div><span className={`text-xs ${ok ? "text-accent" : "text-destructive"}`}>{ok ? "Correct" : mine === undefined ? "Not answered" : "Wrong"}</span></div>
                <ul className="mt-2 space-y-1 text-sm">
                  {q.choices.map((c, j) => (
                    <li key={c.value} className={`rounded-lg border px-3 py-1.5 ${c.value === right ? "border-accent/60 bg-accent/10" : c.value === mine ? "border-destructive/60 bg-destructive/10" : "border-border"}`}>
                      <span className="font-semibold">{"ABCD"[j]}.</span> <MathText text={c.label ?? ""} />{c.value === right ? " ✓" : c.value === mine ? " ✗ your answer" : ""}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Btn variant="ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft className="h-4 w-4" />Previous</Btn>
                  {data.paper.some((q) => !isCorrect(q.id)) && <Btn variant="ghost" onClick={nextMistake}>Next mistake</Btn>}
                  <Btn className="ml-auto" disabled={index === data.paper.length - 1} onClick={() => setIndex(index + 1)}>Next<ChevronRight className="h-4 w-4" /></Btn>
                </div>
              </div>
            );
          })()}
        </>}
      </div>
    </div>
  );
}
