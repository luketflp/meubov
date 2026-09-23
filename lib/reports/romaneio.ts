/**
 * Romaneio de venda: the lines of one sale manejo as the frigorífico reads
 * them, with the batch totals.
 */
import type { HerdData, ManejoSession } from "@/lib/types";
import { ageInMonths } from "@/lib/domain/dates";
import { animalCategoryName } from "@/lib/domain/labels";
import { saleRows, saleSummary } from "@/lib/domain/movements";
import { carcassArrobas, DEFAULT_CARCASS_YIELD_PCT } from "@/lib/domain/weights";
import { hasBirthDate } from "@/lib/reports/declaration";

/** One animal of the romaneio. */
export interface RomaneioRow {
  /** 1-based line number. */
  n: number;
  earTag: string;
  /** Category name (the custom one when set); "" when the animal is gone. */
  category: string;
  /** "" when the animal is gone. */
  breed: string;
  /** Age in complete months on the sale date; null without a birth date. */
  ageMonths: number | null;
  weightKg: number | null;
  /** Carcass arrobas at the sale's yield; null without a weight. */
  arrobas: number | null;
  /** Per-head value; null on a sale closed as one lot. */
  valueBrl: number | null;
}

/** The romaneio of one sale manejo. */
export interface Romaneio {
  session: ManejoSession;
  rows: RomaneioRow[];
  totals: {
    heads: number;
    /** Sum of the weights read; 0 when none was. */
    weightKg: number;
    /** Per weighed head; null when none was weighed. */
    avgKg: number | null;
    arrobas: number;
    /** Gross value (the closed price or the sum per head); null when unpriced. */
    valueBrl: number | null;
  };
  pricePerArroba: number | null;
  /** The session's carcass yield, or the default when it set none. */
  yieldPct: number;
  counterparty: string | null;
  originLot: string | null;
}

/** The sale manejos, newest first, open and closed. */
export function saleSessions(sessions: ManejoSession[]): ManejoSession[] {
  return sessions
    .filter((session) => session.kind === "sale")
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
}

/**
 * The romaneio of a sale manejo: its done lines in session order, with the
 * animal's category, breed and age on the sale date, and the carcass arrobas
 * at the session's yield (the default one when it set none). Null for an
 * unknown session or one that is not a sale.
 */
export function saleRomaneio(data: HerdData, sessionId: string): Romaneio | null {
  const session = data.manejoSessions.find((item) => item.id === sessionId);
  if (!session || session.kind !== "sale") return null;

  const yieldPct = session.carcassYieldPct ?? DEFAULT_CARCASS_YIELD_PCT;
  const byEarTag = new Map(data.animals.map((animal) => [animal.earTag, animal]));
  const rows: RomaneioRow[] = saleRows(session)
    .filter((line) => line.outcome === "done")
    .map((line, index) => {
      const animal = byEarTag.get(line.earTag);
      return {
        n: index + 1,
        earTag: line.earTag,
        category: animal ? animalCategoryName(animal, data.customCategories) : "",
        breed: animal?.breed ?? "",
        ageMonths: animal && hasBirthDate(animal) ? ageInMonths(animal.birthDate, session.date) : null,
        weightKg: line.weightKg,
        arrobas:
          line.carcassArrobas ?? (line.weightKg === null ? null : carcassArrobas(line.weightKg, yieldPct)),
        valueBrl: line.amountBrl,
      };
    });

  const weighed = rows.filter((row) => row.weightKg !== null);
  const weightKg = weighed.reduce((sum, row) => sum + (row.weightKg ?? 0), 0);
  const summary = saleSummary(session);
  const counterparty = session.counterparty?.trim() || null;

  return {
    session,
    rows,
    totals: {
      heads: rows.length,
      weightKg,
      avgKg: weighed.length === 0 ? null : weightKg / weighed.length,
      arrobas: weighed.length === 0 ? 0 : carcassArrobas(weightKg, yieldPct),
      valueBrl: summary?.grossBrl ?? null,
    },
    pricePerArroba: session.pricePerArroba ?? null,
    yieldPct,
    counterparty,
    originLot: originLotName(session, data),
  };
}

/**
 * The lote the animals came from: the first done line's previous lote, else
 * the lote its animal still names. Null when neither resolves to a lote.
 */
function originLotName(session: ManejoSession, data: HerdData): string | null {
  const names = new Map(data.lots.map((lot) => [lot.id, lot.name]));
  const done = session.animals.filter((line) => line.outcome === "done");
  for (const line of done) {
    const name = line.previousLotId === undefined ? undefined : names.get(line.previousLotId);
    if (name !== undefined) return name;
  }
  for (const line of done) {
    const animal = data.animals.find((item) => item.earTag === line.earTag);
    const name = animal ? names.get(animal.lotId) : undefined;
    if (name !== undefined) return name;
  }
  return null;
}
