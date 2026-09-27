/**
 * When the Painel invites the user to install MeuBov on the phone. Android
 * (Chrome) has its own install prompt; iOS has none, so the card only says
 * where Safari keeps it. The desktop never sees the card, an installed app
 * never again, and "Agora não" hides it for 30 days.
 */
import { daysBetween } from "@/lib/domain/dates";

export type InstallPlatform = "android" | "ios" | "other";

export interface InstallDevice {
  platform: InstallPlatform;
  /** Opened from the home screen (display-mode standalone, or iOS `navigator.standalone`). */
  installed: boolean;
}

export type InstallOffer = "prompt" | "ios-hint";

/** Days "Agora não" keeps the card away. */
export const INSTALL_SNOOZE_DAYS = 30;

export function detectPlatform(ua: string, standalone: boolean): InstallDevice {
  const platform: InstallPlatform = /iPhone|iPad|iPod/.test(ua)
    ? "ios"
    : /Android/i.test(ua)
      ? "android"
      : "other";
  return { platform, installed: standalone };
}

export function shouldOfferInstall({
  platform,
  installed,
  dismissedAt,
  today,
}: InstallDevice & { dismissedAt: string | null; today: string }): InstallOffer | null {
  if (installed || platform === "other") return null;
  if (dismissedAt !== null && daysBetween(dismissedAt, today) < INSTALL_SNOOZE_DAYS) return null;
  return platform === "android" ? "prompt" : "ios-hint";
}
