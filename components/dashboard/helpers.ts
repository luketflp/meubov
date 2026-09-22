/**
 * LOCAL pure helpers of the Dashboard: composition/presentation specific to
 * this screen. No new business rule — the shared functions (isFootAndMouth,
 * scheduledTreatmentsInWindow, herdAverageAdg) live in lib/domain.
 */
import type { Category, Invernada, TreatmentType } from "@/lib/types";
import { pluralCategory } from "@/lib/domain/labels";
import { daysBetween, parseISODate } from "@/lib/domain/dates";

/**
 * Mini-summary by category, sorted by descending count and omitting zeros,
 * e.g.: "13 vacas · 9 bois · 8 bezerros".
 */
export function summaryByCategory(count: Record<Category, number>): string {
  return (Object.entries(count) as [Category, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, n]) => `${n} ${pluralCategory(category, n)}`)
    .join(" · ");
}

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** The day as the Painel's header reads it, e.g.: "Terça, 22 de setembro". */
export function longDateLabel(iso: string): string {
  const date = parseISODate(iso);
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;
}

/** Day and month of an ISO date, e.g.: "05/09". */
export function dayMonth(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

const inDays = (days: number): string => (days === 1 ? "1 dia" : `${days} dias`);

/**
 * When a treatment batch is due, as its pill reads: "Atrasada há 6 dias",
 * "Hoje" or "25/09 · em 3 dias". An exame is masculine ("Atrasado").
 */
export function treatmentDueText(date: string, type: TreatmentType, todayIso: string): string {
  const late = daysBetween(date, todayIso);
  if (late > 0) return `${type === "exam" ? "Atrasado" : "Atrasada"} há ${inDays(late)}`;
  if (late === 0) return "Hoje";
  return `${dayMonth(date)} · em ${inDays(-late)}`;
}

/** Ear tags as a sentence, "4471, 3982 e 5120"; past `max`, "… e mais N". */
export function earTagList(earTags: string[], max = 3): string {
  if (earTags.length > max) {
    return `${earTags.slice(0, max).join(", ")} e mais ${earTags.length - max}`;
  }
  if (earTags.length <= 1) return earTags[0] ?? "";
  return `${earTags.slice(0, -1).join(", ")} e ${earTags[earTags.length - 1]}`;
}

/** Where a run of calvings starts: "a partir de hoje", "de amanhã" or "de 26/09". */
export function fromDayText(date: string, todayIso: string): string {
  const ahead = daysBetween(todayIso, date);
  if (ahead === 0) return "a partir de hoje";
  if (ahead === 1) return "a partir de amanhã";
  return `a partir de ${dayMonth(date)}`;
}

/** An invernada in few words, e.g.: "Inv. 01 Baixada". */
export function invernadaLabel(invernada: Pick<Invernada, "code" | "name">): string {
  return invernada.name ? `Inv. ${invernada.code} ${invernada.name}` : `Inv. ${invernada.code}`;
}
