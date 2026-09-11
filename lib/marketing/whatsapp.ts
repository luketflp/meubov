/**
 * WhatsApp is where the produtor decides, so the homepage offers it beside
 * every primary action — but only when a number is configured. Without
 * NEXT_PUBLIC_WHATSAPP_NUMBER the buttons are not rendered at all.
 */
import type { BillingInterval } from "@/lib/domain/plans";

/** Digits only, with country code, e.g. "5534999990000". Read at build time. */
export const WHATSAPP_NUMBER: string | undefined = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

/** wa.me link with the prefilled text, or null when there is no usable number. */
export function whatsappLink(number: string | undefined, text: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (digits === "") return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const INTERVAL_LABEL: Record<BillingInterval, string> = { month: "mensal", year: "anual" };

/** The prefilled messages, one per entry point. */
export const WHATSAPP_TEXTS = {
  hero: "Olá! Quero saber mais sobre o MeuBov.",
  consultor: "Olá! Quero conversar sobre o plano Consultor do MeuBov.",
  checkout: (planName: string, interval: BillingInterval): string =>
    `Olá! Quero assinar o plano ${planName} (${INTERVAL_LABEL[interval]}) do MeuBov.`,
} as const;
