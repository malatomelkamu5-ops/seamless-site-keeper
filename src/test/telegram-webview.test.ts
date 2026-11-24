import { describe, expect, it } from "vitest";
import { isTelegramWebview } from "@/lib/telegram-webview";

const base = { userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36", hash: "", hasTelegramProxy: false, remembered: false };

describe("Telegram mini-app exam block", () => {
  it("blocks when Telegram's bridge object is present", () => { expect(isTelegramWebview({ ...base, hasTelegramProxy: true })).toBe(true); });
  it("blocks when the link carries Telegram launch data", () => { expect(isTelegramWebview({ ...base, hash: "#tgWebAppData=abc&tgWebAppPlatform=android" })).toBe(true); });
  it("blocks Telegram's in-app browser user agent", () => { expect(isTelegramWebview({ ...base, userAgent: base.userAgent + " Telegram-Android/11.2.3" })).toBe(true); });
  it("keeps blocking after Telegram's launch data is gone", () => { expect(isTelegramWebview({ ...base, remembered: true })).toBe(true); });
  it("allows a normal Chrome browser", () => { expect(isTelegramWebview(base)).toBe(false); });
  it("allows the school's Android exam app", () => { expect(isTelegramWebview({ ...base, userAgent: base.userAgent + " BHSSSExamApp/1.0", remembered: true })).toBe(false); });
});
