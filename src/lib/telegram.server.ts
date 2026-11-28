import { subjectsFor } from "@/lib/identity";
import { RESULT_PIN, hashResultPin } from "@/lib/admin-rules";
import { MENU, CHANGE_ID_BUTTON, STUDENT_CODE_PATTERN, normalizeStudentCode, isVerifiedTelegramLink, afterWrongPin, pinLockMinutesLeft, statusLines, resultText, escapeHtml, inAudience, PORTAL_SITE, appDownloadUrl, iosAppUrl, appInstallMessage, examLiveMessage, type Audience } from "@/lib/telegram-bot";
import type { Tables } from "@/integrations/supabase/types";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export class TelegramError extends Error {
  constructor(message: string, readonly code: number) { super(message); }
}

/** Calls the Telegram Bot API: directly with TELEGRAM_BOT_TOKEN, otherwise through the connector gateway. */
export async function tg<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  let res: Response;
  if (botToken) {
    res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const telegramKey = process.env["TELEGRAM_API_KEY"];
    if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
    if (!telegramKey) throw new Error("The Telegram bot is not connected yet.");
    res = await fetch(`${GATEWAY_URL}/${method}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": telegramKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  const text = await res.text();
  let json: { ok?: boolean; result?: T; description?: string; error_code?: number } = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok || !json.ok) {
    console.error(`Telegram ${method} failed [${res.status}]: ${json.description ?? res.statusText}`);
    throw new TelegramError(json.description ?? `Telegram request failed [${res.status}]`, json.error_code ?? res.status);
  }
  return json.result as T;
}

/** Secret Telegram sends back on every update; derived from the bot credential so both sides agree. */
export async function webhookSecret() {
  const key = process.env["TELEGRAM_BOT_TOKEN"] ?? process.env["TELEGRAM_API_KEY"];
  if (!key) throw new Error("The Telegram bot is not connected yet.");
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-webhook:${key}`)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type BotSettings = Tables<"telegram_settings">;
type BotUser = Tables<"telegram_users">;

async function botSettings(): Promise<BotSettings> {
  const sb = await admin();
  const { data } = await sb.from("telegram_settings").select("*").eq("id", 1).maybeSingle();
  if (data) return data;
  const { data: created, error } = await sb.from("telegram_settings").upsert({ id: 1, portal_url: PORTAL_SITE }).select("*").single();
  if (error || !created) throw new Error("Could not load bot settings.");
  return created;
}

const portalButton = (s: BotSettings, text = "🌐 Open Exam Portal", path = "/student") => ({ inline_keyboard: [[{ text, web_app: { url: `${s.portal_url.replace(/\/$/, "")}${path}` } }]] });
const appButtons = (s: BotSettings) => ({
  inline_keyboard: [
    [{ text: "⬇️ Download for Android", url: appDownloadUrl(s.portal_url) }],
    [{ text: "🍎 Install on iPhone (iOS)", url: iosAppUrl(s.portal_url) }],
  ],
});
const menuKeyboard = (s: BotSettings) => ({
  keyboard: [
    [{ text: MENU.result }, { text: MENU.profile }],
    [{ text: MENU.status }, { text: MENU.news }],
    [{ text: MENU.help }, { text: MENU.portal, web_app: { url: `${s.portal_url.replace(/\/$/, "")}/student` } }],
    [{ text: MENU.app }],
    [{ text: MENU.signOut }],
  ],
  resize_keyboard: true, is_persistent: true,
});
const backKeyboard = { keyboard: [[{ text: MENU.cancel }]], resize_keyboard: true };
const changeIdKeyboard = { keyboard: [[{ text: CHANGE_ID_BUTTON }]], resize_keyboard: true };
const noKeyboard = { remove_keyboard: true };

/** Sends a message, records it, and marks chats that blocked the bot. Returns false when it could not be delivered. */
export async function send(chatId: number, text: string, markup?: unknown, kind: "chat" | "broadcast" | "notice" | "reply" = "chat") {
  const sb = await admin();
  try {
    await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(markup ? { reply_markup: markup } : {}) });
    await sb.from("telegram_messages").insert({ chat_id: chatId, direction: "out", kind, text: text.slice(0, 4000) });
    return true;
  } catch (e) {
    if (e instanceof TelegramError && (e.code === 403 || /blocked|deactivated|chat not found/i.test(e.message))) {
      await sb.from("telegram_users").update({ blocked: true }).eq("chat_id", chatId);
    }
    return false;
  }
}

async function portalStatus() {
  const sb = await admin();
  await sb.rpc("apply_exam_schedule");
  const { data: s } = await sb.from("exam_settings").select("*").eq("id", 1).single();
  if (!s) throw new Error("Could not load exam settings.");
  const ids = [s.active_bank_id, s.social_bank_id].filter((x): x is string => !!x);
  const { data: banks } = ids.length ? await sb.from("question_banks").select("subject,target_stream").in("id", ids) : { data: [] };
  return { s, papers: (banks ?? []).map((b) => ({ subject: b.subject, stream: b.target_stream })) };
}
const statusOf = (st: Awaited<ReturnType<typeof portalStatus>>) => statusLines({ registrationOpen: st.s.registration_open, examLive: st.s.exam_live, resultsPublished: st.s.results_published, papers: st.papers });

async function setUser(chatId: number, patch: Partial<BotUser>) {
  const sb = await admin();
  await sb.from("telegram_users").update(patch).eq("chat_id", chatId);
}

async function linkedStudent(user: Pick<BotUser, "student_code" | "id_confirmed">) {
  if (!isVerifiedTelegramLink(user)) return null;
  const sb = await admin();
  const { data } = await sb.from("registered_students").select("*").eq("student_code", user.student_code!).maybeSingle();
  return data && data.face_verified ? data : null;
}

/* ---------------- Conversation ---------------- */

async function askLoginId(chatId: number, s: BotSettings, first: boolean) {
  const st = await portalStatus();
  const intro = first ? `👋 <b>${escapeHtml(s.welcome_message)}</b>\n\n${statusOf(st)}\n\n` : "";
  await send(chatId, `${intro}To sign in, please send your <b>Student ID</b> (for example <code>BH-12A-01</code>).`, noKeyboard);
}

async function showMenu(chatId: number, s: BotSettings, text = "Choose from the menu below.") {
  await send(chatId, text, menuKeyboard(s));
}

async function handleLoginId(user: BotUser, _s: BotSettings, text: string) {
  const wait = pinLockMinutesLeft(user.pin_locked_until);
  if (wait) return send(user.chat_id, `⏳ Too many wrong passcodes. Please try again in ${wait} minute${wait === 1 ? "" : "s"}.`, noKeyboard);
  const code = normalizeStudentCode(text);
  if (!STUDENT_CODE_PATTERN.test(code)) {
    return send(user.chat_id, "Please send your <b>Student ID</b> (for example <code>BH-12A-01</code>), not your name.", noKeyboard);
  }
  await setUser(user.chat_id, { state: "await_login_pin", state_data: { pending_code: code } });
  return send(user.chat_id, "🔐 Now send your <b>result passcode</b> (4 to 6 numbers) to verify your identity. Your message will be deleted for privacy.", changeIdKeyboard);
}

async function handleLoginPin(user: BotUser, s: BotSettings, text: string, messageId: number) {
  await tg("deleteMessage", { chat_id: user.chat_id, message_id: messageId }).catch(() => undefined);
  const wait = pinLockMinutesLeft(user.pin_locked_until);
  if (wait) {
    await setUser(user.chat_id, { state: "await_login_id", state_data: {} });
    return send(user.chat_id, `⏳ Too many wrong passcodes. Please try again in ${wait} minute${wait === 1 ? "" : "s"}.`, noKeyboard);
  }
  const raw = user.state_data && typeof user.state_data === "object" && !Array.isArray(user.state_data) ? (user.state_data as Record<string, unknown>)["pending_code"] : null;
  const pendingCode = typeof raw === "string" ? normalizeStudentCode(raw) : "";
  if (!STUDENT_CODE_PATTERN.test(pendingCode)) {
    await setUser(user.chat_id, { state: "await_login_id", state_data: {} });
    return askLoginId(user.chat_id, s, false);
  }
  const pin = text.trim();
  if (!RESULT_PIN.test(pin)) return send(user.chat_id, "The passcode must be 4 to 6 numbers. Please send it again.", changeIdKeyboard);
  const sb = await admin();
  const { data: st } = await sb.from("registered_students").select("*").eq("student_code", pendingCode).maybeSingle();
  const valid = !!st && st.face_verified && !!st.results_pin_hash && (await hashResultPin(st.student_code, pin)) === st.results_pin_hash;
  if (!valid) {
    const r = afterWrongPin(user.pin_failures);
    await setUser(user.chat_id, { pin_failures: r.failures, pin_locked_until: r.lockedUntil, state: "await_login_id", state_data: {} });
    if (!r.left) return send(user.chat_id, "⛔ Too many wrong passcodes. Sign-in is paused for 15 minutes. If you forgot your passcode, ask IT Admin to reset it.", noKeyboard);
    return send(user.chat_id, `❌ Student ID or passcode is wrong. ${r.left} tr${r.left === 1 ? "y" : "ies"} left.\n\nPlease send your <b>Student ID</b> again (for example <code>BH-12A-01</code>).`, noKeyboard);
  }
  await setUser(user.chat_id, {
    student_code: st.student_code,
    linked_at: new Date().toISOString(),
    state: "menu",
    id_confirmed: true,
    pin_failures: 0,
    pin_locked_until: null,
    state_data: {},
  });
  return showMenu(user.chat_id, s, `✅ <b>Signed in!</b>\n${escapeHtml(st.full_name)} · Grade ${escapeHtml(st.grade + st.section)} · ${escapeHtml(st.stream)}\n\nUse the menu buttons below.`);
}

async function scoresFor(st: Tables<"registered_students">, sat: boolean, currentRound: number) {
  const sb = await admin();
  const { data: hidden } = await sb.from("exam_rounds").select("round").not("archived_at", "is", null);
  const archived = new Set((hidden ?? []).map((r) => r.round));
  const { data: rows } = await sb.from("round_results").select("round,subject,score_pct").eq("student_code", st.student_code);
  const all = (rows ?? []).filter((r) => !archived.has(r.round));
  const rounds = [...new Set([currentRound, ...all.map((r) => r.round)])].sort((a, b) => a - b);
  const round = rounds[rounds.length - 1] ?? currentRound;
  const scores = Object.fromEntries(all.filter((r) => r.round === round).map((r) => [r.subject, r.score_pct])) as Record<string, number>;
  return { subjects: subjectsFor(st.stream, sat || "SAT" in scores), scores };
}

async function startResult(user: BotUser, s: BotSettings) {
  if (!s.results_enabled) return send(user.chat_id, "Results are not available in the bot right now. Please check them on the portal.", portalButton(s, "📊 Open results on the portal"));
  const st = await portalStatus();
  if (!st.s.results_published) return showMenu(user.chat_id, s, "🔒 Results are <b>CLOSED</b>. They have not been published yet — we will message you here as soon as they are.");
  const wait = pinLockMinutesLeft(user.pin_locked_until);
  if (wait) return showMenu(user.chat_id, s, `⏳ Too many wrong passcodes. Please try again in ${wait} minute${wait === 1 ? "" : "s"}.`);
  await setUser(user.chat_id, { state: "await_result_id" });
  await send(user.chat_id, "Please send your <b>student ID</b> (for example BH-12A-01).", backKeyboard);
}

async function handleResultId(user: BotUser, _s: BotSettings, text: string) {
  const id = text.trim().toUpperCase().replace(/\s+/g, "");
  if (id !== user.student_code) return send(user.chat_id, "❌ This ID does not match your registration. Please check it and send it again.", backKeyboard);
  await setUser(user.chat_id, { state: "await_result_pin" });
  return send(user.chat_id, "🔐 Now send your <b>result passcode</b> (4 to 6 numbers). Your message will be deleted for privacy.", backKeyboard);
}

async function handleResultPin(user: BotUser, s: BotSettings, text: string, messageId: number) {
  await tg("deleteMessage", { chat_id: user.chat_id, message_id: messageId }).catch(() => undefined);
  const pin = text.trim();
  if (!RESULT_PIN.test(pin)) return send(user.chat_id, "The passcode must be 4 to 6 numbers. Please send it again.", backKeyboard);
  const st = await linkedStudent(user);
  if (!st) { await setUser(user.chat_id, { state: "await_login_id", student_code: null, id_confirmed: false, state_data: {} }); return askLoginId(user.chat_id, s, false); }
  const status = await portalStatus();
  if (!status.s.results_published) { await setUser(user.chat_id, { state: "menu" }); return showMenu(user.chat_id, s, "🔒 Results are <b>CLOSED</b> right now."); }
  if (!st.results_pin_hash) { await setUser(user.chat_id, { state: "menu" }); return send(user.chat_id, "You have not created a result passcode yet. Open the Results page on the portal once to create it.", portalButton(s, "📊 Create passcode on the portal")); }
  if ((await hashResultPin(st.student_code, pin)) !== st.results_pin_hash) {
    const r = afterWrongPin(user.pin_failures);
    await setUser(user.chat_id, { pin_failures: r.failures, pin_locked_until: r.lockedUntil, state: r.left ? "await_result_pin" : "menu" });
    if (!r.left) return showMenu(user.chat_id, s, "⛔ Wrong passcode. Result checks are paused for 15 minutes. If you forgot it, ask IT Admin to reset it.");
    return send(user.chat_id, `❌ Wrong passcode. ${r.left} tr${r.left === 1 ? "y" : "ies"} left.`, backKeyboard);
  }
  await setUser(user.chat_id, { pin_failures: 0, pin_locked_until: null, id_confirmed: true, state: "menu" });
  const { subjects, scores } = await scoresFor(st, status.s.sat_enabled, status.s.current_round);
  await showMenu(user.chat_id, s, resultText({ name: st.full_name, grade: st.grade, section: st.section, stream: st.stream, subjects, scores }));
}

async function showProfile(user: BotUser, s: BotSettings) {
  const st = await linkedStudent(user);
  if (!st) { await setUser(user.chat_id, { state: "await_login_id", student_code: null, id_confirmed: false, state_data: {} }); return askLoginId(user.chat_id, s, false); }
  const date = new Date(st.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Addis_Ababa" });
  await showMenu(user.chat_id, s, [
    "👤 <b>Your profile</b>",
    `Name: <b>${escapeHtml(st.full_name)}</b>`,
    `Student ID: <b>${escapeHtml(st.student_code)}</b>`,
    `Class: Grade ${escapeHtml(st.grade + st.section)}`,
    `Stream: ${escapeHtml(st.stream)}`,
    `Gender: ${st.gender === "F" ? "Female" : "Male"}`,
    `Registered: ${date}`,
    `Face verified: ${st.face_verified ? "✅ Yes" : "No"}`,
    `Telegram: ${user.username ? "@" + escapeHtml(user.username) : "—"}`,
  ].join("\n"));
}

async function showNews(user: BotUser, s: BotSettings) {
  const sb = await admin();
  const { data } = await sb.from("telegram_broadcasts").select("message,created_at").eq("kind", "manual").order("created_at", { ascending: false }).limit(5);
  if (!data?.length) return showMenu(user.chat_id, s, "📢 No announcements yet.");
  const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" });
  await showMenu(user.chat_id, s, `📢 <b>Latest announcements</b>\n\n${data.map((b) => `🗓 <i>${fmt(b.created_at)}</i>\n${escapeHtml(b.message)}`).join("\n\n")}`);
}

type TgMessage = { message_id: number; text?: string; chat: { id: number; type: string }; from?: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string } };
export type TgUpdate = { update_id: number; message?: TgMessage };

/** Handles one Telegram update. Repeated deliveries of the same update are ignored. */
export async function handleUpdate(update: TgUpdate) {
  const msg = update.message;
  if (!msg || msg.chat.type !== "private" || typeof update.update_id !== "number") return;
  const sb = await admin();
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();
  const { data: existing } = await sb.from("telegram_users").select("*").eq("chat_id", chatId).maybeSingle();
  const isPinPrompt = existing?.state === "await_result_pin" || existing?.state === "await_login_pin";
  const isControlText = !text || text.startsWith("/") || text === CHANGE_ID_BUTTON || Object.values(MENU).includes(text as never);
  const logged = isPinPrompt && !isControlText ? "•••• (passcode hidden)" : text || "[non-text message]";
  const { error: dup } = await sb.from("telegram_messages").insert({ update_id: update.update_id, chat_id: chatId, direction: "in", kind: existing?.state === "await_help" && text && !text.startsWith("/") && !Object.values(MENU).includes(text as never) ? "help" : "chat", text: logged.slice(0, 4000) });
  if (dup) return; // already handled
  const profile = { telegram_user_id: msg.from?.id ?? null, username: msg.from?.username ?? null, first_name: msg.from?.first_name ?? null, last_name: msg.from?.last_name ?? null, language_code: msg.from?.language_code ?? null, last_seen_at: new Date().toISOString(), blocked: false };
  const { data: user } = await sb.from("telegram_users").upsert({ chat_id: chatId, ...profile }, { onConflict: "chat_id" }).select("*").single();
  if (!user) return;
  const s = await botSettings();
  await notifyStatusChanges().catch((e) => console.error("Status notice failed", e));
  if (!s.bot_enabled) return send(chatId, "⏸ The bot is paused by IT Admin right now. Please use the exam portal.", portalButton(s));

  const linked = await linkedStudent(user);
  const command = text.toLowerCase();
  if (text.startsWith("/start") || !existing) {
    if (linked) {
      await setUser(chatId, { state: "menu", state_data: {} });
      return showMenu(chatId, s, `👋 <b>${escapeHtml(s.welcome_message)}</b>\n\nSigned in as <b>${escapeHtml(linked.full_name)}</b>.`);
    }
    await setUser(chatId, { student_code: null, id_confirmed: false, state: "await_login_id", state_data: {} });
    return askLoginId(chatId, s, true);
  }
  if (!text) return send(chatId, "Please send text messages only.");
  if (!linked) {
    if (user.student_code || user.id_confirmed) await setUser(chatId, { student_code: null, id_confirmed: false });
    if (command === "/app" || text === MENU.app) return send(chatId, appInstallMessage(), appButtons(s));
    if (command === "/status") {
      const st = await portalStatus();
      return send(chatId, `📅 <b>Exam portal status</b>\n\n${statusOf(st)}`, noKeyboard);
    }
    if (text === CHANGE_ID_BUTTON || text === MENU.cancel || text.startsWith("/")) {
      await setUser(chatId, { state: "await_login_id", state_data: {} });
      return askLoginId(chatId, s, false);
    }
    if (user.state === "await_login_pin") return handleLoginPin(user, s, text, msg.message_id);
    return handleLoginId(user, s, text);
  }
  if (text === MENU.cancel || command === "/menu") { await setUser(chatId, { state: "menu" }); return showMenu(chatId, s); }
  if (text === MENU.result || command === "/result") return startResult(user, s);
  if (text === MENU.profile || command === "/profile") { await setUser(chatId, { state: "menu" }); return showProfile(user, s); }
  if (text === MENU.status || command === "/status") {
    await setUser(chatId, { state: "menu" });
    const st = await portalStatus();
    const note = st.s.exam_live ? "\n\n📱 Open the <b>BHSSS Exam app</b> on your phone to take the live exam." : "";
    return showMenu(chatId, s, `📅 <b>Exam portal status</b>\n\n${statusOf(st)}${note}`);
  }
  if (text === MENU.news) { await setUser(chatId, { state: "menu" }); return showNews(user, s); }
  if (text === MENU.app || command === "/app") return send(chatId, appInstallMessage(), appButtons(s));
  if (text === MENU.portal) return send(chatId, "Tap below to open the exam portal.", portalButton(s));
  if (text === MENU.help || command === "/help") {
    await setUser(chatId, { state: "await_help" });
    return send(chatId, `🆘 ${escapeHtml(s.help_message)}\n\n✍️ Type your question now and send it. IT Admin will reply to you here.`, backKeyboard);
  }
  if (text === MENU.signOut) {
    await setUser(chatId, { student_code: null, id_confirmed: false, state: "await_login_id", linked_at: null, state_data: {} });
    return send(chatId, "🚪 You are signed out. Send your Student ID to sign in again.", noKeyboard);
  }
  if (user.state === "await_result_id") return handleResultId(user, s, text);
  if (user.state === "await_result_pin") return handleResultPin(user, s, text, msg.message_id);
  if (user.state === "await_help") {
    await setUser(chatId, { state: "menu" });
    return showMenu(chatId, s, "✅ Your message was sent to IT Admin. You will get the reply here.");
  }
  return showMenu(chatId, s, "Please use the menu buttons below.");
}

/* ---------------- Broadcasts & automatic notices ---------------- */

/** Sends one message to every chat in the audience, about 20 per second to stay inside Telegram's limits. */
export async function broadcast(audience: Audience, text: string, markup: unknown, kind: "manual" | "auto", record: string) {
  const sb = await admin();
  const { data: users } = await sb.from("telegram_users").select("chat_id,blocked,student_code,id_confirmed");
  const verifiedCode = (u: { student_code: string | null; id_confirmed: boolean }) => (isVerifiedTelegramLink(u) ? u.student_code : null);
  const codes = [...new Set((users ?? []).map(verifiedCode).filter((c): c is string => !!c))];
  const { data: regs } = codes.length ? await sb.from("registered_students").select("student_code,stream").in("student_code", codes) : { data: [] };
  const stream = new Map((regs ?? []).map((r) => [r.student_code, r.stream]));
  const targets = (users ?? []).filter((u) => {
    const code = verifiedCode(u);
    return inAudience(audience, { blocked: u.blocked, student_code: code, stream: code ? stream.get(code) ?? null : null });
  });
  let sent = 0, failed = 0;
  for (let i = 0; i < targets.length; i += 20) {
    const results = await Promise.all(targets.slice(i, i + 20).map((u) => send(u.chat_id, text, markup, kind === "manual" ? "broadcast" : "notice")));
    sent += results.filter(Boolean).length; failed += results.filter((r) => !r).length;
    if (i + 20 < targets.length) await new Promise((r) => setTimeout(r, 1000));
  }
  await sb.from("telegram_broadcasts").insert({ kind, audience, message: record.slice(0, 4000), sent, failed });
  return { sent, failed, total: targets.length };
}

type Flag = "exam_live" | "results_published" | "registration_open";
const LAST: Record<Flag, "last_exam_live" | "last_results_published" | "last_registration_open"> = { exam_live: "last_exam_live", results_published: "last_results_published", registration_open: "last_registration_open" };

/**
 * Compares the portal's state with what the bot last announced. Exactly one caller wins each change
 * (the update only succeeds while the old value is still stored), so students get each notice once.
 */
export async function notifyStatusChanges() {
  const sb = await admin();
  const [{ data: ts }, { data: es }] = await Promise.all([
    sb.from("telegram_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("exam_settings").select("exam_live,results_published,registration_open").eq("id", 1).maybeSingle(),
  ]);
  if (!ts || !es) return;
  for (const flag of ["exam_live", "results_published", "registration_open"] as Flag[]) {
    const prev = ts[LAST[flag]];
    const cur = es[flag];
    if (prev === cur) continue;
    let q = sb.from("telegram_settings").update({ [LAST[flag]]: cur } as Partial<BotSettings>).eq("id", 1);
    q = prev === null ? q.is(LAST[flag], null) : q.eq(LAST[flag], prev);
    const { data: claimed } = await q.select("id");
    if (!claimed?.length || !cur || !ts.bot_enabled || prev === null) continue;
    if (flag === "exam_live" && ts.notify_exam_live) {
      const st = await portalStatus();
      const papers = st.papers.map((p) => `${p.subject}${p.stream ? ` (${p.stream})` : ""}`).join(", ");
      await broadcast("all", examLiveMessage(papers), appButtons(ts), "auto", "Exam is live");
    }
    if (flag === "results_published" && ts.notify_results) {
      await broadcast("registered", "📊 <b>Results are published!</b>\nTap <b>My Result</b> in the menu and enter your ID and passcode to see your marks.", menuKeyboard(ts), "auto", "Results published");
    }
    if (flag === "registration_open" && ts.notify_registration) {
      await broadcast("unregistered", "📝 <b>Registration is OPEN now!</b>\nTap below to register on the portal, then send your Student ID and passcode here to sign in.", portalButton(ts, "📝 Register on the portal"), "auto", "Registration opened");
    }
  }
}
