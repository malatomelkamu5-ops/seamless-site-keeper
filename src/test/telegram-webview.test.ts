import { describe, expect, it } from "vitest";
import { isTelegramWebview, isIosDevice, parseAppVersion, isOutdatedApp, isWebExamBlocked, CURRENT_APP_VERSION } from "@/lib/telegram-webview";

const base = { userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36", hash: "", hasTelegramProxy: false, remembered: false };
const laptop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const macbook = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";

describe("Telegram mini-app exam block", () => {
  it("blocks when Telegram's bridge object is present", () => { expect(isTelegramWebview({ ...base, hasTelegramProxy: true })).toBe(true); });
  it("blocks when the link carries Telegram launch data", () => { expect(isTelegramWebview({ ...base, hash: "#tgWebAppData=abc&tgWebAppPlatform=android" })).toBe(true); });
  it("blocks Telegram's in-app browser user agent", () => { expect(isTelegramWebview({ ...base, userAgent: base.userAgent + " Telegram-Android/11.2.3" })).toBe(true); });
  it("keeps blocking after Telegram's launch data is gone", () => { expect(isTelegramWebview({ ...base, remembered: true })).toBe(true); });
  it("allows a normal Chrome browser", () => { expect(isTelegramWebview(base)).toBe(false); });
  it("allows the school's Android exam app", () => { expect(isTelegramWebview({ ...base, userAgent: base.userAgent + " BHSSSExamApp/1.0", remembered: true })).toBe(false); });
  it("detects iPhone and iPad devices for iOS install steps", () => {
    expect(isIosDevice(iphone)).toBe(true);
    expect(isIosDevice(base.userAgent)).toBe(false);
  });
});

describe("Mandatory Android app update check", () => {
  it("parses the installed BHSSSExamApp version from the user agent", () => {
    expect(parseAppVersion(base.userAgent + " BHSSSExamApp/1.0")).toBe("1.0");
    expect(parseAppVersion(base.userAgent + " BHSSSExamApp/1.3")).toBe("1.3");
    expect(parseAppVersion(base.userAgent)).toBeNull();
  });
  it("blocks older app versions and allows current or newer versions", () => {
    expect(isOutdatedApp(base.userAgent + " BHSSSExamApp/1.0", "1.3")).toBe(true);
    expect(isOutdatedApp(base.userAgent + " BHSSSExamApp/1.2", "1.3")).toBe(true);
    expect(isOutdatedApp(base.userAgent + ` BHSSSExamApp/${CURRENT_APP_VERSION}`)).toBe(false);
    expect(isOutdatedApp(base.userAgent + " BHSSSExamApp/1.10", "1.3")).toBe(false);
    expect(isOutdatedApp(base.userAgent, "1.3")).toBe(false);
  });
});

describe("Mobile web exam block (laptops allowed)", () => {
  it("blocks Android phone browsers and iPhone Safari tabs from taking exams", () => {
    expect(isWebExamBlocked({ userAgent: base.userAgent, isStandalone: false })).toBe(true);
    expect(isWebExamBlocked({ userAgent: iphone, isStandalone: false })).toBe(true);
  });
  it("blocks iPadOS and phones using Request Desktop Site", () => {
    expect(isWebExamBlocked({ userAgent: macbook, isStandalone: false, maxTouchPoints: 5, minScreenPx: 768 })).toBe(true);
    expect(isWebExamBlocked({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0.0.0 Safari/537.36", isStandalone: false, maxTouchPoints: 5, minScreenPx: 390 })).toBe(true);
  });
  it("allows the Android exam app and installed iPhone home-screen app", () => {
    expect(isWebExamBlocked({ userAgent: base.userAgent + " BHSSSExamApp/1.3", isStandalone: false, maxTouchPoints: 5, minScreenPx: 390 })).toBe(false);
    expect(isWebExamBlocked({ userAgent: iphone, isStandalone: true, maxTouchPoints: 5, minScreenPx: 390 })).toBe(false);
  });
  it("allows Windows, Mac, and touchscreen laptops to take exams on the web", () => {
    expect(isWebExamBlocked({ userAgent: laptop, isStandalone: false, maxTouchPoints: 0, minScreenPx: 1080 })).toBe(false);
    expect(isWebExamBlocked({ userAgent: laptop, isStandalone: false, maxTouchPoints: 10, minScreenPx: 768 })).toBe(false);
    expect(isWebExamBlocked({ userAgent: macbook, isStandalone: false, maxTouchPoints: 0, minScreenPx: 900 })).toBe(false);
  });
});
