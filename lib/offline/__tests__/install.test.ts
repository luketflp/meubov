import { describe, expect, it } from "vitest";
import { detectPlatform, shouldOfferInstall } from "@/lib/offline/install";

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

describe("detectPlatform", () => {
  it.each([
    ["Android Chrome", ANDROID_CHROME, "android"],
    ["iPhone Safari", IPHONE_SAFARI, "ios"],
    ["iPhone Chrome", IPHONE_CHROME, "ios"],
    ["desktop Chrome", DESKTOP_CHROME, "other"],
  ] as const)("%s", (_label, ua, platform) => {
    expect(detectPlatform(ua, false)).toEqual({ platform, installed: false });
  });

  it("marks the app opened from the home screen as installed", () => {
    expect(detectPlatform(ANDROID_CHROME, true)).toEqual({ platform: "android", installed: true });
  });
});

describe("shouldOfferInstall", () => {
  const today = "2026-09-25";

  it("offers Chrome's prompt on Android", () => {
    expect(shouldOfferInstall({ platform: "android", installed: false, dismissedAt: null, today })).toBe("prompt");
  });

  it("explains the share sheet on iOS", () => {
    expect(shouldOfferInstall({ platform: "ios", installed: false, dismissedAt: null, today })).toBe("ios-hint");
  });

  it("never offers on the desktop", () => {
    expect(shouldOfferInstall({ platform: "other", installed: false, dismissedAt: null, today })).toBeNull();
  });

  it("never offers once installed", () => {
    expect(shouldOfferInstall({ platform: "android", installed: true, dismissedAt: null, today })).toBeNull();
    expect(shouldOfferInstall({ platform: "ios", installed: true, dismissedAt: null, today })).toBeNull();
  });

  it("keeps quiet for 30 days after Agora não", () => {
    const offer = (dismissedAt: string) =>
      shouldOfferInstall({ platform: "android", installed: false, dismissedAt, today });
    expect(offer("2026-09-25")).toBeNull();
    expect(offer("2026-08-27")).toBeNull(); // 29 days
    expect(offer("2026-08-26")).toBe("prompt"); // 30 days
  });
});
