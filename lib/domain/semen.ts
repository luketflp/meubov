/**
 * Semen of the bulls the farm buys doses from: stock, cost and pregnancy rate.
 *
 * Nothing here is stored. A bull's stock is the doses its purchases bought minus
 * the coberturas that used one (`Breeding.semenBullId`), counted over every dam
 * the farm ever had — a dose spent on a cow sold since is still gone. A dose
 * costs the average of the purchases. The Touros tab, the bull's page, the brete
 * and the inseminação details all read this module; the API counts the stock
 * again inside its transaction before it takes a dose.
 */
import type {
  Animal,
  Breeding,
  DiagnosisResult,
  ManejoSession,
  ReproductionRecord,
  SemenBull,
} from "@/lib/types";
import { compareEarTags } from "@/lib/domain/earTags";
import { breedingOutcome, isDiagnosed } from "@/lib/domain/reproduction";

/* -------------------------------------------------------------------------- */
/* Stock                                                                      */
/* -------------------------------------------------------------------------- */

/** Doses of one bull: bought, used, left, and what they cost. */
export interface BullStock {
  bought: number;
  used: number;
  /** bought − used. */
  left: number;
  /** Sum of the purchase totals, in BRL. */
  totalBrl: number;
  /** totalBrl ÷ bought; null before the first purchase. */
  avgCostPerDose: number | null;
  /** Date of the latest purchase; null before the first one. */
  lastPurchase: string | null;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** One cobertura of the farm with the dam and the record it belongs to. */
interface FarmBreeding {
  dam: Animal;
  record: ReproductionRecord;
  breeding: Breeding;
}

/** Every cobertura on the farm, active dams or not. */
function farmBreedings(animals: Animal[]): FarmBreeding[] {
  return animals.flatMap((dam) => {
    const record = dam.reproduction;
    if (!record) return [];
    return record.breedings.map((breeding) => ({ dam, record, breeding }));
  });
}

/** The coberturas that used a dose of this bull. */
function bullBreedings(bullId: string, animals: Animal[]): FarmBreeding[] {
  return farmBreedings(animals).filter(({ breeding }) => breeding.semenBullId === bullId);
}

/** What the purchases alone say: doses bought, money spent, cost per dose. */
function purchased(bull: SemenBull): Omit<BullStock, "used" | "left"> {
  const bought = sum(bull.purchases.map((p) => p.doses));
  const totalBrl = sum(bull.purchases.map((p) => p.totalBrl));
  const lastPurchase = bull.purchases.reduce<string | null>(
    (latest, p) => (latest === null || p.date > latest ? p.date : latest),
    null
  );
  return {
    bought,
    totalBrl,
    avgCostPerDose: bought > 0 ? totalBrl / bought : null,
    lastPurchase,
  };
}

/**
 * Doses of the bull already used: one per cobertura that names it, whatever
 * became of the dam since.
 */
export function dosesUsed(bullId: string, animals: Animal[]): number {
  return bullBreedings(bullId, animals).length;
}

/** The bull's stock as the Touros tab shows it: bought, used, left and cost. */
export function bullStock(bull: SemenBull, animals: Animal[]): BullStock {
  const fromPurchases = purchased(bull);
  const used = dosesUsed(bull.id, animals);
  return { ...fromPurchases, used, left: fromPurchases.bought - used };
}

/**
 * True when the purchase can go without the stock turning negative: the other
 * purchases still cover every dose used. False for a purchase the bull does not
 * have.
 */
export function canRemovePurchase(bull: SemenBull, purchaseId: string, animals: Animal[]): boolean {
  const purchase = bull.purchases.find((p) => p.id === purchaseId);
  if (!purchase) return false;
  const { bought, used } = bullStock(bull, animals);
  return bought - purchase.doses >= used;
}

/* -------------------------------------------------------------------------- */
/* The bull's page                                                            */
/* -------------------------------------------------------------------------- */

/** Pregnancy rate of a bull over its diagnosed coberturas. */
export interface BullPregnancy {
  /** Coberturas diagnosed pregnant or open. */
  diagnosed: number;
  pregnant: number;
  /** pregnant ÷ diagnosed; null while nothing is diagnosed. */
  rate: number | null;
}

/**
 * Taxa de prenhez of the bull: of its coberturas diagnosed pregnant or open, the
 * share that took. A result still pending says nothing yet and stays out.
 */
export function bullPregnancy(bullId: string, animals: Animal[]): BullPregnancy {
  let diagnosed = 0;
  let pregnant = 0;
  for (const { record, breeding } of bullBreedings(bullId, animals)) {
    const { result } = breedingOutcome(record, breeding);
    if (!isDiagnosed(result)) continue;
    diagnosed += 1;
    if (result === "pregnant") pregnant += 1;
  }
  return { diagnosed, pregnant, rate: diagnosed === 0 ? null : pregnant / diagnosed };
}

/** One cobertura of the bull, as the bull's page lists it. */
export interface BullInsemination {
  breeding: Breeding;
  /** The dam; her current lote is `dam.lotId`. */
  dam: Animal;
  /** "pending" while the cobertura has no diagnosis. */
  result: DiagnosisResult;
}

/**
 * Every cobertura of the bull, newest first, then by dam ear tag so a morning
 * of IATF reads in a stable order.
 */
export function bullInseminations(bullId: string, animals: Animal[]): BullInsemination[] {
  return bullBreedings(bullId, animals)
    .map(({ dam, record, breeding }) => ({
      breeding,
      dam,
      result: breedingOutcome(record, breeding).result,
    }))
    .sort(
      (a, b) =>
        (a.breeding.date < b.breeding.date ? 1 : a.breeding.date > b.breeding.date ? -1 : 0) ||
        compareEarTags(a.dam.earTag, b.dam.earTag)
    );
}

/* -------------------------------------------------------------------------- */
/* Inseminação                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Doses one inseminação used, per bull id: each done pass counts once for the
 * bull of the cobertura it recorded (`breedingId`). A pass whose cobertura is
 * gone, or names no registered bull, counts for nobody.
 */
export function sessionDosesByBull(session: ManejoSession, animals: Animal[]): Map<string, number> {
  const breedings = new Map(farmBreedings(animals).map(({ breeding }) => [breeding.id, breeding]));
  const doses = new Map<string, number>();
  for (const entry of session.animals) {
    if (entry.outcome !== "done" || entry.breedingId === undefined) continue;
    const bullId = breedings.get(entry.breedingId)?.semenBullId;
    if (bullId === undefined) continue;
    doses.set(bullId, (doses.get(bullId) ?? 0) + 1);
  }
  return doses;
}

/** Doses and cost of one bull in an inseminação. */
export interface SemenCostLine {
  bull: SemenBull;
  doses: number;
  /** doses × the bull's average cost; null when the bull has no purchase. */
  costBrl: number | null;
  avgCostPerDose: number | null;
}

/** Semen an inseminação spent: per bull, in total and per cow. */
export interface SemenCost {
  /** Most doses first, then by bull name. */
  lines: SemenCostLine[];
  /** Doses used, one per inseminated cow. */
  doses: number;
  /** Sum of the priced lines; null when no bull of the session has a cost. */
  totalBrl: number | null;
  /** totalBrl ÷ the inseminated cows. */
  perCowBrl: number | null;
}

/**
 * Custo do sêmen of an inseminação, at each bull's current average cost per
 * dose. A bull without purchases has no price: its doses still count, but it
 * stays out of the money.
 */
export function sessionSemenCost(
  session: ManejoSession,
  animals: Animal[],
  bulls: SemenBull[]
): SemenCost {
  const bullsById = new Map(bulls.map((bull) => [bull.id, bull]));
  const lines: SemenCostLine[] = [...sessionDosesByBull(session, animals)]
    .flatMap(([bullId, doses]) => {
      const bull = bullsById.get(bullId);
      if (!bull) return [];
      const { avgCostPerDose } = purchased(bull);
      return [{ bull, doses, costBrl: avgCostPerDose === null ? null : doses * avgCostPerDose, avgCostPerDose }];
    })
    .sort((a, b) => b.doses - a.doses || a.bull.name.localeCompare(b.bull.name, "pt-BR"));

  const doses = sum(lines.map((line) => line.doses));
  const costs = lines.flatMap((line) => (line.costBrl === null ? [] : [line.costBrl]));
  const totalBrl = costs.length === 0 ? null : sum(costs);
  return {
    lines,
    doses,
    totalBrl,
    perCowBrl: totalBrl === null || doses === 0 ? null : totalBrl / doses,
  };
}

/**
 * Note of the expense a purchase writes in Financeiro:
 * "Sêmen — Tufão da Serra, 30 doses" ("1 dose" in the singular).
 */
export function purchaseExpenseNotes(bullName: string, doses: number): string {
  return `Sêmen — ${bullName}, ${doses} ${doses === 1 ? "dose" : "doses"}`;
}

/** A cow an inseminação can take: an active female, vaca or novilha. */
export function eligibleForInsemination(animal: Animal): boolean {
  return (
    animal.active &&
    animal.sex === "female" &&
    (animal.category === "cow" || animal.category === "heifer")
  );
}

/**
 * The lote most of these animals are in now, ties broken by lote id. Ear tags no
 * longer in the herd are ignored; null when none is left.
 */
export function predominantLotId(earTags: string[], animals: Animal[]): string | null {
  const byEarTag = new Map(animals.map((animal) => [animal.earTag, animal]));
  const heads = new Map<string, number>();
  for (const earTag of earTags) {
    const lotId = byEarTag.get(earTag)?.lotId;
    if (lotId === undefined) continue;
    heads.set(lotId, (heads.get(lotId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestHeads = 0;
  for (const [lotId, count] of heads) {
    if (count > bestHeads || (count === bestHeads && best !== null && lotId < best)) {
      best = lotId;
      bestHeads = count;
    }
  }
  return best;
}
