/**
 * Manejo domain rules — pure functions shared by the API services and tests.
 *
 * A manejo session applies its effects one animal at a time as the herd passes
 * the chute. This module computes WHICH effects one pass produces; persistence
 * (ids, transactions) stays in lib/api/services/manejo.ts.
 */
import type { ManejoPassData } from "@/lib/store/useHerdStore";
import type {
  ManejoTreatmentPlan,
  Treatment,
  TreatmentStatus,
  Weighing,
} from "@/lib/types";

/** Treatment effect before persistence (no id / animal ref yet). */
export type TreatmentEffect = Omit<Treatment, "id" | "animalEarTag"> & {
  status: TreatmentStatus;
};

/** Effects one completed pass produces for one animal. */
export interface PassEffects {
  /** The applied treatment (status done, dated on the session), if planned. */
  treatment?: TreatmentEffect;
  /** The scheduled booster, when the plan sets nextDate. */
  booster?: TreatmentEffect;
  /** The captured weighing, when the session weighs and a weight was given. */
  weighing?: Weighing;
}

/** Session fields that drive the effects of a pass. */
export interface PassContext {
  date: string;
  weighing: boolean;
  treatment?: ManejoTreatmentPlan;
}

/** Default session name when there is no sanitary plan (weighing-only). */
export const WEIGHING_SESSION_NAME = "Pesagem";

/** Name of a new session: the plan's name, or the weighing-only default. */
export function sessionName(treatment: ManejoTreatmentPlan | undefined): string {
  return treatment ? treatment.name : WEIGHING_SESSION_NAME;
}

/**
 * Computes the effects of completing one animal in a session. Mirrors the
 * original store behavior: the applied treatment carries every plan field and
 * the session date; the booster repeats only type/name/withdrawal on nextDate;
 * the weight only counts when the session weighs.
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

  return effects;
}
