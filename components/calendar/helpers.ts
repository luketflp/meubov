/**
 * Pure helpers for the Health Calendar: monthly grid (weeks starting on
 * Monday), pt-BR labels and local presentation aggregations.
 * Stateless functions; business rules live in lib/domain.
 */
import type {
  HealthProtocol,
  Treatment,
  TreatmentStatus,
  TreatmentType,
} from "@/lib/types";
import { parseISODate, toISO } from "@/lib/domain/dates";
import { TREATMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { deriveTreatmentStatus, isFootAndMouth } from "@/lib/domain/status";

export { isFootAndMouth };

/** Month shown in the calendar (month 1-12). */
export interface YearMonth {
  year: number;
  month: number;
}

/** Cell of the monthly grid; inMonth=false for neighbouring days (before/after). */
export interface CalendarDay {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** Aggregated chip of a grid day (count by type/status). */
export interface DayChip {
  key: string;
  label: string;
  status: TreatmentStatus;
  footAndMouth: boolean;
  quantity: number;
}

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

const WEEKDAY_NAMES = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

/** Grid header, Mon → Sun. */
export const WEEK_HEADER = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;

/** Short name of the type for the grid chips. */
export const TYPE_SHORT_NAME: Record<TreatmentType, string> = {
  vaccine: "Vacina",
  deworming: "Vermíf.",
  medication: "Medic.",
  exam: "Exame",
};

/** Full label of the treatment type (canonical from lib/domain). */
export const TYPE_LABEL = TREATMENT_TYPE_LABEL;

/** Extracts {year, month} from an ISO date. */
export function yearMonthOf(iso: string): YearMonth {
  const d = parseISODate(iso);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Month before the given one. */
export function previousMonth({ year, month }: YearMonth): YearMonth {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Month after the given one. */
export function nextMonth({ year, month }: YearMonth): YearMonth {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Long month label, e.g.: "julho de 2026". */
export function monthLabel({ year, month }: YearMonth): string {
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}

/** Weekday name of an ISO date, e.g.: "sexta-feira". */
export function weekdayName(iso: string): string {
  return WEEKDAY_NAMES[parseISODate(iso).getDay()];
}

/**
 * Weeks of the month for the grid: rows of 7 days (Mon → Sun), including the
 * neighbouring days of the start and end flagged with inMonth=false.
 */
export function weeksOfMonth({ year, month }: YearMonth): CalendarDay[][] {
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const cursor = new Date(year, month - 1, 1 - offset);
  const weeks: CalendarDay[][] = [];
  do {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push({
        iso: toISO(cursor),
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === month - 1 && cursor.getFullYear() === year,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === month - 1 && cursor.getFullYear() === year);
  return weeks;
}

/** Groups treatments by ISO date, with the days in ascending order. */
export function groupByDay(treatments: Treatment[]): [string, Treatment[]][] {
  const map = new Map<string, Treatment[]>();
  for (const t of treatments) {
    const list = map.get(t.date);
    if (list) list.push(t);
    else map.set(t.date, [t]);
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Aggregated chips of a day: count by type (foot-and-mouth apart) and derived status. */
export function dayChips(treatments: Treatment[], todayIso: string): DayChip[] {
  const map = new Map<string, DayChip>();
  for (const t of treatments) {
    const status = deriveTreatmentStatus(t, todayIso);
    const footAndMouth = isFootAndMouth(t);
    const key = `${footAndMouth ? "footAndMouth" : t.type}-${status}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      map.set(key, {
        key,
        label: footAndMouth ? "Aftosa" : TYPE_SHORT_NAME[t.type],
        status,
        footAndMouth,
        quantity: 1,
      });
    }
  }
  return [...map.values()];
}

/**
 * Next foot-and-mouth campaign month: last dose done + interval of the
 * mandatory protocol. Null if there is no protocol or history.
 */
export function nextFootAndMouthCampaign(
  treatments: Treatment[],
  protocols: HealthProtocol[]
): YearMonth | null {
  const protocol = protocols.find((p) => p.mandatory && isFootAndMouth(p));
  if (!protocol) return null;
  const done = treatments.filter((t) => isFootAndMouth(t) && t.status === "done");
  if (done.length === 0) return null;
  const last = done.reduce((max, t) => (t.date > max.date ? t : max));
  const d = parseISODate(last.date);
  const monthIndex = d.getMonth() + protocol.intervalMonths;
  return { year: d.getFullYear() + Math.floor(monthIndex / 12), month: (monthIndex % 12) + 1 };
}

/** "há 1 dia" / "há N dias" for overdue. */
export function daysAgoLabel(days: number): string {
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}
