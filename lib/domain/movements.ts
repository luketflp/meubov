/**
 * Movements derived from manejo sessions — pure functions shared by the API
 * read path, the screens and the tests.
 *
 * A compra, venda or transferência is not typed by hand anymore: it is a manejo
 * session whose animals passed the chute one by one. The ledger the financial
 * screens consume (`Movement`) is therefore a PROJECTION of those sessions —
 * head count and category always come from real animals, never from a form
 * field. Legacy rows written by the old screen keep flowing through
 * `lib/api/services/mappers.ts#toMovement` untouched.
 */
import type {
  Animal,
  Category,
  ManejoKind,
  ManejoSession,
  Movement,
  MovementType,
} from "@/lib/types";
import {
  carcassArrobas,
  carcassKg,
  DEFAULT_CARCASS_YIELD_PCT,
  KG_PER_ARROBA_CARCASS,
  kgToArroba,
} from "@/lib/domain/weights";

/** Origin/destination outside the farm, when no counterparty was named. */
export const EXTERNAL = "Externo";

/** Session kinds that move the herd in or out of a lot (and the ledger). */
const MOVEMENT_TYPE_BY_KIND: Partial<Record<ManejoKind, MovementType>> = {
  transfer: "transfer",
  sale: "sale",
  entry: "purchase",
};

/** True when the session's passes produce an entry/exit ledger row. */
export function isMovementKind(kind: ManejoKind): boolean {
  return MOVEMENT_TYPE_BY_KIND[kind] !== undefined;
}

/**
 * Value of one animal in a sale priced per arroba: R$/@ × the carcass arrobas
 * of its chute weight at the session's rendimento de carcaça. Without a yield
 * the default 50% applies — exactly the old live kg/30 arroba.
 */
export function saleAmount(
  weightKg: number,
  pricePerArroba: number,
  carcassYieldPct: number = DEFAULT_CARCASS_YIELD_PCT
): number {
  return carcassArrobas(weightKg, carcassYieldPct) * pricePerArroba;
}

/** FUNRURAL withheld on the gross value of a venda (pessoa física). */
export const FUNRURAL_RATE = 0.015;

/**
 * Final numbers of a venda: the batch totals and the per-head averages shown
 * when the chute line ends (the frigorífico's romaneio arithmetic).
 *
 * Weight figures exist only when passes captured weights; money figures exist
 * when the sale was priced (per arroba or as one closed lot). Everything is
 * computed over the animals that actually passed (outcome done).
 */
export interface SaleSummary {
  /** Animals that passed the chute (sold). */
  heads: number;
  /** How many of them had a weight captured. */
  weighedHeads: number;
  totalWeightKg: number | null;
  /** Média cb/kg: live weight per weighed head. */
  avgWeightKg: number | null;
  /** Média @ viva per weighed head (live kg / 30). */
  avgLiveArrobas: number | null;
  /** Yield the money math used, when the sale prices the carcass. */
  carcassYieldPct: number | null;
  /** Peso líquido: total carcass weight at that yield. */
  totalCarcassKg: number | null;
  /** Total @ morta (carcass kg / 15). */
  totalCarcassArrobas: number | null;
  /** Média @ morta per weighed head. */
  avgCarcassArrobas: number | null;
  grossBrl: number | null;
  funruralBrl: number | null;
  netBrl: number | null;
  /** R$/CB over the gross value. */
  grossPerHeadBrl: number | null;
  /** R$/CB after FUNRURAL. */
  netPerHeadBrl: number | null;
}

/** Summary of a sale session, or null when no animal has passed yet. */
export function saleSummary(session: ManejoSession): SaleSummary | null {
  if (session.kind !== "sale") return null;
  const done = session.animals.filter((a) => a.outcome === "done");
  if (done.length === 0) return null;

  const weighed = done.filter((a) => a.weightKg !== undefined);
  const totalWeightKg =
    weighed.length === 0
      ? null
      : weighed.reduce((sum, a) => sum + (a.weightKg ?? 0), 0);

  // Carcass figures only make sense when the sale priced the carcass: a yield
  // chosen for the session, applied over the weights read at the chute.
  const yieldPct =
    session.pricePerArroba !== undefined
      ? (session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT)
      : null;
  const totalCarcassKg =
    yieldPct === null || totalWeightKg === null ? null : carcassKg(totalWeightKg, yieldPct);

  let grossBrl: number | null = session.totalAmountBrl ?? null;
  if (grossBrl === null) {
    let sum = 0;
    let priced = false;
    for (const a of done) {
      if (a.amountBrl !== undefined) {
        sum += a.amountBrl;
        priced = true;
      }
    }
    if (priced) grossBrl = sum;
  }
  const funruralBrl = grossBrl === null ? null : grossBrl * FUNRURAL_RATE;
  const netBrl = grossBrl === null || funruralBrl === null ? null : grossBrl - funruralBrl;

  const perWeighed = (total: number | null): number | null =>
    total === null ? null : total / weighed.length;
  return {
    heads: done.length,
    weighedHeads: weighed.length,
    totalWeightKg,
    avgWeightKg: perWeighed(totalWeightKg),
    avgLiveArrobas: totalWeightKg === null ? null : kgToArroba(totalWeightKg) / weighed.length,
    carcassYieldPct: yieldPct,
    totalCarcassKg,
    totalCarcassArrobas:
      totalCarcassKg === null ? null : totalCarcassKg / KG_PER_ARROBA_CARCASS,
    avgCarcassArrobas:
      totalCarcassKg === null ? null : totalCarcassKg / KG_PER_ARROBA_CARCASS / weighed.length,
    grossBrl,
    funruralBrl,
    netBrl,
    grossPerHeadBrl: grossBrl === null ? null : grossBrl / done.length,
    netPerHeadBrl: netBrl === null ? null : netBrl / done.length,
  };
}

/** Most frequent category among the animals (first one wins a tie). */
export function predominantCategory(animals: Animal[]): Category | undefined {
  const counts = new Map<Category, number>();
  for (const a of animals) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  let best: Category | undefined;
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

/** Lot name of an id, falling back to the raw id when the lot is gone. */
const lotName = (lotId: string | undefined, names: Map<string, string>): string =>
  lotId === undefined ? EXTERNAL : (names.get(lotId) ?? lotId);

/**
 * Where the animals came from: the lot they were in before the pass. Sessions
 * record it per animal (`previousLotId`), so a transfer keeps naming its origin
 * even after every animal has already moved on.
 */
function originLot(session: ManejoSession, names: Map<string, string>): string {
  for (const entry of session.animals) {
    if (entry.outcome === "done" && entry.previousLotId !== undefined) {
      return lotName(entry.previousLotId, names);
    }
  }
  return EXTERNAL;
}

/**
 * Projects one manejo session into the ledger row it represents. Returns null
 * for sessions that move nothing (health, weighing) and for movement sessions
 * where no animal has passed the chute yet — an empty movement is noise, and
 * the row appears as soon as the first animal is handled.
 *
 * The value is the closed price when the batch was traded as one lot, otherwise
 * the sum of what each animal was worth (R$/@ × its weight).
 */
export function sessionToMovement(
  session: ManejoSession,
  animalsByEarTag: Map<string, Animal>,
  lotNames: Map<string, string>
): Movement | null {
  const type = MOVEMENT_TYPE_BY_KIND[session.kind];
  if (type === undefined) return null;

  const handled = session.animals.filter((a) => a.outcome === "done");
  if (handled.length === 0) return null;

  const animals = handled
    .map((entry) => animalsByEarTag.get(entry.earTag))
    .filter((a): a is Animal => a !== undefined);

  let amountBrl = session.totalAmountBrl;
  if (amountBrl === undefined) {
    let sum = 0;
    let priced = false;
    for (const entry of handled) {
      if (entry.amountBrl !== undefined) {
        sum += entry.amountBrl;
        priced = true;
      }
    }
    if (priced) amountBrl = sum;
  }

  const counterparty = session.counterparty?.trim();
  const outside = counterparty === undefined || counterparty === "" ? EXTERNAL : counterparty;

  return {
    id: session.id,
    type,
    date: session.date,
    quantity: handled.length,
    category: predominantCategory(animals),
    origin: session.kind === "entry" ? outside : originLot(session, lotNames),
    destination:
      session.kind === "sale" ? outside : lotName(session.destinationLotId, lotNames),
    amountBrl: session.kind === "transfer" ? undefined : amountBrl,
    notes: session.notes,
  };
}

/**
 * The farm's whole ledger: legacy movement rows plus the projection of every
 * session that moved animals, oldest first (the order the screens expect).
 */
export function herdMovements(
  legacy: Movement[],
  sessions: ManejoSession[],
  animals: Animal[],
  lotNames: Map<string, string>
): Movement[] {
  const byEarTag = new Map(animals.map((a) => [a.earTag, a]));
  const derived: Movement[] = [];
  for (const session of sessions) {
    const movement = sessionToMovement(session, byEarTag, lotNames);
    if (movement) derived.push(movement);
  }
  return [...legacy, ...derived].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
}
