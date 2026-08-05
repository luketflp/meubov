/**
 * Pure helpers for the Manejo screen: pending-activity grouping (painel de
 * atividades), history sessions (one row per batch/day) and form validation.
 * Stateless functions; business rules live in lib/domain.
 */
import type {
  Animal,
  ManejoKind,
  ManejoSession,
  Treatment,
  TreatmentType,
} from "@/lib/types";
import { daysBetween } from "@/lib/domain/dates";
import { TREATMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { deriveTreatmentStatus, isFootAndMouth } from "@/lib/domain/status";

/**
 * Action selectable in the register dialog: a health treatment, a weighing, or
 * one of the three that move the herd — the farm's compras, vendas e
 * transferências, which used to live on a screen of their own.
 */
export type ManejoAction = TreatmentType | "weighing" | "transfer" | "sale" | "entry";

/** pt-BR label of each manejo action (treatment labels are canonical). */
export const MANEJO_ACTION_LABEL: Record<ManejoAction, string> = {
  ...TREATMENT_TYPE_LABEL,
  weighing: "Pesagem",
  transfer: "Transferência",
  sale: "Venda",
  entry: "Entrada (compra)",
};

/** Ordered list of the actions offered by the register dialog. */
export const MANEJO_ACTION_LIST: readonly ManejoAction[] = [
  "vaccine",
  "deworming",
  "medication",
  "exam",
  "weighing",
  "transfer",
  "sale",
  "entry",
];

/** The actions that move the herd instead of only recording its history. */
const MOVEMENT_ACTIONS = new Set<ManejoAction>(["transfer", "sale", "entry"]);

/** True when the action moves animals between lots, or in/out of the farm. */
export function isMovementAction(action: ManejoAction): boolean {
  return MOVEMENT_ACTIONS.has(action);
}

/** True when the action applies a sanitary treatment (the plan fields show). */
export function isSanitaryAction(action: ManejoAction): boolean {
  return action !== "weighing" && !MOVEMENT_ACTIONS.has(action);
}

/** Session kind stored for an action: every treatment type is one `health`. */
export function actionKind(action: ManejoAction): ManejoKind {
  return isSanitaryAction(action) ? "health" : (action as ManejoKind);
}

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

/** One history row: a batch of done treatments, a day's weighings, or a trade. */
export interface ManejoHistoryRow {
  key: string;
  date: string;
  kind: ManejoAction;
  name: string;
  headCount: number;
  /** Person in charge, or the counterparty of a compra/venda. */
  responsible?: string;
  /**
   * Money of the row: the sum of the per-animal sanitary costs, or the traded
   * value of a compra/venda. Null when the row has no value at all.
   */
  amountBrl: number | null;
}

/**
 * History of executed manejos, one row per batch: done treatments grouped by
 * (date, type, name), the weighings grouped by date, and one row per session
 * that moved the herd (transferência, venda, entrada), sorted by date desc.
 */
export function manejoHistory(
  treatments: Treatment[],
  animals: Animal[],
  sessions: ManejoSession[] = []
): ManejoHistoryRow[] {
  const map = new Map<string, ManejoHistoryRow>();

  for (const t of treatments) {
    if (t.status !== "done") continue;
    const key = `${t.date}|${t.type}|${t.name}`;
    const existing = map.get(key);
    if (existing) {
      existing.headCount += 1;
      if (t.costBrl !== undefined) {
        existing.amountBrl = (existing.amountBrl ?? 0) + t.costBrl;
      }
    } else {
      map.set(key, {
        key,
        date: t.date,
        kind: t.type,
        name: t.name,
        headCount: 1,
        responsible: t.responsible,
        amountBrl: t.costBrl ?? null,
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
          amountBrl: null,
        });
      }
    }
  }

  for (const session of sessions) {
    if (!isMovementAction(session.kind as ManejoAction)) continue;
    const handled = session.animals.filter((a) => a.outcome === "done");
    if (handled.length === 0) continue;
    let value = session.totalAmountBrl ?? null;
    if (value === null) {
      for (const animal of handled) {
        if (animal.amountBrl !== undefined) value = (value ?? 0) + animal.amountBrl;
      }
    }
    map.set(session.id, {
      key: session.id,
      date: session.date,
      kind: session.kind as ManejoAction,
      name: session.name,
      headCount: handled.length,
      responsible: session.counterparty,
      amountBrl: value,
    });
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
  if (session.kind === "health") return session.treatment?.type ?? "weighing";
  return session.kind;
}

/** How a venda is priced: by the weight at the chute, or as one closed deal. */
export type SalePricing = "perArroba" | "total";

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
  /** Lot every animal lands in — transferência and entrada. */
  destinationLotId: string;
  /** Buyer (venda) or seller (entrada). */
  counterparty: string;
  /** Venda: priced per arroba, or a closed price for the whole batch. */
  pricing: SalePricing;
  /** R$/@ paid for each arroba (venda priced by weight). */
  pricePerArroba: string;
  /** Closed value of the batch (venda) or the purchase total (entrada). */
  totalAmountBrl: string;
}

export type ManejoErrors = Partial<
  Record<
    | "date"
    | "name"
    | "withdrawalDays"
    | "costBrl"
    | "nextDate"
    | "earTags"
    | "destinationLotId"
    | "pricePerArroba"
    | "totalAmountBrl",
    string
  >
>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True when the session captures one weight per animal at the chute. A venda
 * priced per arroba always weighs: the scale is what sets the price.
 */
export function sessionWeighs(
  fields: Pick<ManejoFields, "action" | "weighAlso" | "pricing">
): boolean {
  if (fields.action === "weighing") return true;
  if (fields.action === "sale") return fields.pricing === "perArroba" || fields.weighAlso;
  return fields.weighAlso;
}

/** Positive number typed in a form field ("310", "1.234,50" is not accepted). */
const positiveNumber = (raw: string): number | null => {
  const value = Number(raw.replace(",", "."));
  return raw.trim() === "" || !Number.isFinite(value) || value <= 0 ? null : value;
};

/** Pure form validation; returns pt-BR messages per field. */
export function validateManejo(fields: ManejoFields): ManejoErrors {
  const errors: ManejoErrors = {};
  const sanitary = isSanitaryAction(fields.action);

  if (!ISO_DATE_PATTERN.test(fields.date)) {
    errors.date = "Informe a data do manejo.";
  }

  if (fields.action === "transfer" || fields.action === "entry") {
    if (fields.destinationLotId === "") {
      errors.destinationLotId = "Selecione o lote de destino.";
    }
  }
  if (fields.action === "sale") {
    if (fields.pricing === "perArroba") {
      if (positiveNumber(fields.pricePerArroba) === null) {
        errors.pricePerArroba = "Informe o preço por arroba (R$/@).";
      }
    } else if (positiveNumber(fields.totalAmountBrl) === null) {
      errors.totalAmountBrl = "Informe o valor total da venda.";
    }
  }
  if (fields.action === "entry" && positiveNumber(fields.totalAmountBrl) === null) {
    errors.totalAmountBrl = "Informe o valor total da compra.";
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
  // An entrada opens empty: its animals are registered as the truck unloads.
  if (fields.action !== "entry" && fields.earTags.length === 0) {
    errors.earTags = "Selecione ao menos um animal.";
  }
  return errors;
}
