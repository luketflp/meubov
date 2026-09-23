/**
 * Money is its own permission: a member without Financeiro sees the herd and
 * runs the chute, but no R$ value reaches their browser. These helpers strip
 * the values from what the API returns and decide which writes touch money.
 *
 * `carcassYieldPct` is a percentage, not money, and stays.
 */
import type {
  HerdData,
  ManejoKind,
  ManejoSession,
  ManejoSessionAnimal,
  Movement,
  SemenBull,
  SemenPurchase,
  Treatment,
} from "@/lib/types";
import { can, type Permissions } from "@/lib/domain/permissions";

/** A copy of `value` without `key`. */
function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  Reflect.deleteProperty(copy, key);
  return copy;
}

export interface SessionMoneyFacts {
  pricePerArroba?: number | null;
  totalAmountBrl?: number | null;
  planCostBrl?: number | null;
}

/** True when a session row or body carries any BRL value. */
export function hasMoney(facts: SessionMoneyFacts): boolean {
  return [facts.pricePerArroba, facts.totalAmountBrl, facts.planCostBrl].some(
    (value) => value !== undefined && value !== null
  );
}

/** Client-side twin of the server's delete rule, redacted sessions included. */
export function sessionHasMoney(session: ManejoSession): boolean {
  return (
    session.valuesHidden === true ||
    hasMoney({
      pricePerArroba: session.pricePerArroba,
      totalAmountBrl: session.totalAmountBrl,
      planCostBrl: session.treatment?.costBrl,
    })
  );
}

/** A venda or entrada is money by nature; any other manejo only when it prices something. */
export function startNeedsFinance(body: {
  kind: ManejoKind;
  pricePerArroba?: number;
  totalAmountBrl?: number;
  treatment?: { costBrl?: number };
}): boolean {
  return (
    body.kind === "sale" ||
    body.kind === "entry" ||
    hasMoney({
      pricePerArroba: body.pricePerArroba,
      totalAmountBrl: body.totalAmountBrl,
      planCostBrl: body.treatment?.costBrl,
    })
  );
}

export function canDeleteSession(permissions: Permissions, session: ManejoSession): boolean {
  return (
    can(permissions, "manejo", "edit") &&
    (!sessionHasMoney(session) || can(permissions, "finance", "edit"))
  );
}

/**
 * Who may delete a row of the manejo history, through the area that wrote it:
 * a session through Manejo (plus Financeiro when it has money), a group of
 * calendar treatments through Sanitário, a day of loose weighings through Rebanho.
 */
export function canDeleteManejo(
  permissions: Permissions,
  target: { kind: "session"; session: ManejoSession } | { kind: "treatments" | "weighings" }
): boolean {
  if (target.kind === "session") return canDeleteSession(permissions, target.session);
  return can(permissions, target.kind === "treatments" ? "sanitary" : "herd", "edit");
}

export function redactTreatment(treatment: Treatment): Treatment {
  return treatment.costBrl === undefined ? treatment : without(treatment, "costBrl");
}

function redactPassAnimal(animal: ManejoSessionAnimal): ManejoSessionAnimal {
  return animal.amountBrl === undefined ? animal : without(animal, "amountBrl");
}

function redactMovement(movement: Movement): Movement {
  return movement.amountBrl === undefined ? movement : without(movement, "amountBrl");
}

export function redactManejoSession(session: ManejoSession): ManejoSession {
  const hidden =
    session.pricePerArroba !== undefined ||
    session.totalAmountBrl !== undefined ||
    session.treatment?.costBrl !== undefined ||
    session.animals.some((animal) => animal.amountBrl !== undefined);
  if (!hidden) return session;

  const bare = without(without(session, "pricePerArroba"), "totalAmountBrl");
  return {
    ...bare,
    animals: session.animals.map(redactPassAnimal),
    ...(session.treatment ? { treatment: without(session.treatment, "costBrl") } : {}),
    valuesHidden: true,
  };
}

/** A chute pass as the complete route answers it. */
export function redactPass<T extends { entry: ManejoSessionAnimal; treatments: Treatment[] }>(
  result: T
): T {
  return {
    ...result,
    entry: redactPassAnimal(result.entry),
    treatments: result.treatments.map(redactTreatment),
  };
}

function redactSemenPurchase(purchase: SemenPurchase): SemenPurchase {
  return purchase.totalBrl === undefined ? purchase : without(purchase, "totalBrl");
}

/**
 * A semen bull without the valor total of its purchases. The doses stay: the
 * stock is not money, but its average cost per dose is, and it goes with them.
 */
export function redactSemenBull(bull: SemenBull): SemenBull {
  return { ...bull, purchases: bull.purchases.map(redactSemenPurchase) };
}

export function redactHerdMoney(data: HerdData): HerdData {
  return {
    ...data,
    treatments: data.treatments.map(redactTreatment),
    manejoSessions: data.manejoSessions.map(redactManejoSession),
    movements: data.movements.map(redactMovement),
    semenBulls: data.semenBulls.map(redactSemenBull),
    expenses: [],
  };
}
