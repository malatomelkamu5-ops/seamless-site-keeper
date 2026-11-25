import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Crown, Cpu, BookOpen, GraduationCap, MessageCircle, BadgeCheck, Smartphone, WifiOff, RefreshCw, Share } from "lucide-react";
import { APP_DOWNLOAD_PATH } from "@/lib/telegram-bot";
import { isInstalledApp, isIosDevice } from "@/lib/telegram-webview";
import { usePublicState } from "@/lib/live";
import { isPageVisible } from "@/lib/admin-rules";

const roles = [
  { to: "/director", label: "Director", icon: Crown },
  { to: "/it-admin", label: "IT Admin", icon: Cpu },
  { to: "/teacher", label: "Teacher", icon: BookOpen },
  { to: "/student", label: "Student", icon: GraduationCap },
] as const;

/** Staff links appear only once the IT Admin's visibility setting is known, so hidden pages never flash into view. */
export function visibleRoles<T extends { to: string }>(list: readonly T[], hidden: string[] | undefined) {
  return list.filter((r) => r.to === "/student" || (hidden !== undefined && isPageVisible(r.to.slice(1), hidden)));
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const SUPPORT_URL = "https://t.me/bhsss_admin";
export function HelpLink() {
  return <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="help-link"><MessageCircle className="h-4 w-4" />Need help? Contact us</a>;
}

/** Download card for Android and home-screen install guide for iPhone; hidden when already running inside the installed app. */
export function AppDownload() {
  const [inApp, setInApp] = useState(true);
  const [ios, setIos] = useState(false);
  const [showIos, setShowIos] = useState(false);
  useEffect(() => {
    setInApp(isInstalledApp());
    const apple = isIosDevice();
    setIos(apple);
    setShowIos(apple);
  }, []);
  if (inApp) return null;
  return (
    <div className="tile mx-auto max-w-xl space-y-3 text-left">
      <div className="flex items-start gap-3">
        <span className="tile-icon shrink-0"><Smartphone className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Get the BHSSS Exam app</div>
          <p className="text-sm text-muted-foreground">Take exams in full screen without accidental lockouts. On Android, screenshots are blocked and the phone stays on the exam until you submit.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!ios && (
          <a href={APP_DOWNLOAD_PATH} download="BHSSS-Exam.apk" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
            <Smartphone className="h-4 w-4" />Download for Android
          </a>
        )}
        <button type="button" onClick={() => setShowIos((v) => !v)} className={`inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-sm font-semibold transition hover:bg-secondary ${ios ? "flex-1 bg-primary text-primary-foreground border-primary hover:bg-primary hover:brightness-110" : ""}`}>
          <Share className="h-4 w-4" />iPhone (iOS) install
        </button>
        {ios && (
          <a href={APP_DOWNLOAD_PATH} download="BHSSS-Exam.apk" className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-2 text-sm font-semibold transition hover:bg-secondary">
            <Smartphone className="h-4 w-4" />Android APK
          </a>
        )}
      </div>
      {showIos && (
        <ol className="space-y-1 rounded-xl border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
          <li className="font-semibold text-foreground">How to install on iPhone (iOS):</li>
          <li>1. Open this page in <b>Safari</b>.</li>
          <li>2. Tap the <b>Share</b> button (<span className="font-mono">↑</span>) at the bottom of Safari.</li>
          <li>3. Scroll down, tap <b>Add to Home Screen</b>, then tap <b>Add</b>.</li>
          <li>4. Open the <b>BHSSS Exam</b> icon from your iPhone Home Screen.</li>
        </ol>
      )}
    </div>
  );
}

/** Clean offline overlay shown across non-exam screens whenever the device loses internet connection. */
export function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("offline", sync);
    window.addEventListener("online", sync);
    return () => { window.removeEventListener("offline", sync); window.removeEventListener("online", sync); };
  }, []);
  if (!offline) return null;
  const retry = async () => {
    setChecking(true);
    try {
      const res = await fetch("/favicon.png", { method: "HEAD", cache: "no-store" });
      if (res.ok) { setOffline(false); window.location.reload(); return; }
    } catch { /* still offline */ }
    finally { setChecking(false); }
  };
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="global-offline-title" className="fixed inset-0 z-30 flex items-center justify-center bg-background/95 p-4 backdrop-blur-md">
      <div className="glass max-w-sm space-y-4 p-6 text-center sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-warning/40 bg-warning/10">
          <WifiOff className="h-8 w-8 text-warning" />
        </div>
        <div className="space-y-1.5">
          <h2 id="global-offline-title" className="text-xl font-bold">No internet connection</h2>
          <p className="text-sm text-muted-foreground">You are currently offline. Turn on Wi-Fi or mobile data, then tap Try again to continue.</p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          Burka Harbu Special Secondary School · BHSSS Exam
        </div>
        <Btn className="w-full" onClick={retry} disabled={checking}>
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />{checking ? "Checking connection…" : "Try again"}
        </Btn>
      </div>
    </div>
  );
}

export function Shell({ children, title, subtitle, help = false }: { children: ReactNode; title: string; subtitle: string; help?: boolean }) {
  const { data } = usePublicState();
  const live = !!data?.examLive;
  const published = !!data?.resultsPublished;
  const shownRoles = visibleRoles(roles, data?.hiddenStaffRoles);
  return (
    <div className="relative min-h-screen">
      <img src="/school-logo.jpg" alt="" aria-hidden className="pointer-events-none fixed left-1/2 top-1/2 -z-0 w-[560px] max-w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.05]" />
      <header className="header-premium z-30 backdrop-blur-xl md:sticky md:top-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4 sm:py-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="logo-ring shrink-0"><img src="/school-logo.jpg" alt="Burka Harbu logo" className="block h-9 w-9 rounded-full sm:h-11 sm:w-11" /></span>
            <div className="min-w-0 leading-tight">
              <div className="text-premium truncate font-display text-sm font-bold sm:text-base">Burka Harbu Special Secondary School</div>
              <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><BadgeCheck className="h-3.5 w-3.5 shrink-0 text-accent" />Grade 12 National Exam Platform</div>
            </div>
          </Link>
          <nav className="-mx-1 flex w-full gap-1 overflow-x-auto rounded-full border border-border bg-secondary/60 p-1 shadow-inner md:mx-0 md:ml-auto md:w-auto">
            {shownRoles.map((r) => (
              <Link key={r.to} to={r.to} className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs sm:px-3 font-medium text-muted-foreground transition hover:text-foreground"
                activeProps={{ className: "bg-primary text-primary-foreground glow hover:text-primary-foreground" }}>
                <r.icon className="h-3.5 w-3.5" /> {r.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="status-pill"><span className={live ? "dot-live" : "dot-off"} /> Exam {live ? "Live" : "Locked"}</span>
            <span className="status-pill"><span className={published ? "dot-live" : "dot-off"} /> Results {published ? "Out" : "Hidden"}</span>
          </div>
        </div>
      </header>
      <main className="relative mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-8">
        <div className="mb-5 sm:mb-8">
          <h1 className="text-2xl font-bold sm:text-3xl md:text-4xl">{title}</h1>
          <p className="mt-1 text-muted-foreground">{subtitle}</p>
        </div>
        {children}
        {help && <div className="mt-10 flex justify-center"><HelpLink /></div>}
      </main>
    </div>
  );
}

export function Panel({ title, icon, children, className = "", action }: { title: string; icon?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`glass p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {icon && <span className="text-primary">{icon}</span>}
        <h2 className="min-w-[10rem] flex-1 break-words text-base font-semibold">{title}</h2>
        {action && <div className="ml-auto max-w-full">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full border transition ${on ? "border-accent bg-accent/30 glow" : "border-border bg-muted"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${on ? "left-6 bg-accent" : "left-0.5 bg-muted-foreground"}`} />
    </button>
  );
}

export function Btn({ children, variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "accent" }) {
  const v = {
    primary: "bg-primary text-primary-foreground hover:brightness-110 glow",
    accent: "bg-accent text-accent-foreground hover:brightness-110",
    ghost: "border border-border bg-secondary/40 hover:bg-secondary",
    danger: "bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25",
  }[variant];
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${v} ${className}`}>{children}</button>;
}

export function Avatar({ name, className = "h-12 w-12" }: { name: string; className?: string }) {
  const init = name.split(" ").slice(0, 2).map((n) => n[0]).join("");
  return <div className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/40 to-accent/30 font-display font-bold ring-1 ring-primary/40 ${className}`}>{init}</div>;
}
