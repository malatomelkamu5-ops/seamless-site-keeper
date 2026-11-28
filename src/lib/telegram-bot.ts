/** Browser-safe rules and wording shared by the Telegram bot and the IT Admin bot page. */

export const MENU = {
  result: "📊 My Result",
  profile: "👤 Profile",
  status: "📅 Exam Status",
  news: "📢 Announcements",
  help: "🆘 Help",
  portal: "🌐 Open Portal",
  app: "📱 Exam App",
  signOut: "🚪 Sign out",
  cancel: "⬅️ Back to menu",
} as const;
export const CHANGE_ID_BUTTON = "⬅️ Change ID";
export const STUDENT_CODE_PATTERN = /^[A-Z0-9-]{3,30}$/;
export const normalizeStudentCode = (input: string) => input.trim().toUpperCase().replace(/\s+/g, "");
/** A Telegram chat is linked to a student only after proving their ID and result passcode. */
export const isVerifiedTelegramLink = (u: { student_code: string | null; id_confirmed: boolean }) => !!u.student_code && u.id_confirmed;

/** Wrong result passcodes allowed before the bot pauses result checks for that chat. */
export const PIN_MAX_FAILURES = 3;
export const PIN_LOCK_MIN = 15;
export function afterWrongPin(failures: number, now = Date.now()) {
  const next = failures + 1;
  return next >= PIN_MAX_FAILURES
    ? { failures: 0, lockedUntil: new Date(now + PIN_LOCK_MIN * 60_000).toISOString(), left: 0 }
    : { failures: next, lockedUntil: null, left: PIN_MAX_FAILURES - next };
}
export const pinLockMinutesLeft = (lockedUntil: string | null, now = Date.now()) => {
  if (!lockedUntil) return 0;
  const ms = Date.parse(lockedUntil) - now;
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
};

/** Server-side quotas capping IT Admin outbound Telegram messages to prevent spam or abuse. */
export const BROADCAST_COOLDOWN_MS = 60_000;
export const BROADCAST_HOURLY_LIMIT = 5;
export const BROADCAST_DAILY_LIMIT = 15;
export const BROADCAST_DUPLICATE_WINDOW_MS = 10 * 60_000;
export function broadcastQuotaError(
  recent: { created_at: string; audience: string; message: string }[],
  audience: string,
  message: string,
  now = Date.now(),
): string | null {
  const clean = message.trim();
  const sorted = [...recent].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const latest = sorted[0];
  if (latest && now - Date.parse(latest.created_at) < BROADCAST_COOLDOWN_MS) {
    return "Please wait 1 minute between Telegram announcements.";
  }
  if (sorted.some((b) => b.audience === audience && b.message.trim() === clean && now - Date.parse(b.created_at) < BROADCAST_DUPLICATE_WINDOW_MS)) {
    return "This same announcement was already sent to that group a few minutes ago.";
  }
  const lastHour = sorted.filter((b) => now - Date.parse(b.created_at) < 3_600_000).length;
  if (lastHour >= BROADCAST_HOURLY_LIMIT) {
    return "Hourly announcement limit reached (5 per hour). Please try again later.";
  }
  const lastDay = sorted.filter((b) => now - Date.parse(b.created_at) < 86_400_000).length;
  if (lastDay >= BROADCAST_DAILY_LIMIT) {
    return "Daily announcement limit reached (15 per 24 hours). Please try again tomorrow.";
  }
  return null;
}

export const REPLY_PER_CHAT_LIMIT = 5;
export const REPLY_PER_CHAT_WINDOW_MS = 15 * 60_000;
export const REPLY_SCHOOL_HOURLY_LIMIT = 30;
export const REPLY_SCHOOL_WINDOW_MS = 3_600_000;
export function directReplyQuotaError(chatReplies: number, schoolReplies: number): string | null {
  if (chatReplies >= REPLY_PER_CHAT_LIMIT) {
    return "Too many messages sent to this chat recently. Please wait 15 minutes.";
  }
  if (schoolReplies >= REPLY_SCHOOL_HOURLY_LIMIT) {
    return "Hourly Telegram reply limit reached (30 per hour). Please try again later.";
  }
  return null;
}

/** Who an IT Admin message goes to. */
export const AUDIENCES = [
  { value: "all", label: "Everyone who started the bot" },
  { value: "registered", label: "Registered students only" },
  { value: "unregistered", label: "Not registered yet" },
  { value: "Natural Science", label: "Natural Science students" },
  { value: "Social Science", label: "Social Science students" },
] as const;
export type Audience = (typeof AUDIENCES)[number]["value"];
export function inAudience(audience: Audience, u: { blocked: boolean; student_code: string | null; stream: string | null }) {
  if (u.blocked) return false;
  if (audience === "all") return true;
  if (audience === "registered") return !!u.student_code;
  if (audience === "unregistered") return !u.student_code;
  return !!u.student_code && u.stream === audience;
}

/** This school's live Lovable site (published address; the Vercel site only forwards to it). */
export const LIVE_SITE = "https://seamless-site-keeper.lovable.app";

/** The school's own Vercel address; it forwards to LIVE_SITE once that Vercel project is redeployed from this repository. */
export const VERCEL_SITE = "https://bhsss-exam-portal.vercel.app";

/** Default address the bot's portal buttons open (IT Admin can change it in bot settings). */
export const PORTAL_SITE = VERCEL_SITE;

/**
 * Telegram must call a public address. The editor preview address sits behind a sign-in,
 * so it is swapped for the project's public preview address. Every other address (the Vercel
 * site, the published site, a custom domain) uses the one stable live address, so "Connect bot"
 * gives the same result wherever it is pressed.
 */
export function webhookUrlFor(origin: string) {
  const u = new URL(origin);
  const m = u.hostname.match(/^id-preview--([a-z0-9-]+?)\.(.+)$/i);
  const host = m ? `project--${m[1]}-dev.${m[2]}` : new URL(LIVE_SITE).hostname;
  return `https://${host}/api/public/telegram/webhook`;
}

/** The school's Android exam app (screenshots blocked, phone pinned during exams), served by the portal itself. */
export const APP_DOWNLOAD_PATH = "/BHSSS-Exam.apk";
export const appDownloadUrl = (portalUrl: string) => `${portalUrl.replace(/\/$/, "")}${APP_DOWNLOAD_PATH}`;
export const iosAppUrl = (portalUrl: string) => `${portalUrl.replace(/\/$/, "")}/student?install=ios`;

/** Text sent when students ask for the exam app (Android + iPhone, never directing to Chrome). */
export function appInstallMessage() {
  return [
    "📱 <b>BHSSS Exam app</b>",
    "",
    "Take your exams in the school app: fullscreen security stays active and Android blocks screenshots until you submit.",
    "",
    "<b>Android phones:</b>",
    "1. Tap <b>Download for Android</b> below.",
    "2. Open the file and tap <b>Install</b> (allow “install from this source” the first time).",
    "3. Open the app and sign in with your ID and passcode.",
    "",
    "<b>iPhone (iOS):</b>",
    "1. Tap <b>Install on iPhone</b> below (opens in Safari).",
    "2. Tap the <b>Share</b> button (↑) at the bottom of Safari.",
    "3. Tap <b>Add to Home Screen</b> → <b>Add</b>, then open the <b>BHSSS Exam</b> app icon.",
  ].join("\n");
}

/** Automatic broadcast sent when an exam goes live: directs students strictly to the BHSSS Exam app. */
export function examLiveMessage(papers: string) {
  return `🟢 <b>The exam is LIVE now!</b>${papers ? `\n${escapeHtml(papers)}` : ""}\n\nOpen the <b>BHSSS Exam app</b> on your phone and sign in to start. Don't have the app yet? Tap below to install it on Android or iPhone. Good luck!`;
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function statusLines(s: { registrationOpen: boolean; examLive: boolean; resultsPublished: boolean; papers?: { subject: string; stream: string | null }[] }) {
  const papers = (s.papers ?? []).map((p) => `${p.subject}${p.stream ? ` (${p.stream})` : ""}`).join(", ");
  return [
    `📝 Registration: ${s.registrationOpen ? "<b>OPEN</b>" : "<b>CLOSED</b>"}`,
    `🖊 Exam: ${s.examLive ? `<b>LIVE</b>${papers ? ` — ${escapeHtml(papers)}` : ""}` : "<b>CLOSED</b>"}`,
    `📊 Results: ${s.resultsPublished ? "<b>PUBLISHED</b>" : "<b>CLOSED</b>"}`,
  ].join("\n");
}

/** Same as the portal results page: each subject score and the total only. */
export function resultText(p: { name: string; grade: string; section: string; stream: string; subjects: string[]; scores: Record<string, number> }) {
  const lines = p.subjects.map((s) => `• ${s}: <b>${p.scores[s] ?? "—"}</b>`);
  const total = p.subjects.reduce((n, s) => n + (p.scores[s] ?? 0), 0);
  const has = p.subjects.some((s) => p.scores[s] !== undefined);
  return [
    `📊 <b>Your results</b>`,
    `${escapeHtml(p.name)} · ${escapeHtml(p.grade + p.section)} · ${escapeHtml(p.stream)}`,
    "",
    ...lines,
    "",
    has ? `<b>Total: ${total} / ${p.subjects.length * 100}</b>` : "No marks have been recorded for you yet.",
  ].join("\n");
}
