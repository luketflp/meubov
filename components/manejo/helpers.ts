/**
 * Pure helpers for the Manejo screen: pending-activity grouping (painel de
 * atividades), history sessions (one row per batch/day) and form validation.
 * Stateless functions; business rules live in lib/domain.
 */
import type { Animal, ManejoSession, Treatment, TreatmentType } from "@/lib/types";
import { daysBetween } from "@/lib/domain/dates";
import { TREATMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { deriveTreatmentStatus, isFootAndMouth } from "@/lib/domain/status";

/** Action selectable in the register dialog: a health treatment or a weighing. */
export type ManejoAction = TreatmentType | "weighing";

/** pt-BR label of each manejo action (treatment labels are canonical). */
export const MANEJO_ACTION_LABEL: Record<ManejoAction, string> = {
  ...TREATMENT_TYPE_LABEL,
  weighing: "Pesagem",
};

/** Ordered list of the actions offered by the register dialog. */
export const MANEJO_ACTION_LIST: readonly ManejoAction[] = [
  "vaccine",
  "deworming",
  "medication",
  "exam",
  "weighing",
];

/** Pending treatments grouped into one actionable activity (same day/type/name). */
export interface ManejoActivity {
  key: string;
  date: string;
  type: TreatmentType;
  name: string;
  status: "overdue" | "scheduled";
  footAndMouth: boolean;
  treatmentIds: string[];
  earTags: string[];
}

/**
 * Groups the non-done treatments by (date, type, name) into activities,
 * with the overdue ones first and then the scheduled ones by ascending date.
 */
export function pendingActivities(treatments: Treatment[], todayIso: string): ManejoActivity[] {
  const map = new Map<string, ManejoActivity>();
  for (const t of treatments) {
    const status = deriveTreatmentStatus(t, todayIso);
    if (status === "done") continue;
    const key = `${t.date}|${t.type}|${t.name}`;
    const existing = map.get(key);
    if (existing) {
      existing.treatmentIds.push(t.id);
      existing.earTags.push(t.animalEarTag);
    } else {
      map.set(key, {
        key,
        date: t.date,
        type: t.type,
        name: t.name,
        status,
        footAndMouth: isFootAndMouth(t),
        treatmentIds: [t.id],
        earTags: [t.animalEarTag],
      });
    }
  }
  const order = (a: ManejoActivity): number => (a.status === "overdue" ? 0 : 1);
  return [...map.values()].sort(
    (a, b) => order(a) - order(b) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  );
}

/** "atrasada há N dias" / "hoje" / "em N dias" for an activity. */
export function activityDueLabel(activity: ManejoActivity, todayIso: string): string {
  const days = daysBetween(activity.date, todayIso);
  const suffix = activity.type === "exam" ? "atrasado" : "atrasada";
  if (days > 0) return `${suffix} há ${days === 1 ? "1 dia" : `${days} dias`}`;
  if (days === 0) return "hoje";
  const ahead = -days;
  return `em ${ahead === 1 ? "1 dia" : `${ahead} dias`}`;
}

/** One history row: a batch of done treatments or the weighings of one day. */
export interface ManejoHistoryRow {
  key: string;
  date: string;
  kind: ManejoAction;
  name: string;
  headCount: number;
  responsible?: string;
  /** Sum of the per-animal costs, or null when no treatment has a cost. */
  totalCostBrl: number | null;
}

/**
 * History of executed manejos, one row per batch: done treatments grouped by
 * (date, type, name) plus the weighings grouped by date, sorted by date desc.
 */
export function manejoHistory(treatments: Treatment[], animals: Animal[]): ManejoHistoryRow[] {
  const map = new Map<string, ManejoHistoryRow>();

  for (const t of treatments) {
    if (t.status !== "done") continue;
    const key = `${t.date}|${t.type}|${t.name}`;
    const existing = map.get(key);
    if (existing) {
      existing.headCount += 1;
      if (t.costBrl !== undefined) {
        existing.totalCostBrl = (existing.totalCostBrl ?? 0) + t.costBrl;
      }
    } else {
      map.set(key, {
        key,
        date: t.date,
        kind: t.type,
        name: t.name,
        headCount: 1,
        responsible: t.responsible,
        totalCostBrl: t.costBrl ?? null,
      });
    }
  }

  for (const animal of animals) {
    for (const w of animal.weighings) {
      const key = `${w.date}|weighing`;
      const existing = map.get(key);
      if (existing) {
        existing.headCount += 1;
      } else {
        map.set(key, {
          key,
          date: w.date,
          kind: "weighing",
          name: "Pesagem",
          headCount: 1,
          totalCostBrl: null,
        });
      }
    }
  }

  return [...map.values()].sort((a, b) =>
    a.date === b.date ? a.name.localeCompare(b.name, "pt-BR") : a.date < b.date ? 1 : -1
  );
}

/** Progress summary of a manejo session (the chute line state). */
export interface ManejoProgress {
  total: number;
  done: number;
  skipped: number;
  pending: number;
  /** Handled share (done + skipped) over total, 0-100. */
  pct: number;
}

/** Counts the session outcomes into a progress summary. */
export function sessionProgress(session: ManejoSession): ManejoProgress {
  let done = 0;
  let skipped = 0;
  for (const a of session.animals) {
    if (a.outcome === "done") done += 1;
    else if (a.outcome === "skipped") skipped += 1;
  }
  const total = session.animals.length;
  const handled = done + skipped;
  return {
    total,
    done,
    skipped,
    pending: total - handled,
    pct: total === 0 ? 0 : Math.round((handled / total) * 100),
  };
}

/** Action kind of a session, for pills and filters. */
export function sessionKind(session: ManejoSession): ManejoAction {
  return session.treatment ? session.treatment.type : "weighing";
}

/** Raw state of the start-manejo form (numeric fields as input text). */
export interface ManejoFields {
  action: ManejoAction;
  date: string;
  name: string;
  dose: string;
  withdrawalDays: string;
  responsible: string;
  costBrl: string;
  nextDate: string;
  notes: string;
  /** Also weigh each animal during the same chute pass (sanitary actions). */
  weighAlso: boolean;
  earTags: string[];
}

export type ManejoErrors = Partial<
  Record<"date" | "name" | "withdrawalDays" | "costBrl" | "nextDate" | "earTags", string>
>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True when the session captures one weight per animal at the chute. */
export function sessionWeighs(fields: Pick<ManejoFields, "action" | "weighAlso">): boolean {
  return fields.action === "weighing" || fields.weighAlso;
}

/** Pure form validation; returns pt-BR messages per field. */
export function validateManejo(fields: ManejoFields): ManejoErrors {
  const errors: ManejoErrors = {};
  const sanitary = fields.action !== "weighing";

  if (!ISO_DATE_PATTERN.test(fields.date)) {
    errors.date = "Informe a data do manejo.";
  }
  if (sanitary) {
    if (fields.name.trim() === "") {
      errors.name = "Informe o nome do produto ou procedimento.";
    }
    const withdrawal = Number(fields.withdrawalDays);
    if (fields.withdrawalDays.trim() === "" || !Number.isInteger(withdrawal) || withdrawal < 0) {
      errors.withdrawalDays = "Informe a carência em dias (0 quando não houver).";
    }
    if (fields.costBrl.trim() !== "") {
      const cost = Number(fields.costBrl);
      if (!Number.isFinite(cost) || cost < 0) {
        errors.costBrl = "Informe um custo válido por animal.";
      }
    }
    if (fields.nextDate !== "") {
      if (!ISO_DATE_PATTERN.test(fields.nextDate)) {
        errors.nextDate = "Informe uma data válida para o reforço.";
      } else if (fields.nextDate <= fields.date) {
        errors.nextDate = "O reforço deve ser depois da data do manejo.";
      }
    }
  }
  if (fields.earTags.length === 0) {
    errors.earTags = "Selecione ao menos um animal.";
  }
  return errors;
}
