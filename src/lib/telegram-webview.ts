// Detects the Telegram mini-app / in-app viewer, where fullscreen and the exam's
// focus checks misfire, so exams are refused there and the student is sent to a real browser.

export type WebviewSignals = { userAgent: string; hash: string; hasTelegramProxy: boolean; remembered: boolean };

const TG_MARK = "bh-in-telegram";

/** Pure rule: any Telegram signal (bridge object, launch data in the link, Telegram user agent, or an earlier detection this tab) means "inside Telegram". The school's own Android app is never treated as Telegram. */
export function isTelegramWebview(s: WebviewSignals): boolean {
  if (/BHSSSExamApp/.test(s.userAgent)) return false;
  return s.hasTelegramProxy || s.remembered || /tgWebApp/i.test(s.hash) || /Telegram/i.test(s.userAgent);
}

/** Reads the signals from the current page and remembers a hit for the rest of this tab (Telegram's launch data vanishes after the first page). */
export function detectTelegram(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { TelegramWebviewProxy?: unknown; TelegramWebview?: unknown };
  let remembered = false;
  try { remembered = sessionStorage.getItem(TG_MARK) === "1"; } catch { /* storage blocked */ }
  const hit = isTelegramWebview({ userAgent: navigator.userAgent, hash: location.hash, hasTelegramProxy: !!(w.TelegramWebviewProxy || w.TelegramWebview), remembered });
  if (hit) { try { sessionStorage.setItem(TG_MARK, "1"); } catch { /* ignore */ } }
  return hit;
}

/** Asks Telegram to open the link in the phone's browser (falls back to a normal new tab). */
export function openOutsideTelegram(url: string) {
  const w = window as unknown as { TelegramWebviewProxy?: { postEvent: (t: string, d: string) => void } };
  const data = JSON.stringify({ url, try_browser: "chrome" });
  try {
    if (w.TelegramWebviewProxy) { w.TelegramWebviewProxy.postEvent("web_app_open_link", data); return; }
    if (window.parent !== window) { window.parent.postMessage(JSON.stringify({ eventType: "web_app_open_link", eventData: { url } }), "*"); return; }
  } catch { /* fall through */ }
  window.open(url, "_blank", "noopener");
}
