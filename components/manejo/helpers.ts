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
import { formatCurrency, formatPercent } from "@/lib/domain/format";
import { TREATMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { deriveTreatmentStatus, isFootAndMouth } from "@/lib/domain/status";
import type { SaleRow } from "@/lib/domain/movements";

/**
 * Action selectable in the register dialog: a health treatment, a weighing, an
 * inseminação, or one of the three that move the herd — the farm's compras,
 * vendas e transferências, which used to live on a screen of their own.
 */
export type ManejoAction =
  | TreatmentType
  | "weighing"
  | "insemination"
  | "transfer"
  | "sale"
  | "entry";

/** pt-BR label of each manejo action (treatment labels are canonical). */
export const MANEJO_ACTION_LABEL: Record<ManejoAction, string> = {
  ...TREATMENT_TYPE_LABEL,
  weighing: "Pesagem",
  insemination: "Inseminação",
  transfer: "Troca de lote",
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
  "insemination",
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
  return action !== "weighing" && action !== "insemination" && !MOVEMENT_ACTIONS.has(action);
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

/**
 * Subtitle line of a session that moves the herd: where to, for how much.
 * Shared by the chute screen and the venda record. A session the server
 * stripped of its values (a member without Financeiro) loses the money part
 * instead of printing "sem pre\u00e7o", which would read as a price nobody set.
 */
export function movementSubtitle(
  session: ManejoSession,
  lotName: string | undefined
): string {
  if (session.kind === "transfer") {
    return lotName ? `Destino: ${lotName}` : "Troca de lote";
  }
  const who = session.counterparty ? ` \u00b7 ${session.counterparty}` : "";
  if (session.valuesHidden) {
    return session.kind === "sale"
      ? `Venda${who}`
      : `Compra${lotName ? ` \u00b7 entra em ${lotName}` : ""}${who}`;
  }
  if (session.kind === "sale") {
    const price =
      session.pricePerArroba !== undefined
        ? `${formatCurrency(session.pricePerArroba)}/@${
            session.carcassYieldPct !== undefined
              ? ` \u00b7 rend. ${formatPercent(session.carcassYieldPct)}`
              : ""
          }`
        : session.totalAmountBrl !== undefined
          ? `${formatCurrency(session.totalAmountBrl)} pelo lote`
          : "sem pre\u00e7o";
    return `Venda \u00b7 ${price}${who}`;
  }
  const total =
    session.totalAmountBrl !== undefined ? formatCurrency(session.totalAmountBrl) : "sem valor";
  return `Compra \u00b7 ${total}${lotName ? ` \u00b7 entra em ${lotName}` : ""}${who}`;
}

/** Details page of a session: the chute while it runs, its record once closed. */
export function manejoDetailHref(sessionId: string): string {
  return `/manejo/${sessionId}`;
}

/** Page of the weighings saved on a day outside any session. */
export function looseWeighingsHref(dateIso: string): string {
  return `/manejo/avulso/pesagem/${dateIso}`;
}

/** Page of a group of treatments marked feito outside any session. */
export function calendarTreatmentsHref(treatmentId: string): string {
  return `/manejo/avulso/tratamento/${treatmentId}`;
}

/**
 * Which animals of a venda the romaneio lists: the ones actually sold, or the
 * whole lot the session opened with — the skipped ones included.
 */
export type SaleRowScope = "sold" | "lot";

/**
 * Rows of the venda record for a scope and a search term, in that order: the
 * search looks inside the chosen scope, so narrowing to the sold animals never
 * turns up a skipped one by its brinco.
 */
export function visibleSaleRows(
  rows: SaleRow[],
  scope: SaleRowScope,
  search: string
): SaleRow[] {
  const inScope = scope === "sold" ? rows.filter((row) => row.outcome === "done") : rows;
  const term = search.trim().toLowerCase();
  if (term === "") return inScope;
  return inScope.filter((row) => row.earTag.toLowerCase().includes(term));
}

/**
 * One history row: a manejo session of any kind, the treatments marked feito
 * outside a session on one day, or the weighings saved outside a session on
 * one day.
 */
export interface ManejoHistoryRow {
  key: string;
  date: string;
  kind: ManejoAction;
  name: string;
  /** Soft line under the name, for the rows no session wrote. */
  subtitle?: string;
  headCount: number;
  /** Person in charge, or the counterparty of a compra/venda. */
  responsible?: string;
  /**
   * Money of the row: the sanitary cost of the animals treated, or the traded
   * value of a compra/venda. Null when the row has no value at all.
   */
  amountBrl: number | null;
  /** The row's details page. */
  href: string;
  /** Session behind the row, when a manejo at the chute wrote it. */
  sessionId?: string;
  /** A treatment of the group, enough to delete every one booked with it. */
  treatmentId?: string;
  /** Animals of a pesagens avulsas row, whose readings of the day fall together. */
  earTags?: string[];
}

/** Money of a session row: a trade's value, or the plan's cost for each animal treated. */
function sessionAmount(session: ManejoSession, done: number): number | null {
  if (session.kind === "health") {
    const cost = session.treatment?.costBrl;
    return cost === undefined ? null : cost * done;
  }
  if (!isMovementAction(session.kind as ManejoAction)) return null;
  if (session.totalAmountBrl !== undefined) return session.totalAmountBrl;
  let value: number | null = null;
  for (const animal of session.animals) {
    if (animal.outcome === "done" && animal.amountBrl !== undefined) {
      value = (value ?? 0) + animal.amountBrl;
    }
  }
  return value;
}

/**
 * History of executed manejos, sorted by date desc: one row per session with an
 * animal done, whatever its kind; then what no session wrote — done treatments
 * grouped by (date, type, name) and weighings grouped by date. A pass records
 * the treatment and the weighing it wrote, which is how the two are told apart.
 */
export function manejoHistory(
  treatments: Treatment[],
  animals: Animal[],
  sessions: ManejoSession[] = []
): ManejoHistoryRow[] {
  const map = new Map<string, ManejoHistoryRow>();
  const sessionTreatments = new Set<string>();
  const sessionWeighings = new Set<number>();

  for (const session of sessions) {
    let done = 0;
    for (const animal of session.animals) {
      if (animal.treatmentId !== undefined) sessionTreatments.add(animal.treatmentId);
      if (animal.weighingId !== undefined) sessionWeighings.add(animal.weighingId);
      if (animal.outcome === "done") done += 1;
    }
    if (done === 0) continue;
    map.set(session.id, {
      key: session.id,
      date: session.date,
      kind: sessionKind(session),
      name: session.name,
      headCount: done,
      responsible:
        session.kind === "health" ? session.treatment?.responsible : session.counterparty,
      amountBrl: sessionAmount(session, done),
      href: manejoDetailHref(session.id),
      sessionId: session.id,
    });
  }

  for (const t of treatments) {
    if (t.status !== "done" || sessionTreatments.has(t.id)) continue;
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
        subtitle: "Calendário sanitário",
        headCount: 1,
        responsible: t.responsible,
        amountBrl: t.costBrl ?? null,
        href: calendarTreatmentsHref(t.id),
        treatmentId: t.id,
      });
    }
  }

  for (const animal of animals) {
    for (const w of animal.weighings) {
      if (w.id !== undefined && sessionWeighings.has(w.id)) continue;
      const key = `${w.date}|weighing`;
      const existing = map.get(key);
      if (existing) {
        existing.headCount += 1;
        existing.earTags?.push(animal.earTag);
      } else {
        map.set(key, {
          key,
          date: w.date,
          kind: "weighing",
          name: "Pesagens avulsas",
          subtitle: "fora do brete",
          headCount: 1,
          amountBrl: null,
          href: looseWeighingsHref(w.date),
          earTags: [animal.earTag],
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
  /** Touros of an inseminação, in the order picked; empty until one is. */
  semenBullIds: string[];
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
    | "totalAmountBrl"
    | "semenBullIds",
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
  if (fields.action === "insemination" && fields.semenBullIds.length === 0) {
    errors.semenBullIds = "Selecione ao menos um touro.";
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
    errors.earTags =
      fields.action === "insemination"
        ? "Selecione ao menos uma vaca."
        : "Selecione ao menos um animal.";
  }
  return errors;
}
