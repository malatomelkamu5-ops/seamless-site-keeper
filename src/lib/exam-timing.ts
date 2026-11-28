export function canStartExam(open: boolean, start: string | null, close: string | null, time = Date.now()) {
  return open && !!start && !!close && time >= Date.parse(start) && time < Date.parse(close);
}

export function personalDeadline(startedAt: string, durationSec: number, extensionSec = 0) {
  return new Date(Date.parse(startedAt) + (durationSec + extensionSec) * 1000).toISOString();
}

/** A re-admitted student gets back the time they still had when they were blocked (never less than a minute). */
export function readmitDeadline(deadlineAt: string | null, blockedAt: string | null, time: number, fallbackSec: number) {
  const left = deadlineAt && blockedAt ? Math.ceil((Date.parse(deadlineAt) - Date.parse(blockedAt)) / 1000) : fallbackSec;
  return new Date(time + Math.max(60, left) * 1000).toISOString();
}

export function remainingSeconds(deadline: string | null, time = Date.now()) {
  return deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - time) / 1000)) : 0;
}
/** A student's device that stops reporting for this long (power cut, lost internet) has its timer frozen. */
export const DISCONNECT_GRACE_SEC = 45;
/** How often an exam device sends a background keep-alive while the exam is open. */
export const HEARTBEAT_MS = 15_000;
/** Wait this long after the latest answer tap before syncing so rapid taps send one write. */
export const ANSWER_SYNC_DEBOUNCE_MS = 1_500;
/** Only refresh registered_students.session_seen_at after this many milliseconds to avoid write contention. */
export const SESSION_TOUCH_MS = 60_000;
/** Only freeze a Director exam for offline loss when the device stays offline this long. */
export const OFFLINE_FREEZE_DELAY_MS = 15_000;

export function shouldTouchSession(seenAt: string | null | undefined, time = Date.now()) {
  return !seenAt || time - Date.parse(seenAt) >= SESSION_TOUCH_MS;
}

/** Preserves previously saved answers while letting newer answers from the active device overwrite changed choices. */
export function mergeAnswers(existing: Record<string, number> | null | undefined, incoming: Record<string, number>) {
  return { ...(existing ?? {}), ...incoming };
}

/** A connection-paused student is back online when their device reported again after the pause and within the grace window. */
export function backOnline(lastSeen: string | null, pausedAt: string | null, time = Date.now()) {
  if (!lastSeen || !pausedAt) return false;
  const seen = Date.parse(lastSeen);
  return seen > Date.parse(pausedAt) && time - seen < DISCONNECT_GRACE_SEC * 1000;
}

export function admittedToRoom(code: string, selected: string[] | null) { return selected === null || selected.includes(code); }
export function activeBankIds(s: { active_bank_id: string | null; social_bank_id: string | null }) { return [s.active_bank_id, s.social_bank_id].filter((id): id is string => !!id); }

/** Taps on the exam Help button within this many seconds count as one request. */
export const HELP_COOLDOWN_SEC = 30;
export function helpMessage(p: { name: string; code: string; grade: string; section: string; stream: string; subject: string; question?: number | undefined }) {
  return `${p.name} (${p.code}) needs help · Grade ${p.grade}${p.section} · ${p.stream} · ${p.subject}${p.question ? ` · on question ${p.question}` : ""}`;
}
