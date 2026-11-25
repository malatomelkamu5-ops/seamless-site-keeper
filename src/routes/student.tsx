import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Maximize, Flag, ChevronLeft, ChevronRight, AlertTriangle, Trophy, LogOut, ShieldCheck, UserPlus, LogIn, BadgeCheck, Copy, ClipboardList, BarChart3, WifiOff, KeyRound, LifeBuoy, Sparkles, Calculator, X, Smartphone, RefreshCw, Share } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Shell, Panel, Btn } from "@/components/Shell";
import { LiveCamera } from "@/components/LiveCamera";
import { MathText, PassageBox, FigureImage, GivenSheet } from "@/components/MathText";
import { canTakeStream } from "@/lib/admin-rules";
import { fmt } from "@/lib/identity";
import { HEARTBEAT_MS, HELP_COOLDOWN_SEC } from "@/lib/exam-timing";
import { enterFullscreen, exitFullscreen, inFullscreen, fullscreenSupported, FULLSCREEN_EVENTS } from "@/lib/fullscreen";
import { usePublicState } from "@/lib/live";
import { studentExam, studentSync, studentFlag, studentResults, studentHelp } from "@/lib/exam.functions";
import { studentQuizOpen, studentQuizSync } from "@/lib/quiz.functions";
import { QUIZ_MAX_WARNINGS } from "@/lib/quiz-rules";
import { MAX_VIOLATIONS } from "@/lib/identity";
import { ClassQuizzes } from "@/components/ClassQuizzes";
import { detectTelegram, detectWebExamBlocked, isInstalledApp, isIosDevice } from "@/lib/telegram-webview";
import { APP_DOWNLOAD_PATH } from "@/lib/telegram-bot";
import { registerStudent, loginStudent, checkRegistrationName, studentPing, studentSignOut, type PublicStudent } from "@/lib/students.functions";

export const Route = createFileRoute("/student")({
  head: () => ({
    meta: [
      { title: "Student Portal — Burka Harbu Exams" },
      { name: "description", content: "Register with live photo verification, sit secure Grade 12 mock exams and check your results." },
      { property: "og:title", content: "Student Portal — Burka Harbu Exams" },
      { property: "og:description", content: "Secure mock exams and private scorecards for Burka Harbu students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudentPage,
});

const SESSION = "bhss-student-session";

function StudentPage() {
  const [student, setStudent] = useState<PublicStudent | null>(null);
  const [mode, setMode] = useState<"home" | "exam" | "results">("home");
  const [quizId, setQuizId] = useState<string | null>(null);
  const [gate, setGate] = useState<"choose" | "login" | "register">("choose");
  const login = useServerFn(loginStudent);
  const ping = useServerFn(studentPing);
  const leave = useServerFn(studentSignOut);
  const [notice, setNotice] = useState("");
  // The passcode typed at sign-in stays only in memory so "My results" opens without asking again.
  const [resultPin, setResultPin] = useState("");
  const { data: pub } = usePublicState();
  const regClosed = !pub || !pub.registrationOpen;
  // Exams never run inside Telegram's mini-app viewer: its fullscreen and focus behaviour would block students by mistake.
  const [inTelegram, setInTelegram] = useState(false);
  const [webExamBlocked, setWebExamBlocked] = useState(false);
  const [iosGuide, setIosGuide] = useState(false);
  useEffect(() => {
    setInTelegram(detectTelegram());
    setWebExamBlocked(detectWebExamBlocked());
    const p = new URLSearchParams(window.location.search);
    if (p.get("install") === "ios" && !isInstalledApp()) setIosGuide(true);
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION);
    if (!raw) return;
    const { id, token } = JSON.parse(raw) as { id: string; token?: string };
    login({ data: { id, token } }).then((r) => { if (r.ok) signIn(r.student); else { sessionStorage.removeItem(SESSION); setNotice(r.error); } }).catch(() => {});
  }, []);

  const signIn = (s: PublicStudent, pin = "") => { sessionStorage.setItem(SESSION, JSON.stringify({ id: s.id, token: s.sessionToken })); setStudent(s); if (pin) setResultPin(pin); setNotice(""); };
  const signOut = (msg = "") => {
    if (student?.sessionToken) leave({ data: { id: student.id, token: student.sessionToken } }).catch(() => {});
    sessionStorage.removeItem(SESSION); setStudent(null); setResultPin(""); setMode("home"); setGate("choose"); setNotice(msg);
  };
  useEffect(() => {
    if (!student?.sessionToken) return;
    const token = student.sessionToken;
    const t = setInterval(() => {
      ping({ data: { id: student.id, token } }).then((r) => {
        if (!r.active) { sessionStorage.removeItem(SESSION); setStudent(null); setMode("home"); setGate("choose"); setNotice("You were signed out because this ID was signed in on another device."); }
      }).catch(() => {});
    }, 20000);
    return () => clearInterval(t);
  }, [student?.id, student?.sessionToken]);

  if (!student) return (
    <Shell title="Student Portal" subtitle="Register once with a live photo, then sign in with your student ID and passcode" help>
      {iosGuide && <IosInstallCard onClose={() => setIosGuide(false)} />}
      {notice && <p role="alert" className="mx-auto mb-4 max-w-xl rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-center text-sm text-destructive">{notice}</p>}
      {gate === "choose" && (
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-4">
          <button onClick={() => setGate("register")} className="tile tile-hover relative text-left"><span className="tile-icon">{regClosed ? <Lock className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}</span><div className="mt-4 text-lg font-semibold">Register</div><div className="text-sm text-muted-foreground">{regClosed ? "Closed by IT Admin" : "New student · live photo"}</div>{regClosed && <span className="absolute right-3 top-3 rounded-full border border-border bg-secondary/60 p-1.5"><Lock className="h-3.5 w-3.5 text-muted-foreground" /></span>}</button>
          <button onClick={() => setGate("login")} className="tile tile-hover text-left"><span className="tile-icon"><LogIn className="h-5 w-5" /></span><div className="mt-4 text-lg font-semibold">Sign in</div><div className="text-sm text-muted-foreground">Student ID + passcode</div></button>
        </div>
      )}
      {gate === "login" && <Login onLogin={signIn} onBack={() => setGate("choose")} />}
      {gate === "register" && (regClosed ? (
        <div className="tile mx-auto max-w-sm space-y-4 text-center">
          <img src="/school-logo.jpg" alt="Burka Harbu logo" className="mx-auto h-20 w-20 rounded-full ring-2 ring-primary/40 glow" />
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary/60"><Lock className="h-6 w-6 text-muted-foreground" /></span>
          <h2 className="text-xl font-semibold">Registration is closed</h2>
          <p className="text-sm text-muted-foreground">New registrations are locked right now. Please contact IT Admin if you need to register.</p>
          <Btn variant="ghost" className="w-full" onClick={() => setGate("choose")}>← Back</Btn>
        </div>
      ) : <Register onDone={signIn} onBack={() => setGate("choose")} />)}
    </Shell>
  );
  if (mode === "exam" && inTelegram) return <TelegramBlock onBack={() => { setMode("home"); setQuizId(null); }} />;
  if (mode === "exam" && webExamBlocked) return <AppRequiredBlock onBack={() => { setMode("home"); setQuizId(null); }} />;
  if (mode === "exam") return <Exam student={student} quizId={quizId} onExit={() => { setMode("home"); setQuizId(null); }} />;
  const first = student.name.split(" ")[0];
  return (
    <Shell title="Student Portal" subtitle="Burka Harbu Special Secondary School · Exam Portal" help>
      {iosGuide && <IosInstallCard onClose={() => setIosGuide(false)} />}
      <div className="tile mb-4 flex flex-wrap items-center gap-3 sm:mb-6 sm:gap-5">
        {student.photoUrl ? <img src={student.photoUrl} alt={student.name} className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-2 ring-primary/50 glow sm:h-24 sm:w-24" /> : <div className="tile-icon h-16 w-16 sm:h-24 sm:w-24" />}
        <div className="min-w-[10rem] flex-1">
          <h2 className="break-words text-2xl font-bold sm:text-3xl">Welcome, {first}!</h2>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">{student.verified && <BadgeCheck aria-label="Face verified" className="verified-badge h-4 w-4" />}{student.id} · Grade {student.grade}{student.section} · {student.stream}</div>
        </div>
        <Btn variant="ghost" onClick={() => signOut()}><LogOut className="h-4 w-4" />Sign out</Btn>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 sm:gap-4">
        <button onClick={() => setMode("home")} className={`tile tile-hover text-left ${mode === "home" ? "tile-active" : ""}`}><span className="tile-icon"><ClipboardList className="h-5 w-5" /></span><div className="mt-3 font-semibold">Exams</div><div className="text-sm text-muted-foreground">Scheduled tests</div></button>
        <button onClick={() => setMode("results")} className={`tile tile-hover text-left ${mode === "results" ? "tile-active" : ""}`}><span className="tile-icon"><BarChart3 className="h-5 w-5" /></span><div className="mt-3 font-semibold">My results</div><div className="text-sm text-muted-foreground">Official scorecard</div></button>
      </div>
      {mode === "home" ? <><ClassQuizzes student={student} onStart={(id) => { setQuizId(id); setMode("exam"); }} /><ExamLobby stream={student.stream} onStart={() => setMode("exam")} /></> : <Results student={student} initialPin={resultPin} />}
    </Shell>
  );
}

/** Shown instead of the exam inside Telegram: the exam has not started, so no time or warnings are used. */
function TelegramBlock({ onBack }: { onBack: () => void }) {
  return (
    <Shell title="Exam Security Notice" subtitle="Exams cannot be taken inside Telegram" help>
      <div className="tile mx-auto max-w-md space-y-4 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10"><ShieldCheck className="h-7 w-7 text-destructive" /></span>
        <h2 className="text-xl font-semibold">Use the BHSSS Exam app</h2>
        <p className="text-sm text-muted-foreground">Exams can't be taken inside the Telegram bot. Your exam has <b>not</b> started and no time is lost.</p>
        <ol className="space-y-1 rounded-xl border border-border bg-secondary/40 p-3 text-left text-sm">
          <li>1. Close this Telegram window (tap <b>✕</b>).</li>
          <li>2. Open the <b>BHSSS Exam app</b> on your phone. Don't have it? Download it below.</li>
          <li>3. Sign in with your ID and passcode, then start the exam.</li>
        </ol>
        <a href={APP_DOWNLOAD_PATH} download="BHSSS-Exam.apk" className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Smartphone className="h-4 w-4" />Download for Android</a>
        <div className="rounded-xl border border-border bg-secondary/40 p-3 text-left text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-foreground"><Share className="h-3.5 w-3.5 text-primary" />Using an iPhone (iOS)?</div>
          <p>Close this window, tap <b>📱 Exam App → Install on iPhone (iOS)</b> in the Telegram bot, then tap <b>Share (↑) → Add to Home Screen</b> in Safari.</p>
        </div>
        <Btn variant="ghost" className="w-full" onClick={onBack}>← Back</Btn>
      </div>
    </Shell>
  );
}

/** Shown instead of the exam on mobile web browsers: phone/tablet users must take exams inside the installed BHSSS Exam app (laptops remain allowed). */
function AppRequiredBlock({ onBack }: { onBack: () => void }) {
  const [ios, setIos] = useState(false);
  useEffect(() => { setIos(isIosDevice()); }, []);
  return (
    <Shell title="Exam App Required" subtitle="Phones must take exams inside the official BHSSS Exam app" help>
      <div className="tile mx-auto max-w-md space-y-4 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10"><ShieldCheck className="h-7 w-7 text-destructive" /></span>
        <h2 className="text-xl font-semibold">Open the BHSSS Exam app</h2>
        <p className="text-sm text-muted-foreground">Exams cannot be taken in a phone web browser. Your exam has <b>not</b> started and no time is lost.</p>
        {ios ? (
          <ol className="space-y-1.5 rounded-xl border border-border bg-secondary/40 p-3 text-left text-sm">
            <li className="flex items-center gap-1.5 font-semibold text-foreground"><Share className="h-4 w-4 text-primary" />Install on iPhone (iOS):</li>
            <li>1. Open this page in <b>Safari</b>.</li>
            <li>2. Tap the <b>Share</b> button (<span className="font-mono">↑</span>) at the bottom.</li>
            <li>3. Tap <b>Add to Home Screen</b>, then tap <b>Add</b>.</li>
            <li>4. Open the <b>BHSSS Exam</b> icon from your Home Screen and start your exam.</li>
          </ol>
        ) : (
          <>
            <ol className="space-y-1 rounded-xl border border-border bg-secondary/40 p-3 text-left text-sm">
              <li>1. Tap <b>Download BHSSS Exam App</b> below and install it.</li>
              <li>2. Open the <b>BHSSS Exam</b> icon on your phone.</li>
              <li>3. Sign in with your student ID and passcode, then start your exam.</li>
            </ol>
            <a href={APP_DOWNLOAD_PATH} download="BHSSS-Exam.apk" className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground glow transition hover:brightness-110">
              <Smartphone className="h-4 w-4" />Download BHSSS Exam App
            </a>
          </>
        )}
        <Btn variant="ghost" className="w-full" onClick={onBack}>← Back</Btn>
      </div>
    </Shell>
  );
}

/** Guided Safari Add-to-Home-Screen card shown when iPhone students open the bot's iOS install button. */
function IosInstallCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="tile mx-auto mb-5 max-w-xl space-y-3 border-primary/40 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="tile-icon shrink-0"><Share className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold">Install BHSSS Exam on your iPhone</h2>
            <p className="text-xs text-muted-foreground">Adds the full-screen school app icon directly to your Home Screen.</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Dismiss install guide" className="rounded-lg p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <ol className="space-y-1.5 rounded-xl border border-border bg-secondary/40 p-3 text-sm">
        <li>1. Make sure you are viewing this page in <b>Safari</b>.</li>
        <li>2. Tap the <b>Share</b> button (<span className="font-mono">↑</span>) at the bottom of Safari.</li>
        <li>3. Tap <b>Add to Home Screen</b>, then tap <b>Add</b>.</li>
        <li>4. Close Safari and open the new <b>BHSSS Exam</b> icon on your Home Screen.</li>
      </ol>
    </div>
  );
}

function Login({ onLogin, onBack }: { onLogin: (s: PublicStudent, pin: string) => void; onBack: () => void }) {
  const login = useServerFn(loginStudent);
  const [pin, setPin] = useState(""); const [id, setId] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <form className="tile mx-auto max-w-sm space-y-3 text-center" onSubmit={async (e) => {
      e.preventDefault(); setErr(""); setBusy(true);
      try { const r = await login({ data: { id, pin } }); r.ok ? onLogin(r.student, pin) : setErr(r.error); }
      catch { setErr("Could not sign in. Check your details."); } finally { setBusy(false); }
    }}>
      <img src="/school-logo.jpg" alt="Burka Harbu logo" className="mx-auto h-20 w-20 rounded-full ring-2 ring-primary/40 glow" />
      <h2 className="font-semibold">Student sign in</h2>
      <input className="field font-mono uppercase" placeholder="Student ID e.g. BH-12A-4821" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" required aria-label="Student ID" />
      <input className="field font-mono tracking-widest" type="password" inputMode="numeric" autoComplete="current-password" pattern="\d{4,6}" maxLength={6} placeholder="Your passcode" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required aria-label="Passcode" />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Btn className="w-full" disabled={busy}>{busy ? "Checking…" : "Sign in"}</Btn>
      <button type="button" onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
    </form>
  );
}

function Register({ onDone, onBack }: { onDone: (s: PublicStudent, pin?: string) => void; onBack: () => void }) {
  const register = useServerFn(registerStudent);
  const checkName = useServerFn(checkRegistrationName);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [f, setF] = useState({ fullName: "", resultPin: "" });
  const [pin2, setPin2] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<PublicStudent | null>(null);

  if (step === 3 && issued) return (
    <div className="tile glow mx-auto max-w-sm space-y-4 text-center">
      <BadgeCheck className="mx-auto h-10 w-10 text-accent" />
      <h2 className="text-xl font-bold">You are verified!</h2>
      {issued.photoUrl && <img src={issued.photoUrl} alt={issued.name} className="mx-auto h-28 w-28 rounded-2xl object-cover ring-2 ring-primary/50" />}
      <div className="text-sm text-muted-foreground">{issued.name}</div>
      <div className="rounded-xl border border-primary/50 bg-primary/10 p-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Your student ID</div>
        <div className="mt-1 font-mono text-3xl font-bold text-primary">{issued.id}</div>
      </div>
      <p className="text-xs text-warning">Write this ID down. You need your name and this ID to sign in.</p>
      <div className="flex gap-2">
        <Btn variant="ghost" className="flex-1" onClick={() => navigator.clipboard?.writeText(issued.id)}><Copy className="h-4 w-4" />Copy</Btn>
        <Btn className="flex-1" onClick={() => onDone(issued, f.resultPin)}>Continue</Btn>
      </div>
    </div>
  );

  return (
    <div className="tile mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className={step === 1 ? "text-primary" : ""}>1 · Details</span><span>—</span><span className={step === 2 ? "text-primary" : ""}>2 · Live photo</span><span>—</span><span>3 · Your ID</span></div>
      {step === 1 ? (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setErr("");
          if (!/^\d{4,6}$/.test(f.resultPin)) return setErr("Your result passcode must be 4 to 6 numbers.");
          if (f.resultPin !== pin2) return setErr("The two passcodes do not match.");
          setBusy(true);
          try { await checkName({ data: { name: f.fullName } }); setStep(2); }
          catch (e) { setErr(e instanceof Error ? e.message : "Could not check your name."); }
          finally { setBusy(false); }
        }}>
          <img src="/school-logo.jpg" alt="Burka Harbu logo" className="mx-auto h-20 w-20 rounded-full ring-2 ring-primary/40 glow" />
          <h2 className="text-lg font-semibold">Student registration</h2>
          <input className="field" placeholder="Full name as in the school list" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} maxLength={100} required />
          <label className="block text-xs text-muted-foreground">Result passcode (4–6 numbers)
            <input className="field mt-1 font-mono tracking-widest" type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,6}" maxLength={6} placeholder="e.g. 4821" value={f.resultPin} onChange={(e) => setF({ ...f, resultPin: e.target.value.replace(/\D/g, "") })} required aria-label="Result passcode" />
          </label>
          <input className="field font-mono tracking-widest" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="Type the passcode again" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} required aria-label="Confirm result passcode" />
          <p className="text-xs text-warning">Remember this passcode — you need it to open your results after they are published.</p>
          <p className="text-xs text-muted-foreground">Your class (Grade 12 A, B or C), stream and official ID come from the school list.</p>
          <p className="text-xs text-muted-foreground">For the live photo: remove masks, scarves over the face and sunglasses.</p>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <Btn className="w-full" disabled={busy}>{busy ? "Checking name…" : "Next: live photo"}</Btn>
          <button type="button" onClick={onBack} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">← Back</button>
        </form>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Live verification</h2>
          <LiveCamera onCapture={setPhoto} />
          {err && <p className="text-center text-xs text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => setStep(1)}>Back</Btn>
            <Btn className="flex-1" disabled={!photo || busy} onClick={async () => {
              if (!photo) return;
              setBusy(true); setErr("");
              try { const s = await register({ data: { ...f, photo } }); setIssued(s); setStep(3); }
              catch (e) { setErr(e instanceof Error ? e.message : "Registration failed."); } finally { setBusy(false); }
            }}>{busy ? "Verifying…" : "Verify & get my ID"}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}


function ExamLobby({ onStart, stream }: { onStart: () => void; stream: string }) {
  const { data: st } = usePublicState();
  const bank = st?.banks.find((b) => canTakeStream(stream, b.stream)) ?? null;
  // Students already inside the exam can continue after a reload even when the start window has passed; the server decides.
  const ok = !!st?.examLive && !!bank;
  return (
    <Panel title={`Scheduled exam · Round ${st?.round ?? "—"}`} icon={<ShieldCheck className="h-4 w-4" />}>
      {!bank ? <p className="text-sm text-muted-foreground">No exam scheduled.</p> : (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="text-2xl font-bold">{bank.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{bank.subject} · {bank.count} questions · {bank.marks} marks · {st?.durationMin} minutes</div>
            {st?.scheduledStart && <div className="mt-2 text-sm text-muted-foreground">{new Date(st.scheduledStart).toLocaleString()} – {new Date(st.scheduledClose ?? st.scheduledStart).toLocaleString()}</div>}
            <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              <li>• The exam opens in fullscreen. Leaving it, switching apps, split screen or floating apps are reported and hide the questions.</li>
              <li>• Your name and ID are printed across the paper, so screenshots and photos show who took them.</li>
              <li>• More than 3 violations auto-submits your exam and blocks you.</li>
              <li>• Your question and answer order is unique to you.</li>
              <li>• The exam submits automatically when time is up.</li>
            </ul>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border p-6">
            {!st?.examLive ? <p className="flex items-center gap-2 text-sm text-destructive"><Lock className="h-4 w-4" />The exam session is closed</p>
              : !st.clockRunning ? <p className="text-center text-sm text-warning">New starts are outside the scheduled window. If you already started, you can continue.</p>
              : <p className="text-sm text-accent">The exam is open.</p>}
            <Btn disabled={!ok} onClick={async () => { await enterFullscreen(); onStart(); }}><Maximize className="h-4 w-4" />Enter fullscreen & begin</Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}

type Paper = Awaited<ReturnType<typeof studentExam>>;
type ExamAppBridge = { lock: () => void; unlock: () => void };
const examApp = () => (typeof window === "undefined" ? undefined : (window as unknown as { BHExamApp?: ExamAppBridge }).BHExamApp);

function Exam({ student, onExit, quizId = null }: { student: PublicStudent; onExit: () => void; quizId?: string | null }) {
  const loadExam = useServerFn(studentExam);
  const syncExam = useServerFn(studentSync);
  const loadQuiz = useServerFn(studentQuizOpen);
  const syncQuiz = useServerFn(studentQuizSync);
  // A teacher's class quiz uses the same strict exam screen, but with its own questions and a 2-warning limit.
  const isQuiz = !!quizId;
  const maxWarn = isQuiz ? QUIZ_MAX_WARNINGS : MAX_VIOLATIONS;
  const load = (a: { data: { name: string; id: string; token: string } }): Promise<Paper> => quizId ? loadQuiz({ data: { ...a.data, quizId } }) : loadExam(a);
  type SyncIn = { name: string; id: string; token: string; answers: Record<string, number>; current?: number; violation?: "fullscreen" | "focus"; submit?: boolean; connectionLost?: boolean };
  type SyncOut = { pauseReason: string | null; paused: boolean; status: string; violations: number; secondsLeft: number; timeUp: boolean; review?: { score: number; total: number; correct: Record<string, number> } };
  const sync = (a: { data: SyncIn }): Promise<SyncOut> => quizId ? syncQuiz({ data: { ...a.data, quizId } }) : syncExam(a);
  const flagFn = useServerFn(studentFlag);
  const helpFn = useServerFn(studentHelp);
  const [help, setHelp] = useState<"idle" | "sending" | "sent">("idle");
  const who = { name: student.name, id: student.id, token: student.sessionToken ?? "" };
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const offlineRef = useRef(false);
  const goOffline = () => { offlineRef.current = true; setOffline(true); };
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const [paper, setPaper] = useState<Paper | null>(null);
  const [err, setErr] = useState("");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [violations, setViolations] = useState(0);
  const [left, setLeft] = useState(0);
  const [isFs, setIsFs] = useState(true);
  const [fsOk, setFsOk] = useState(true);
  const [flagFor, setFlagFor] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [askSubmit, setAskSubmit] = useState(false);
  const [showGiven, setShowGiven] = useState(false);
  // True while the exam page is not the screen in front (app switch, floating AI bubble, notification shade, split screen).
  const [away, setAway] = useState(false);
  const [ended, setEnded] = useState<null | "submitted" | "blocked" | "timeup">(null);
  const [review, setReview] = useState<{ score: number; total: number; correct: Record<string, number> } | null>(null);
  const answersRef = useRef(answers); answersRef.current = answers;
  const endedRef = useRef(ended); endedRef.current = ended;
  const idxRef = useRef(idx); idxRef.current = idx;
  const backupKey = useRef("");
  // Keep a copy on this device so a power cut or lost internet never loses answers or the current question.
  useEffect(() => {
    if (!backupKey.current || ended) return;
    try { localStorage.setItem(backupKey.current, JSON.stringify({ answers, idx })); } catch { /* storage full or blocked */ }
  }, [answers, idx, ended]);
  useEffect(() => { if (ended && backupKey.current) try { localStorage.removeItem(backupKey.current); } catch { /* ignore */ } }, [ended]);
  // In the school's Android app, pin the screen for the whole exam (no home, recent apps, split screen or floating apps).
  useEffect(() => { const app = examApp(); if (!app) return; if (ended) app.unlock(); else app.lock(); return () => app.unlock(); }, [ended]);

  const push = async (extra: { violation?: "fullscreen" | "focus"; submit?: boolean } = {}) => {
    if (endedRef.current || !backupKey.current) return; // nothing to save until the exam has loaded
    if (typeof navigator !== "undefined" && !navigator.onLine) { goOffline(); return; }
    try {
      // After any loss of contact the server freezes the timer at the last moment it heard from this device.
      const wasOffline = offlineRef.current;
      const r = await sync({ data: { ...who, answers: answersRef.current, current: idxRef.current, ...(wasOffline ? { connectionLost: true } : extra) } });
      setErr(""); offlineRef.current = false; setOffline(false);
      setViolations(r.violations); setLeft(r.secondsLeft); setPaused(r.paused); setPauseReason(r.pauseReason);
      if ("review" in r && r.review) setReview(r.review);
      if (r.status !== "in_progress") {
        endedRef.current = r.status === "blocked" ? "blocked" : r.timeUp ? "timeup" : "submitted";
        setEnded(endedRef.current);
        exitFullscreen(); // the exam is over, so leaving fullscreen is no longer a violation
      }
    } catch (e) {
      const net = !navigator.onLine || !(e instanceof Error) || /fetch|network|load failed|failed to|timeout|aborted/i.test(e.message);
      if (net) goOffline();
      setErr(net ? "" : e instanceof Error ? e.message : "Could not save.");
    }
  };
  // Detect power/internet loss the instant the browser reports it, not after the next save.
  useEffect(() => {
    const down = () => goOffline();
    const up = () => { push(); };
    window.addEventListener("offline", down); window.addEventListener("online", up);
    return () => { window.removeEventListener("offline", down); window.removeEventListener("online", up); };
  }, []);

  const openExam = () => load({ data: who }).then((p) => {
      setErr("");
      backupKey.current = `bh-exam-backup-${p.attemptId}`;
      let saved: { answers?: Record<string, number>; idx?: number } = {};
      try { saved = JSON.parse(localStorage.getItem(backupKey.current) ?? "{}"); } catch { /* ignore */ }
      const startAt = Math.min(Math.max(0, saved.idx ?? p.currentQuestion ?? 0), Math.max(0, p.paper.length - 1));
      // Fetch every picture now so they still show if the internet drops later in the exam.
      p.paper.forEach((q) => { if (q.figureUrl) { const img = new Image(); img.src = q.figureUrl; } });
      setPaper(p); setAnswers({ ...p.answers, ...(saved.answers ?? {}) }); setIdx(startAt); setViolations(p.violations); setLeft(p.secondsLeft); setPaused(p.paused); setPauseReason(p.pauseReason);
      const end = p.attemptStatus === "blocked" ? "blocked" : p.attemptStatus === "submitted" ? "submitted" : null;
      endedRef.current = end; setEnded(end);
      return p;
    });
  useEffect(() => { openExam().catch((e) => setErr(e instanceof Error ? e.message : "Could not load the exam.")); }, []);
  // A blocked student waits here; when the Director re-admits them the exam opens again by itself.
  useEffect(() => {
    if (ended !== "blocked") return;
    const t = setInterval(() => { openExam().catch(() => { /* keep waiting */ }); }, 4000);
    return () => clearInterval(t);
  }, [ended]);
  useEffect(() => { const t = setInterval(() => { if (!pausedRef.current && !offlineRef.current) setLeft((l) => Math.max(0, l - 1)); }, 1000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => push(), HEARTBEAT_MS); return () => clearInterval(t); }, []);
  useEffect(() => { if (paper && left === 0 && !ended && !offline) push(); }, [left, paper]);
  useEffect(() => {
    let last = 0;
    const hit = (kind: "fullscreen" | "focus") => { if (endedRef.current || pausedRef.current || offlineRef.current || Date.now() - last < 1500) return; last = Date.now(); push({ violation: kind }); };
    const blur = () => { if (!endedRef.current) setAway(true); hit("focus"); };
    const focus = () => { if (!document.hidden) setAway(false); };
    const vis = () => { if (document.hidden) { if (!endedRef.current) setAway(true); hit("focus"); } else if (document.hasFocus()) setAway(false); };
    // Split screen / floating window: the page suddenly becomes much smaller without the keyboard being open.
    const base = { w: window.innerWidth, h: window.innerHeight };
    const typing = () => { const a = document.activeElement; return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"); };
    const resize = () => {
      if (typing()) return;
      if (window.innerWidth > base.w) base.w = window.innerWidth;
      if (window.innerHeight > base.h) base.h = window.innerHeight;
      if (window.innerWidth < base.w * 0.75 || window.innerHeight < base.h * 0.7) hit("focus");
    };
    const supported = fullscreenSupported();
    setFsOk(supported); setIsFs(!supported || inFullscreen());
    const fs = () => { const on = inFullscreen(); setIsFs(on); if (!on) hit("fullscreen"); };
    // Any tap while the exam runs puts the screen straight back into fullscreen (browsers only allow this from a tap).
    const back = () => { if (supported && !endedRef.current && !inFullscreen()) enterFullscreen(); };
    window.addEventListener("blur", blur); window.addEventListener("focus", focus); window.addEventListener("resize", resize); document.addEventListener("visibilitychange", vis);
    FULLSCREEN_EVENTS.forEach((n) => document.addEventListener(n, fs));
    document.addEventListener("pointerdown", back, true);
    // Block copy / select-all / print / save shortcuts while the exam runs.
    const keys = (e: KeyboardEvent) => { if (!endedRef.current && (e.ctrlKey || e.metaKey) && ["c", "x", "a", "p", "s", "u"].includes(e.key.toLowerCase())) e.preventDefault(); };
    document.addEventListener("keydown", keys, true);
    return () => {
      document.removeEventListener("keydown", keys, true);
      window.removeEventListener("blur", blur); window.removeEventListener("focus", focus); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", vis);
      FULLSCREEN_EVENTS.forEach((n) => document.removeEventListener(n, fs));
      document.removeEventListener("pointerdown", back, true);
    };
  }, []);
  const sendFlag = async () => {
    const id = flagFor; if (!id) return;
    setFlagFor(null);
    try { await flagFn({ data: { ...who, questionId: id, note: flagNote.trim() || undefined } }); setFlagged((f) => new Set(f).add(id)); } catch { setErr("Could not send the flag."); }
    setFlagNote("");
  };
  // One tap tells the Director who needs help (name, ID, class, subject, question). No pop-up, so fullscreen stays on.
  const askHelp = async () => {
    if (help !== "idle") return;
    setHelp("sending");
    try { await helpFn({ data: { ...who, question: idxRef.current + 1 } }); setHelp("sent"); setTimeout(() => setHelp("idle"), HELP_COOLDOWN_SEC * 1000); }
    catch (e) { setHelp("idle"); setErr(e instanceof Error ? e.message : "Could not send your help request. Raise your hand."); }
  };

  // Practice: the score and every right answer show straight after submitting, and the student can try again.
  if (ended && review && paper) return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="glass p-6 text-center">
        <span className="rounded-full border border-warning/50 px-3 py-1 text-xs text-warning">Practice — not an official result</span>
        <h1 className="mt-3 text-2xl font-bold">{ended === "timeup" ? "Time is up!" : "Practice finished"}</h1>
        <p className="mt-2 text-4xl font-bold text-primary">{review.score} / {review.total}</p>
        <p className="text-sm text-muted-foreground">{review.total ? Math.round(review.score * 100 / review.total) : 0}%</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Btn variant="accent" onClick={() => { setReview(null); setAnswers({}); setIdx(0); setEnded(null); endedRef.current = null; openExam().catch((e) => setErr(e instanceof Error ? e.message : "Could not start again.")); }}>Practice again</Btn>
          <Btn variant="ghost" onClick={onExit}>Back to portal</Btn>
        </div>
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      </div>
      <PracticeReview questions={paper.paper} answers={answers} correct={review.correct} />
    </div>
  );
  if (ended) return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass max-w-md p-8 text-center">
        {ended === "blocked" ? <AlertTriangle className="mx-auto h-12 w-12 text-destructive" /> : <ShieldCheck className="mx-auto h-12 w-12 text-accent" />}
        <h1 className="mt-4 text-2xl font-bold">{ended === "blocked" ? `You have been removed from the ${isQuiz ? "quiz" : "exam"}` : ended === "timeup" ? "Time is up!" : isQuiz ? "Quiz submitted" : "Exam submitted"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{isQuiz
          ? ended === "blocked" ? `You left the quiz screen more than ${maxWarn} times. Your answers were saved. Only your teacher can re-admit you — keep this page open and the quiz opens again here as soon as you are re-admitted.` : "Your answers are sealed. Your score and the right answers appear under “Class quizzes” once your teacher releases the results."
          : ended === "blocked" ? "You left the exam screen more than 3 times. Your answers were saved. Only the Director can re-admit you — keep this page open and your exam opens again here as soon as you are re-admitted." : "Your answers are sealed. Scores appear in “My results” once the Director publishes them."}</p>
        <Btn className="mt-6" onClick={onExit}>Back to portal</Btn>
      </div>
    </div>
  );
  if (!paper) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">{err ? <><p className="text-destructive">{err}</p><Btn onClick={onExit}>Back</Btn></> : <p className="text-muted-foreground">Loading exam…</p>}</div>;
  if (!paper.paper.length) return <div className="flex min-h-screen flex-col items-center justify-center gap-4"><p>This exam has no questions.</p><Btn onClick={onExit}>Back</Btn></div>;

  const cur = paper.paper[idx];
  if (!cur) return null;
  const answeredCount = Object.keys(answers).length;
  // Questions of one passage sit next to each other, so the passage can say which questions it is for.
  let pFrom = idx, pTo = idx;
  if (cur.passage) {
    while (pFrom > 0 && paper.paper[pFrom - 1]?.passage === cur.passage) pFrom--;
    while (pTo < paper.paper.length - 1 && paper.paper[pTo + 1]?.passage === cur.passage) pTo++;
  }
  const passageLabel = pFrom === pTo ? `Read the passage for question ${idx + 1}` : `Read the passage for questions ${pFrom + 1}–${pTo + 1}`;
  return (
    // The exam covers the whole screen on every device, including phones whose browser has no fullscreen mode.
    // Questions and choices cannot be selected, copied, cut, dragged or long-pressed during the exam.
    <div className="fixed inset-0 z-50 select-none overflow-y-auto overscroll-contain bg-background [-webkit-touch-callout:none]"
      onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}>
      {/* The student's name and ID are stamped across the paper, so any photo or screenshot shows who took it. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[35] overflow-hidden">
        <div className="absolute -inset-1/2 flex -rotate-[28deg] flex-wrap content-start gap-x-16 gap-y-20 p-8">
          {Array.from({ length: 120 }, (_, i) => <span key={i} className="whitespace-nowrap font-mono text-sm font-semibold text-foreground/[0.07]">{student.id} · {student.name} · {new Date().toLocaleDateString()}</span>)}
        </div>
      </div>
      {/* The moment the exam is not the front screen, the questions are hidden, so a floating AI app or screenshot sees nothing. */}
      {away && !ended && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="away-title" className="fixed inset-0 z-[70] flex items-center justify-center bg-background p-6 text-center" onPointerDown={() => setAway(false)}>
          <div className="max-w-sm">
            <Lock className="mx-auto h-12 w-12 text-destructive" />
            <h2 id="away-title" className="mt-3 text-xl font-bold">Exam hidden — you left the exam screen</h2>
            <p className="mt-2 text-sm text-muted-foreground">Leaving the exam, opening another app or a floating window is reported to the Director. Tap here to come back. Your answers and time are safe.</p>
          </div>
        </div>
      )}
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4 sm:py-3">
          <img src="/school-logo.jpg" alt="" className="h-9 w-9 rounded-full" />
          <div className="text-sm"><div className="font-semibold">{paper.title}</div><div className="text-xs text-muted-foreground">{student.id} · {answeredCount}/{paper.paper.length} answered</div></div>
          <span className={`rounded-full border border-border px-2.5 py-1 font-mono text-sm font-bold lg:hidden ${left < 300 ? "text-destructive" : "text-primary"}`} aria-label="Time left">{fmt(left)}</span>
          <span className={`ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${violations ? "border-destructive/50 text-destructive" : "border-accent/40 text-accent"}`}><AlertTriangle className="h-3.5 w-3.5" />{violations}/{maxWarn} warnings</span>
          {paper.practice && <span className="rounded-full border border-warning/50 px-2.5 py-1 text-xs text-warning">Practice</span>}
          {paper.given && <Btn variant="ghost" className="px-3" onClick={() => setShowGiven(true)} title="Values, formulas and tables you may use" aria-label="Open the Given sheet"><Calculator className="h-4 w-4 text-primary" /><span>Given</span></Btn>}
          {!isQuiz && <Btn variant="ghost" className="px-3" disabled={help !== "idle"} onClick={askHelp} title="Ask the Director for help" aria-label="Ask the Director for help"><LifeBuoy className={`h-4 w-4 ${help === "sent" ? "text-accent" : "text-warning"}`} /><span>{help === "sent" ? "Help sent" : help === "sending" ? "Sending…" : "Help"}</span></Btn>}
          <Btn variant="accent" onClick={() => setAskSubmit(true)}>Submit</Btn>
        </div>
        {help === "sent" && <p role="status" className="border-t border-border bg-accent/10 px-3 py-1.5 text-center text-xs text-accent">The Director has your name and ID and is coming to help. Stay in your seat — your time keeps running.</p>}
      </div>
      {paused && (
        <div role="dialog" aria-modal="true" aria-labelledby="paused-title" className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="glass max-w-sm p-8 text-center">
            <Lock className="mx-auto h-10 w-10 text-warning" />
            <h2 id="paused-title" className="mt-3 text-xl font-bold">{pauseReason === "connection" ? "Your connection was lost" : "Your timer is paused"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{pauseReason === "connection"
              ? `Your exam was not submitted. Your answers, your place (question ${idx + 1}) and your remaining time (${fmt(left)}) are saved. The Director can see you are back — wait here until the Director lets you continue.`
              : `The Director paused your exam. Your answers and remaining time (${fmt(left)}) are saved. Wait here — it continues when the Director resumes it.`}</p>
          </div>
        </div>
      )}
      {offline && !paused && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="offline-title" className="fixed inset-0 z-40 flex items-center justify-center bg-background/95 p-4 backdrop-blur-md">
          <div className="glass max-w-sm space-y-3 p-6 text-center sm:p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-warning/40 bg-warning/10">
              <WifiOff className="h-8 w-8 text-warning" />
            </div>
            <h2 id="offline-title" className="text-xl font-bold">No internet connection</h2>
            <p className="text-sm text-muted-foreground">Your timer is stopped and your exam is safe. Your answers, question {idx + 1}, and time ({fmt(left)}) are saved on this device.</p>
            <p className="animate-pulse text-xs text-warning">Waiting for Wi-Fi or mobile data…</p>
            <Btn className="w-full" onClick={() => push()}><RefreshCw className="h-4 w-4" />Try reconnecting</Btn>
          </div>
        </div>
      )}
      {fsOk && !isFs && !paused && !offline && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="fs-title" className="fixed inset-0 z-40 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
          <div className="glass max-w-sm p-6 text-center sm:p-8">
            <Maximize className="mx-auto h-10 w-10 text-destructive" />
            <h2 id="fs-title" className="mt-3 text-xl font-bold">Fullscreen exited</h2>
            <p className="mt-2 text-sm text-muted-foreground">The exam must stay in fullscreen until it ends. Leaving it is reported to the Director. Your answers and time are safe.</p>
            <Btn className="mt-5 w-full" onClick={() => enterFullscreen()}><Maximize className="h-4 w-4" />Return to fullscreen</Btn>
          </div>
        </div>
      )}
      {showGiven && paper.given && (
        <div role="dialog" aria-modal="true" aria-labelledby="given-title" className="fixed inset-0 z-40 flex flex-col bg-background/95 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 pb-3">
            <h2 id="given-title" className="flex items-center gap-2 text-lg font-bold"><Calculator className="h-5 w-5 text-primary" />Given — you may use this</h2>
            <button type="button" onClick={() => setShowGiven(false)} className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm hover:border-primary"><X className="h-4 w-4" />Back to question</button>
          </div>
          <div className="glass mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4 sm:p-6"><GivenSheet text={paper.given} /></div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">Your time keeps running. Open this again any time with the “Given” button.</p>
        </div>
      )}
      {flagFor && (
        <div role="dialog" aria-modal="true" aria-labelledby="flag-title" className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-sm p-6">
            <h2 id="flag-title" className="flex items-center gap-2 text-lg font-bold"><Flag className="h-5 w-5 text-warning" />Report this question</h2>
            <label className="mt-3 block text-sm text-muted-foreground" htmlFor="flag-note">What is wrong with it? (optional)</label>
            <textarea id="flag-note" className="field mt-2 min-h-24 select-text" maxLength={300} value={flagNote} onChange={(e) => setFlagNote(e.target.value)} />
            <div className="mt-4 flex gap-2"><Btn variant="ghost" className="flex-1" onClick={() => { setFlagFor(null); setFlagNote(""); }}>Cancel</Btn><Btn className="flex-1" onClick={sendFlag}>Send report</Btn></div>
          </div>
        </div>
      )}
      {askSubmit && (
        <div role="dialog" aria-modal="true" aria-labelledby="submit-title" className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-sm p-6 text-center">
            <h2 id="submit-title" className="text-lg font-bold">Submit your exam now?</h2>
            <p className="mt-2 text-sm text-muted-foreground">{paper.paper.length - answeredCount} question(s) unanswered. You cannot change answers after submitting.</p>
            <div className="mt-5 flex gap-2"><Btn variant="ghost" className="flex-1" onClick={() => setAskSubmit(false)}>Keep working</Btn><Btn variant="accent" className="flex-1" onClick={() => { setAskSubmit(false); push({ submit: true }); }}>Submit</Btn></div>
          </div>
        </div>
      )}
      <div className="mx-auto grid max-w-6xl gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:grid-cols-[1fr_260px]">
        <div className="glass p-4 sm:p-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Question {idx + 1} of {paper.paper.length}</span><span>{cur.marks} mark{cur.marks > 1 ? "s" : ""}</span></div>
          {cur.passage && <PassageBox key={`p-${cur.id}`} text={cur.passage} label={passageLabel} className="mt-3" />}
          <h2 className="mt-3 break-words text-lg font-semibold leading-relaxed sm:text-xl"><MathText text={cur.text} /></h2>
          {cur.figureUrl && <FigureImage src={cur.figureUrl} className="mt-3" />}
          <div className="mt-6 space-y-3">
            {cur.choices.map((c, k) => {
              const sel = answers[cur.id] === c.value;
              return (
                <button key={c.value} onClick={() => setAnswers({ ...answers, [cur.id]: c.value })} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition sm:p-4 ${sel ? "border-primary bg-primary/10 glow" : "border-border hover:border-primary/50"}`}>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg font-mono text-sm ${sel ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{"ABCD"[k]}</span>
                  <span className="min-w-0 flex-1"><MathText text={c.label ?? ""} /></span>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Btn variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft className="h-4 w-4" />Prev</Btn>
            {!isQuiz && <Btn variant="ghost" disabled={flagged.has(cur.id)} onClick={() => setFlagFor(cur.id)}><Flag className={`h-4 w-4 ${flagged.has(cur.id) ? "text-warning" : ""}`} />{flagged.has(cur.id) ? "Reported" : "Report question"}</Btn>}
            <Btn className="ml-auto" disabled={idx === paper.paper.length - 1} onClick={() => setIdx(idx + 1)}>Next<ChevronRight className="h-4 w-4" /></Btn>
          </div>
        </div>
        <div className="glass h-fit p-4">
          <div className="mb-1 text-xs text-muted-foreground">Time left</div>
          <div className={`mb-4 font-mono text-3xl font-bold ${left < 300 ? "animate-pulse text-destructive" : "text-primary"}`}>{fmt(left)}</div>
          <div className="mb-3 text-sm font-semibold">Navigator</div>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
            {paper.paper.map((p, i) => {
              const a = answers[p.id] !== undefined, f = flagged.has(p.id);
              return <button key={p.id} onClick={() => setIdx(i)} className={`relative h-10 rounded-lg border font-mono text-sm ${i === idx ? "ring-2 ring-primary" : ""} ${a ? "border-accent bg-accent/20 text-accent" : "border-border bg-muted/50"}`}>{i + 1}{f && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-warning" />}</button>;
            })}
          </div>
          {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
        </div>
      </div>
    </div>
  );
}

function Results({ student, initialPin = "" }: { student: PublicStudent; initialPin?: string }) {
  const fn = useServerFn(studentResults);
  const [round, setRound] = useState<number | undefined>();
  const [pin, setPin] = useState(initialPin); const [typed, setTyped] = useState(""); const [typed2, setTyped2] = useState("");
  const { data, error } = useQuery({ queryKey: ["results", student.id, round, pin], queryFn: () => fn({ data: { name: student.name, id: student.id, token: student.sessionToken ?? "", round, pin: pin || undefined } }), refetchInterval: 4000, retry: false });
  // When the Director adds marks for a flagged question, the scorecard refreshes by itself and says so.
  const lastScores = useRef<{ round: number; scores: Record<string, number> } | null>(null);
  const [raised, setRaised] = useState<string[]>([]);
  useEffect(() => {
    if (!data?.published || data.locked) return;
    const now = data.scores as Record<string, number>;
    const prev = lastScores.current;
    if (prev && prev.round === data.round) {
      const up = Object.keys(now).filter((k) => prev.scores[k] !== undefined && (now[k] ?? 0) > (prev.scores[k] ?? 0));
      if (up.length) { setRaised(up); setTimeout(() => setRaised([]), 15000); }
    }
    lastScores.current = { round: data.round, scores: now };
  }, [data]);
  if (error && pin) return <PinForm mode="enter" err={error instanceof Error ? error.message : "Wrong result passcode."} typed={typed} setTyped={setTyped} typed2={typed2} setTyped2={setTyped2} onSubmit={(p) => setPin(p)} />;
  if (!data) return <p className="text-muted-foreground">{error ? (error instanceof Error ? error.message : "Could not load results.") : "Loading…"}</p>;
  if (data.published && data.locked) return <PinForm mode={data.locked} err="" typed={typed} setTyped={setTyped} typed2={typed2} setTyped2={setTyped2} onSubmit={(p) => setPin(p)} />;
  if (!data.published) return (
    <Panel title="Results locked" icon={<Lock className="h-4 w-4" />}>
      <div className="py-10 text-center"><Lock className="mx-auto h-12 w-12 text-muted-foreground" /><p className="mt-3 text-muted-foreground">Results have not been officially announced yet. Please check back later.</p></div>
    </Panel>
  );
  const subs = data.subjects;
  const mine = data.scores as Record<string, number>;
  const taken = subs.filter((x) => mine[x] !== undefined);
  const total = taken.reduce((a, x) => a + (mine[x] ?? 0), 0);
  const max = taken.length * 100;
  return (
    <div className="tile glow">
      {!!raised.length && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent"><Sparkles className="h-4 w-4 shrink-0" />Your marks were updated by the Director: {raised.join(", ")}.</p>}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Exam round</span>
        {(data.rounds.length ? data.rounds : [data.round]).map((r) => <Btn key={r} variant={r === data.round ? "primary" : "ghost"} className="py-1" onClick={() => setRound(r)}>Round {r}</Btn>)}
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:gap-5">
        {student.photoUrl && <img src={student.photoUrl} alt={student.name} className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-2 ring-primary/50 sm:h-24 sm:w-24" />}
        <div className="min-w-[10rem] flex-1">
          <div className="text-xs uppercase tracking-widest text-primary">Official scorecard · Round {data.round}</div>
          <h2 className="flex flex-wrap items-center gap-2 break-words text-xl font-bold sm:text-2xl">{student.name}{student.verified && <BadgeCheck aria-label="Face verified" className="verified-badge h-5 w-5" />}</h2>
          <div className="text-sm text-muted-foreground">{student.id} · Grade {student.grade}{student.section} · {student.stream}</div>
        </div>
        <div className="text-center"><Trophy className="mx-auto h-8 w-8 text-warning" /><div className="font-display text-2xl font-bold">{taken.length}/{subs.length}</div><div className="text-xs text-muted-foreground">subjects graded</div></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {subs.map((sub) => { const v = mine[sub]; return (
          <div key={sub} className="rounded-2xl border border-border bg-secondary/30 p-3 sm:p-4">
            <div className="flex flex-wrap justify-between gap-1 text-sm"><span>{sub}</span><span className="font-mono font-semibold">{v === undefined ? "—" : `${v}/100`}</span></div>
            <div className="mt-2 h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${(v ?? 0) >= 50 ? "bg-accent" : "bg-destructive"}`} style={{ width: `${v ?? 0}%` }} /></div>
          </div>
        ); })}
        <div className="col-span-2 rounded-2xl border border-primary/50 bg-primary/10 p-4 lg:col-span-1">
          <div className="text-sm text-muted-foreground">Total</div><div className="font-display text-2xl font-bold">{total}/{max || 0}</div><div className="text-sm text-primary">{max ? ((total / max) * 100).toFixed(1) : "0.0"}%</div>
        </div>
      </div>
    </div>
  );
}

function PinForm({ mode, err, typed, setTyped, typed2, setTyped2, onSubmit }: { mode: "enter" | "create"; err: string; typed: string; setTyped: (v: string) => void; typed2: string; setTyped2: (v: string) => void; onSubmit: (pin: string) => void }) {
  const [local, setLocal] = useState("");
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  return (
    <Panel title="Results are published" icon={<KeyRound className="h-4 w-4" />}>
      <form className="mx-auto max-w-xs space-y-3 py-6 text-center" onSubmit={(e) => {
        e.preventDefault(); setLocal("");
        if (!/^\d{4,6}$/.test(typed)) return setLocal("Your result passcode must be 4 to 6 numbers.");
        if (mode === "create" && typed !== typed2) return setLocal("The two passcodes do not match.");
        onSubmit(typed);
      }}>
        <Lock className="mx-auto h-10 w-10 text-primary" />
        <p className="text-sm text-muted-foreground">{mode === "enter" ? "Enter the result passcode you chose at registration to open your results." : "You registered before result passcodes existed. Choose a passcode of 4–6 numbers now — you will need it every time you open your results."}</p>
        <input className="field text-center font-mono text-lg tracking-[0.5em]" type="password" inputMode="numeric" autoComplete={mode === "enter" ? "current-password" : "new-password"} aria-label="Result passcode" placeholder="••••" value={typed} onChange={(e) => setTyped(digits(e.target.value))} required />
        {mode === "create" && <input className="field text-center font-mono text-lg tracking-[0.5em]" type="password" inputMode="numeric" autoComplete="new-password" aria-label="Confirm result passcode" placeholder="Again" value={typed2} onChange={(e) => setTyped2(digits(e.target.value))} required />}
        {(local || err) && <p role="alert" className="text-xs text-destructive">{local || err}</p>}
        <Btn className="w-full">{mode === "enter" ? "Unlock my results" : "Save passcode & open results"}</Btn>
      </form>
    </Panel>
  );
}


/** Practice review: one question at a time with Previous / Next, a number strip, and a jump to the next mistake. */
function PracticeReview({ questions, answers, correct }: { questions: Paper["paper"]; answers: Record<string, number>; correct: Record<string, number> }) {
  const [i, setI] = useState(0);
  const q = questions[i];
  if (!q) return null;
  const isOk = (id: string) => answers[id] !== undefined && answers[id] === correct[id];
  const mine = answers[q.id]; const right = correct[q.id]; const ok = isOk(q.id);
  const nextMistake = () => { for (let k = 1; k <= questions.length; k++) { const j = (i + k) % questions.length; const qq = questions[j]; if (qq && !isOk(qq.id)) { setI(j); return; } } };
  const anyMistake = questions.some((x) => !isOk(x.id));
  return (
    <div className="space-y-3">
      <div className="glass flex flex-wrap gap-1.5 p-3" aria-label="Questions">
        {questions.map((x, j) => { const good = isOk(x.id); const skipped = answers[x.id] === undefined; return (
          <button key={x.id} type="button" onClick={() => setI(j)} aria-label={`Question ${j + 1}: ${good ? "correct" : skipped ? "not answered" : "wrong"}`} aria-current={j === i}
            className={`h-8 w-8 rounded-lg border text-xs font-semibold ${j === i ? "ring-2 ring-primary" : ""} ${good ? "border-accent/60 bg-accent/15 text-accent" : skipped ? "border-border text-muted-foreground" : "border-destructive/60 bg-destructive/15 text-destructive"}`}>{j + 1}</button>); })}
      </div>
      <div className={`glass p-4 ${ok ? "border-accent/50" : "border-destructive/50"}`}>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Question {i + 1} of {questions.length}</span><span className={ok ? "text-accent" : "text-destructive"}>{ok ? "Correct" : mine === undefined ? "Not answered" : "Wrong"}</span></div>
        <MathText text={q.text} />
        <ul className="mt-3 space-y-1.5 text-sm">
          {q.choices.map((c, j) => (
            <li key={c.value} className={`rounded-lg border px-3 py-2 ${c.value === right ? "border-accent/60 bg-accent/10" : c.value === mine ? "border-destructive/60 bg-destructive/10" : "border-border"}`}>
              <span className="font-semibold">{"ABCD"[j]}.</span> <MathText text={c.label ?? ""} />{c.value === right ? " ✓ correct answer" : c.value === mine ? " ✗ your answer" : ""}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>← Previous</Btn>
          {anyMistake && <Btn variant="ghost" onClick={nextMistake}>Next mistake</Btn>}
          <Btn className="ml-auto" disabled={i === questions.length - 1} onClick={() => setI(i + 1)}>Next →</Btn>
        </div>
      </div>
    </div>
  );
}