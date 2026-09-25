/**
 * Custo por lote (Financeiro's "Por lote" table): each lote's direct cost,
 * its share of the farm's cost, R$/cab/dia, ADG and custo da @ produzida,
 * closing on a "Fazenda" row whose total is the window's COE.
 */
import type { Animal, ManejoSession } from "@/lib/types";
import type { Period } from "@/lib/domain/finance";
import { inPeriod, periodDays } from "@/lib/domain/period";
import { periodAdg } from "@/lib/domain/adg";
import {
  arrobasProduced,
  coe,
  costPerArroba,
  type EconomicsInputs,
} from "@/lib/domain/economics";

/** One row of the table; `lotId` null is the Fazenda row. */
export interface LotEconomics {
  lotId: string | null;
  name: string;
  /** Active animals in the lote today. */
  heads: number;
  /** Lançamentos with the lote + treatments of its animals. */
  directBrl: number;
  /** The lote's share, by heads, of the COE no lote carries. */
  sharedBrl: number;
  totalBrl: number;
  perHeadDay: number | null;
  adg: number | null;
  produced: number | null;
  costPerArroba: number | null;
  marginPerArroba: number | null;
}

/** The sessions as they touched only these animals. */
function narrowSessions(sessions: ManejoSession[], members: Animal[]): ManejoSession[] {
  const earTags = new Set(members.map((a) => a.earTag));
  return sessions.map((s) => ({ ...s, animals: s.animals.filter((e) => earTags.has(e.earTag)) }));
}

export function lotEconomics(
  input: EconomicsInputs,
  period: Period,
  quote: number | null,
  todayIso: string
): { lots: LotEconomics[]; farm: LotEconomics } {
  const { animals, manejoSessions, expenses, treatments } = input;
  const days = periodDays(period);

  const direct = new Map<string, number>();
  const addDirect = (lotId: string | undefined, amount: number): void => {
    if (lotId !== undefined) direct.set(lotId, (direct.get(lotId) ?? 0) + amount);
  };
  for (const e of expenses) {
    if (e.kind !== "revenue" && inPeriod(e.date, period)) addDirect(e.lotId, e.amountBrl);
  }
  const lotOf = new Map(animals.map((a) => [a.earTag, a.lotId]));
  for (const t of treatments) {
    if (t.status === "done" && t.costBrl !== undefined && inPeriod(t.date, period)) {
      addDirect(lotOf.get(t.animalEarTag), t.costBrl);
    }
  }

  // ponytail: lot membership is today's; animal-days when asked
  const rows = input.lots
    .filter((lot) => !lot.deletedAt)
    .map((lot) => {
      const members = animals.filter((a) => a.lotId === lot.id);
      return {
        lot,
        members,
        heads: members.filter((a) => a.active).length,
        directBrl: direct.get(lot.id) ?? 0,
      };
    })
    .filter((r) => r.heads > 0 || r.directBrl > 0)
    .sort((a, b) => a.lot.name.localeCompare(b.lot.name, "pt-BR"));

  const totalCost = coe(expenses, treatments, period);
  const totalHeads = rows.reduce((sum, r) => sum + r.heads, 0);
  const totalDirect = rows.reduce((sum, r) => sum + r.directBrl, 0);
  const pool = totalCost - totalDirect;

  const row = (
    lotId: string | null,
    name: string,
    heads: number,
    directBrl: number,
    sharedBrl: number,
    adg: number | null,
    produced: number
  ): LotEconomics => {
    const totalBrl = directBrl + sharedBrl;
    const unitCost = costPerArroba(totalBrl, produced);
    return {
      lotId,
      name,
      heads,
      directBrl,
      sharedBrl,
      totalBrl,
      perHeadDay: heads > 0 ? totalBrl / heads / days : null,
      adg,
      produced,
      costPerArroba: unitCost,
      marginPerArroba: quote !== null && unitCost !== null ? quote - unitCost : null,
    };
  };

  const lots = rows.map((r) =>
    row(
      r.lot.id,
      r.lot.name,
      r.heads,
      r.directBrl,
      totalHeads > 0 ? (pool * r.heads) / totalHeads : 0,
      periodAdg(r.members, period).kgPerDay,
      arrobasProduced(
        { ...input, animals: r.members, manejoSessions: narrowSessions(manejoSessions, r.members) },
        period,
        todayIso
      ).produced
    )
  );

  const farm = row(
    null,
    "Fazenda",
    totalHeads,
    totalDirect,
    totalCost - totalDirect,
    periodAdg(animals, period).kgPerDay,
    arrobasProduced(input, period, todayIso).produced
  );

  return { lots, farm };
}
