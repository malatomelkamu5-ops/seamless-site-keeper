import { describe, expect, it } from "vitest";
import { afterWrongPin, pinLockMinutesLeft, inAudience, webhookUrlFor, LIVE_SITE, PORTAL_SITE, VERCEL_SITE, resultText, statusLines, appDownloadUrl, iosAppUrl, appInstallMessage, examLiveMessage } from "@/lib/telegram-bot";

describe("Telegram bot rules", () => {
  it("pauses result checks for 15 minutes after 3 wrong passcodes", () => {
    const now = Date.parse("2026-11-10T08:00:00Z");
    expect(afterWrongPin(0, now)).toMatchObject({ failures: 1, lockedUntil: null, left: 2 });
    expect(afterWrongPin(1, now)).toMatchObject({ failures: 2, left: 1 });
    const locked = afterWrongPin(2, now);
    expect(locked.left).toBe(0);
    expect(pinLockMinutesLeft(locked.lockedUntil, now)).toBe(15);
    expect(pinLockMinutesLeft(locked.lockedUntil, now + 15 * 60_000)).toBe(0);
  });
  it("sends announcements only to the chosen group and never to chats that blocked the bot", () => {
    const reg = { blocked: false, student_code: "BH-12A-01", stream: "Natural Science" };
    const guest = { blocked: false, student_code: null, stream: null };
    expect(inAudience("all", guest)).toBe(true);
    expect(inAudience("registered", guest)).toBe(false);
    expect(inAudience("unregistered", reg)).toBe(false);
    expect(inAudience("Natural Science", reg)).toBe(true);
    expect(inAudience("Social Science", reg)).toBe(false);
    expect(inAudience("all", { ...reg, blocked: true })).toBe(false);
  });
  it("registers the public address, not the signed-in editor preview", () => {
    expect(webhookUrlFor("https://id-preview--abc-123.lovable.app")).toBe("https://project--abc-123-dev.lovable.app/api/public/telegram/webhook");
    expect(webhookUrlFor("https://burka-harbu-exams.lovable.app")).toBe(`${LIVE_SITE}/api/public/telegram/webhook`);
    // Pressing "Connect bot" on the Vercel site points Telegram straight at the live Lovable site.
    expect(webhookUrlFor("https://burka-harbu.vercel.app")).toBe(`${LIVE_SITE}/api/public/telegram/webhook`);
  });
  it("opens the new live site from the bot until Vercel is redeployed, and the bot reports to the live site", () => {
    expect(PORTAL_SITE).toBe("https://bhsss-exam-portal.vercel.app");
    expect(webhookUrlFor(VERCEL_SITE)).toBe("https://seamless-site-keeper.lovable.app/api/public/telegram/webhook");
  });
  it("shows only subject scores and the total, like the portal", () => {
    const t = resultText({ name: "Abdi", grade: "12", section: "A", stream: "Natural Science", subjects: ["Physics", "Biology"], scores: { Physics: 80 } });
    expect(t).toContain("Physics: <b>80</b>");
    expect(t).toContain("Biology: <b>—</b>");
    expect(t).toContain("Total: 80 / 200");
  });
  it("says closed when registration and results are closed", () => {
    const t = statusLines({ registrationOpen: false, examLive: true, resultsPublished: false });
    expect(t).toContain("Registration: <b>CLOSED</b>");
    expect(t).toContain("Exam: <b>LIVE</b>");
    expect(t).toContain("Results: <b>CLOSED</b>");
  });
});

describe("exam app download", () => {
  it("the bot's download button points at the app file on the portal address", () => {
    expect(appDownloadUrl("https://bhsss-exam-portal.vercel.app/")).toBe("https://bhsss-exam-portal.vercel.app/BHSSS-Exam.apk");
  });
  it("provides the iPhone install link on the student page", () => {
    expect(iosAppUrl("https://bhsss-exam-portal.vercel.app/")).toBe("https://bhsss-exam-portal.vercel.app/student?install=ios");
  });
  it("live exam and app messages direct students to the BHSSS Exam app for Android and iPhone without mentioning Chrome", () => {
    const live = examLiveMessage("Mathematics (Natural Science)");
    expect(live).toContain("BHSSS Exam app");
    expect(live.toLowerCase()).not.toContain("chrome");
    const install = appInstallMessage();
    expect(install).toContain("Android");
    expect(install).toContain("iPhone");
    expect(install).toContain("Add to Home Screen");
    expect(install.toLowerCase()).not.toContain("chrome");
  });
});
