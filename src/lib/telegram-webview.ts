// Detects the Telegram mini-app / in-app viewer, where fullscreen and the exam's
// focus checks misfire, so exams are refused there and the student is sent to the BHSSS Exam app.

export type WebviewSignals = { userAgent: string; hash: string; hasTelegramProxy: boolean; remembered: boolean };

const TG_MARK = "bh-in-telegram";

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
