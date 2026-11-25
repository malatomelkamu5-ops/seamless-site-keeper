// Detects the Telegram mini-app / in-app viewer, where fullscreen and the exam's
// focus checks misfire, plus Android app version checks and mobile-browser exam blocking.

export type WebviewSignals = { userAgent: string; hash: string; hasTelegramProxy: boolean; remembered: boolean };
export type ExamClientSignals = { userAgent: string; isStandalone: boolean; maxTouchPoints?: number; minScreenPx?: number };

const TG_MARK = "bh-in-telegram";
/** Minimum required Android BHSSS Exam app version; older installs are blocked until updated. */
export const CURRENT_APP_VERSION = "1.3";

/** Extracts the version number from BHSSSExamApp/<version>, or null outside the Android app. */
export function parseAppVersion(ua: string): string | null {
  const m = ua.match(/BHSSSExamApp\/(\d+(?:\.\d+)*)/i);
  return m?.[1] ?? null;
}

/** Compares dotted version strings numerically: <0 if a<b, 0 if equal, >0 if a>b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True only when running inside an older Android BHSSSExamApp release that must be updated. */
export function isOutdatedApp(ua: string, latest = CURRENT_APP_VERSION): boolean {
  const v = parseAppVersion(ua);
  return v !== null && compareVersions(v, latest) < 0;
}

/** Reads the current browser UA and returns the installed app version if outdated, else null. */
export function detectOutdatedApp(): string | null {
  if (typeof navigator === "undefined") return null;
  const v = parseAppVersion(navigator.userAgent);
  return v && compareVersions(v, CURRENT_APP_VERSION) < 0 ? v : null;
}

/** Pure rule: any Telegram signal (bridge object, launch data in the link, Telegram user agent, or an earlier detection this tab) means "inside Telegram". The school's Android app is never treated as Telegram. */
export function isTelegramWebview(s: WebviewSignals): boolean {
  if (/BHSSSExamApp/.test(s.userAgent)) return false;
  return s.hasTelegramProxy || s.remembered || /tgWebApp/i.test(s.hash) || /Telegram/i.test(s.userAgent);
}

/** Reads the signals from the current page and remembers a hit for the rest of this tab (Telegram's launch data vanishes after the first page). */
export function detectTelegram(): boolean {
  if (typeof window === "undefined") return false;
  if (isInstalledApp()) return false;
  const w = window as unknown as { TelegramWebviewProxy?: unknown; TelegramWebview?: unknown };
  let remembered = false;
  try { remembered = sessionStorage.getItem(TG_MARK) === "1"; } catch { /* storage blocked */ }
  const hit = isTelegramWebview({ userAgent: navigator.userAgent, hash: location.hash, hasTelegramProxy: !!(w.TelegramWebviewProxy || w.TelegramWebview), remembered });
  if (hit) { try { sessionStorage.setItem(TG_MARK, "1"); } catch { /* ignore */ } }
  return hit;
}

/** True when running inside the Android BHSSS Exam app or an installed iPhone/home-screen standalone app. */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  if (/BHSSSExamApp/.test(navigator.userAgent)) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/** True on iPhone / iPad Safari or WebKit devices. */
export function isIosDevice(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return /iPhone|iPad|iPod/i.test(ua);
}

/** True on phones and tablets (including iPadOS desktop UA and phone browsers requesting Desktop site), false on laptops/desktops. */
export function isMobileDevice(ua: string, maxTouchPoints = 0, minScreenPx?: number): boolean {
  if (/Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return true;
  if (minScreenPx !== undefined && minScreenPx > 0 && minScreenPx < 600 && maxTouchPoints > 0) return true;
  return false;
}

/** Pure rule: phones/tablets must take exams inside the installed BHSSS Exam app; laptops/PCs may use a browser. */
export function isWebExamBlocked(s: ExamClientSignals): boolean {
  if (parseAppVersion(s.userAgent) !== null) return false;
  if (s.isStandalone) return false;
  return isMobileDevice(s.userAgent, s.maxTouchPoints ?? 0, s.minScreenPx);
}

/** Checks whether the current browser session is a phone/tablet web browser that must switch to the app for exams. */
export function detectWebExamBlocked(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const isStandalone = nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
  const signals: ExamClientSignals = { userAgent: navigator.userAgent, isStandalone, maxTouchPoints: navigator.maxTouchPoints ?? 0 };
  if (typeof window.screen !== "undefined") signals.minScreenPx = Math.min(window.screen.width, window.screen.height);
  return isWebExamBlocked(signals);
}
