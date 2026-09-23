/**
 * Manejo domain rules — pure functions shared by the API services and tests.
 *
 * A manejo session applies its effects one animal at a time as the herd passes
 * the chute. This module computes WHICH effects one pass produces; persistence
 * (ids, transactions) stays in lib/api/domains/manejo/.
 */
import type { ManejoPassData } from "@/lib/store/useHerdStore";
import type {
  InactiveReason,
  ManejoKind,
  ManejoTreatmentPlan,
  Treatment,
  TreatmentStatus,
  Weighing,
} from "@/lib/types";
import { saleAmount } from "@/lib/domain/movements";
import { DEFAULT_CARCASS_YIELD_PCT } from "@/lib/domain/weights";
import { INACTIVE_REASON_LABEL } from "@/lib/domain/labels";

/** Treatment effect before persistence (no id / animal ref yet). */
export type TreatmentEffect = Omit<Treatment, "id" | "animalEarTag"> & {
  status: TreatmentStatus;
};

/**
 * Cobertura an inseminação pass records (no id / dam ref yet). Always an IATF,
 * and always with a registered bull: it takes one dose of that bull's semen.
 */
export interface BreedingEffect {
  date: string;
  type: "timedAI";
  semenBullId: string;
}

/** Effects one completed pass produces for one animal. */
export interface PassEffects {
  /** The applied treatment (status done, dated on the session), if planned. */
  treatment?: TreatmentEffect;
  /** The scheduled booster, when the plan sets nextDate. */
  booster?: TreatmentEffect;
  /** The captured weighing, when the session weighs and a weight was given. */
  weighing?: Weighing;
  /** Lot the animal lands in — a transferência moves it as it passes. */
  lotId?: string;
  /** The animal leaves the active herd — a venda, closed at the chute. */
  sold?: boolean;
  /** What this animal was worth (R$), when the sale is priced per arroba. */
  amountBrl?: number;
  /** Own rendimento of a boiada pass, when it differs from the padrão. */
  carcassYieldPct?: number;
  /** The IATF cobertura an inseminação records on the cow. */
  breeding?: BreedingEffect;
}

/** Session fields that drive the effects of a pass. */
export interface PassContext {
  date: string;
  kind: ManejoKind;
  weighing: boolean;
  treatment?: ManejoTreatmentPlan;
  /** Destination lot of a transfer session. */
  destinationLotId?: string;
  /** R$/@ of a sale priced by weight. */
  pricePerArroba?: number;
  /** Rendimento de carcaça (%) pricing the arrobas of a venda. */
  carcassYieldPct?: number;
  /** Touros of an inseminação; the first is used when the pass picks no bull. */
  semenBullIds?: string[];
}

/** Default session name when there is no sanitary plan (weighing-only). */
export const WEIGHING_SESSION_NAME = "Pesagem";

/** pt-BR name of the sessions that move or breed the herd instead of treating it. */
const KIND_SESSION_NAME: Partial<Record<ManejoKind, string>> = {
  transfer: "Troca de lote",
  sale: "Venda",
  entry: "Entrada",
  insemination: "Inseminação",
};

/** Name of a new session: the plan's name, or the default name of its kind. */
export function sessionName(
  treatment: ManejoTreatmentPlan | undefined,
  kind: ManejoKind = "health"
): string {
  return treatment?.name ?? KIND_SESSION_NAME[kind] ?? WEIGHING_SESSION_NAME;
}

/**
 * Note a baixa given at the brete leaves on the skipped pass: "Baixa · Morte ·
 * quebrou a perna no brete". The animal's record keeps the same reason and
 * words; the note is what the session's Pulados list shows.
 */
export function baixaPassNote(reason: InactiveReason, notes: string | undefined): string {
  const words = notes?.trim();
  const note = `Baixa · ${INACTIVE_REASON_LABEL[reason]}`;
  return words ? `${note} · ${words}` : note;
}

/**
 * Computes the effects of completing one animal in a session. Mirrors the
 * original store behavior: the applied treatment carries every plan field and
 * the session date; the booster repeats only type/name/withdrawal on nextDate;
 * the weight only counts when the session weighs.
 *
 * The movement kinds add the herd effects of the pass: a transferência lands
 * the animal in the destination lot, a venda takes it out of the active herd
 * and prices it by the weight just read on the scale (R$/@ × arrobas) — a sale
 * closed as one lot has no per-animal value, only the session total.
 *
 * An inseminação records one IATF cobertura per cow, with the bull picked at the
 * brete or, when the pass names none, the first touro of the session. Without
 * either there is no dose to take, so no cobertura.
 */
export function buildPassEffects(
  session: PassContext,
  data: ManejoPassData = {}
): PassEffects {
  const effects: PassEffects = {};

  if (session.treatment) {
    const { nextDate, ...plan } = session.treatment;
    effects.treatment = { ...plan, date: session.date, status: "done" };
    if (nextDate) {
      effects.booster = {
        type: plan.type,
        name: plan.name,
        withdrawalDays: plan.withdrawalDays,
        date: nextDate,
        status: "scheduled",
      };
    }
  }

  const weightKg = session.weighing ? data.weightKg : undefined;
  if (weightKg !== undefined) {
    effects.weighing = { date: session.date, weightKg };
  }

  if (session.kind === "transfer" && session.destinationLotId !== undefined) {
    effects.lotId = session.destinationLotId;
  }
  if (session.kind === "sale") {
    effects.sold = true;
    if (session.pricePerArroba !== undefined) {
      const padrao = session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT;
      const own = data.carcassYieldPct;
      if (own !== undefined && own !== padrao) effects.carcassYieldPct = own;
      if (weightKg !== undefined) {
        effects.amountBrl = saleAmount(weightKg, session.pricePerArroba, own ?? padrao);
      }
    }
  }
  if (session.kind === "insemination") {
    const semenBullId = data.semenBullId || session.semenBullIds?.[0];
    if (semenBullId) {
      effects.breeding = { date: session.date, type: "timedAI", semenBullId };
    }
  }

  return effects;
}
