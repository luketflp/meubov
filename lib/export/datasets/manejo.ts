/**
 * The Manejo lists as tables: the history (one row per manejo, as the screen
 * lists it), every session of the farm for Relatórios, and the animals of one
 * manejo's details page, with the columns of that page's table.
 */
import type {
  Animal,
  CustomCategory,
  DiagnosisResult,
  Lot,
  ManejoSession,
} from "@/lib/types";
import { DIAGNOSIS_RESULT_LABEL, SEX_LABEL, animalCategoryName } from "@/lib/domain/labels";
import {
  outcomeNote,
  type DetailLine,
  type MovementLine,
  type TreatmentLine,
  type WeighingLine,
} from "@/lib/domain/manejoDetail";
import type { SaleRow } from "@/lib/domain/movements";
import {
  MANEJO_ACTION_LABEL,
  isMovementAction,
  sessionAmount,
  sessionKind,
  type ManejoAction,
  type ManejoHistoryRow,
} from "@/components/manejo/helpers";
import { buildTable, type ColumnSpec, type ExportTable } from "@/lib/export/table";

/* -------------------------------------------------------------------------- */
/* One row per manejo                                                         */
/* -------------------------------------------------------------------------- */

interface ManejoExportRow {
  date: string;
  kind: ManejoAction;
  name: string;
  lot: string | null;
  heads: number;
  responsible: string | null;
  counterparty: string | null;
  pricePerArroba: number | null;
  amountBrl: number | null;
  status: string;
}

const MANEJO_COLUMNS: ColumnSpec<ManejoExportRow>[] = [
  { header: "Data", kind: "date", value: (r) => r.date },
  { header: "Tipo", value: (r) => MANEJO_ACTION_LABEL[r.kind] },
  { header: "Manejo", value: (r) => r.name },
  { header: "Lote", value: (r) => r.lot },
  { header: "Animais", kind: "number", value: (r) => r.heads },
  { header: "Responsável", value: (r) => r.responsible },
  { header: "Comprador/vendedor", value: (r) => r.counterparty },
  { header: "R$/@", kind: "money", value: (r) => r.pricePerArroba },
  { header: "Custo / valor (R$)", kind: "money", value: (r) => r.amountBrl },
  { header: "Status", value: (r) => r.status },
];

const lotNamesOf = (lots: readonly Lot[]) => new Map(lots.map((lot) => [lot.id, lot.name]));

/**
 * The lote a session worked: where a troca or a compra put the animals, else
 * the lote the first animal that passed left. Null when the session names none.
 */
function sessionLot(session: ManejoSession, lotNames: ReadonlyMap<string, string>): string | null {
  const lotId =
    session.destinationLotId ??
    session.animals.find((a) => a.outcome === "done" && a.previousLotId !== undefined)?.previousLotId;
  return lotId === undefined ? null : (lotNames.get(lotId) ?? null);
}

const doneCount = (session: ManejoSession): number =>
  session.animals.filter((a) => a.outcome === "done").length;

function sessionRow(session: ManejoSession, lotNames: ReadonlyMap<string, string>): ManejoExportRow {
  const kind = sessionKind(session);
  const heads = doneCount(session);
  const movement = isMovementAction(kind);
  return {
    date: session.date,
    kind,
    name: session.name,
    lot: sessionLot(session, lotNames),
    heads,
    responsible: movement ? null : (session.treatment?.responsible ?? null),
    counterparty: movement ? (session.counterparty ?? null) : null,
    pricePerArroba: session.pricePerArroba ?? null,
    amountBrl: sessionAmount(session, heads),
    status: session.status === "open" ? "Em andamento" : "Concluído",
  };
}

/**
 * The Histórico de manejos, one row per history row in the order given (the
 * screen's): the session's lote, price and status when a session wrote the row;
 * a treatment marked feito on the calendar or a pesagem avulsa reads as done.
 */
export function manejoHistoryExportTable(
  rows: readonly ManejoHistoryRow[],
  sessions: readonly ManejoSession[],
  lots: readonly Lot[],
  title = "Manejos"
): ExportTable {
  const lotNames = lotNamesOf(lots);
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const items = rows.map((row): ManejoExportRow => {
    const session = row.sessionId === undefined ? undefined : byId.get(row.sessionId);
    const movement = isMovementAction(row.kind);
    return {
      date: row.date,
      kind: row.kind,
      name: row.subtitle ? `${row.name} (${row.subtitle})` : row.name,
      lot: session ? sessionLot(session, lotNames) : null,
      heads: row.headCount,
      responsible: movement ? null : (row.responsible ?? null),
      counterparty: movement ? (row.responsible ?? null) : null,
      pricePerArroba: session?.pricePerArroba ?? null,
      amountBrl: row.amountBrl,
      status: session?.status === "open" ? "Em andamento" : "Concluído",
    };
  });
  return buildTable(title, MANEJO_COLUMNS, items);
}

/**
 * Every manejo session of the farm, one row each, newest first (ties by name),
 * open ones included; "Animais" counts the animals that passed.
 */
export function manejoExportTable(
  sessions: readonly ManejoSession[],
  lots: readonly Lot[],
  title = "Manejos"
): ExportTable {
  const lotNames = lotNamesOf(lots);
  const ordered = [...sessions].sort((a, b) =>
    a.date === b.date ? a.name.localeCompare(b.name, "pt-BR") : a.date < b.date ? 1 : -1
  );
  return buildTable(
    title,
    MANEJO_COLUMNS,
    ordered.map((session) => sessionRow(session, lotNames))
  );
}

/* -------------------------------------------------------------------------- */
/* The animals of one manejo                                                  */
/* -------------------------------------------------------------------------- */

/** The herd a details page reads its animals' categoria, raça and lote from. */
export interface DetailExportNames {
  animals: readonly Animal[];
  lotNames: ReadonlyMap<string, string>;
  customCategories: readonly CustomCategory[];
}

function herdOf(names: DetailExportNames) {
  const byTag = new Map(names.animals.map((animal) => [animal.earTag, animal]));
  return {
    animal: (earTag: string) => byTag.get(earTag),
    category: (earTag: string) => {
      const animal = byTag.get(earTag);
      return animal ? animalCategoryName(animal, names.customCategories) : null;
    },
    breed: (earTag: string) => byTag.get(earTag)?.breed ?? null,
    lot: (earTag: string) => {
      const animal = byTag.get(earTag);
      return animal ? (names.lotNames.get(animal.lotId) ?? null) : null;
    },
    lotName: (lotId: string | undefined) => (lotId ? (names.lotNames.get(lotId) ?? null) : null),
  };
}

const note = (line: DetailLine) => outcomeNote(line) || null;

/**
 * A pesagem's animals, as its page lists them: the weight, the previous
 * weighing and the gain since. Also the pesagens avulsas of a day, where a
 * weight on the birth date reads "peso ao nascer".
 */
export function weighingLinesExportTable(
  title: string,
  lines: readonly WeighingLine[],
  names: DetailExportNames
): ExportTable {
  const herd = herdOf(names);
  return buildTable(
    title,
    [
      { header: "Brinco", value: (l) => l.earTag },
      { header: "Categoria", value: (l) => herd.category(l.earTag) },
      { header: "Lote", value: (l) => herd.lot(l.earTag) },
      { header: "Peso (kg)", kind: "number", decimals: 1, value: (l) => l.weightKg },
      { header: "Pesagem anterior (kg)", kind: "number", decimals: 1, value: (l) => l.previous?.weightKg ?? null },
      { header: "Data da pesagem anterior", kind: "date", value: (l) => l.previous?.date ?? null },
      { header: "Ganho (kg)", kind: "number", decimals: 1, value: (l) => l.gain?.gainKg ?? null },
      { header: "GMD (kg/dia)", kind: "number", decimals: 3, value: (l) => l.gain?.adgKgDay ?? null },
      {
        header: "Observação",
        value: (l) => {
          if (l.atBirth) return "peso ao nascer";
          const text = outcomeNote(l);
          if (text === "" && l.weightKg !== null && l.previous === null) return "primeira pesagem";
          return text || null;
        },
      },
    ],
    lines
  );
}

/** A sanitary manejo's animals: the weight taken in the same pass and the plan's cost. */
export function treatmentLinesExportTable(
  title: string,
  lines: readonly TreatmentLine[],
  names: DetailExportNames
): ExportTable {
  const herd = herdOf(names);
  return buildTable(
    title,
    [
      { header: "Brinco", value: (l) => l.earTag },
      { header: "Categoria", value: (l) => herd.category(l.earTag) },
      { header: "Lote", value: (l) => herd.lot(l.earTag) },
      { header: "Peso (kg)", kind: "number", decimals: 1, value: (l) => l.weightKg },
      { header: "Custo (R$)", kind: "money", value: (l) => l.costBrl },
      { header: "Observação", value: note },
    ],
    lines
  );
}

/** A troca de lote's animals, with the lote each one left. */
export function transferLinesExportTable(
  title: string,
  lines: readonly MovementLine[],
  names: DetailExportNames
): ExportTable {
  const herd = herdOf(names);
  return buildTable(
    title,
    [
      { header: "Brinco", value: (l) => l.earTag },
      { header: "Categoria", value: (l) => herd.category(l.earTag) },
      { header: "Raça", value: (l) => herd.breed(l.earTag) },
      { header: "Lote anterior", value: (l) => herd.lotName(l.previousLotId) },
      { header: "Peso (kg)", kind: "number", decimals: 1, value: (l) => l.weightKg },
      { header: "Observação", value: note },
    ],
    lines
  );
}

/** A compra's animals, with the weight each one arrived with. */
export function entryLinesExportTable(
  title: string,
  lines: readonly MovementLine[],
  names: DetailExportNames
): ExportTable {
  const herd = herdOf(names);
  return buildTable(
    title,
    [
      { header: "Brinco", value: (l) => l.earTag },
      { header: "Categoria", value: (l) => herd.category(l.earTag) },
      { header: "Raça", value: (l) => herd.breed(l.earTag) },
      {
        header: "Sexo",
        value: (l) => {
          const sex = herd.animal(l.earTag)?.sex;
          return sex ? SEX_LABEL[sex] : null;
        },
      },
      { header: "Peso de entrada (kg)", kind: "number", decimals: 1, value: (l) => l.weightKg },
      { header: "Observação", value: note },
    ],
    lines
  );
}

/** A venda's animals (`saleRows`): the chute weight, the carcass arrobas and the value. */
export function saleLinesExportTable(
  title: string,
  rows: readonly SaleRow[],
  names: DetailExportNames
): ExportTable {
  const herd = herdOf(names);
  return buildTable(
    title,
    [
      { header: "Brinco", value: (r) => r.earTag },
      { header: "Categoria", value: (r) => herd.category(r.earTag) },
      { header: "Raça", value: (r) => herd.breed(r.earTag) },
      { header: "Peso (kg)", kind: "number", decimals: 1, value: (r) => r.weightKg },
      { header: "@ carcaça", kind: "number", decimals: 2, value: (r) => r.carcassArrobas },
      { header: "Valor (R$)", kind: "money", value: (r) => r.amountBrl },
      { header: "Observação", value: note },
    ],
    rows
  );
}

/** A cow of an inseminação: the bull she took and what the ultrassom said since. */
export interface InseminationExportLine extends DetailLine {
  bull: string | null;
  result: DiagnosisResult | null;
}

/** An inseminação's cows, as its page lists them. */
export function inseminationLinesExportTable(
  title: string,
  lines: readonly InseminationExportLine[],
  names: DetailExportNames
): ExportTable {
  const herd = herdOf(names);
  return buildTable(
    title,
    [
      { header: "Brinco", value: (l) => l.earTag },
      { header: "Categoria", value: (l) => herd.category(l.earTag) },
      { header: "Touro", value: (l) => l.bull },
      { header: "Diagnóstico", value: (l) => (l.result === null ? null : DIAGNOSIS_RESULT_LABEL[l.result]) },
      {
        header: "Observação",
        value: (l) => {
          if (l.outcome === "done") return l.notes ?? null;
          const label = l.outcome === "skipped" ? "pulada" : "não passou";
          return l.notes ? `${label} · ${l.notes}` : label;
        },
      },
    ],
    lines
  );
}

/** One application marked feito on the calendar, as its page lists it. */
export interface CalendarApplicationLine extends DetailLine {
  dose?: string;
  costBrl: number | null;
}

/** The applications marked feito on the calendar on one day, of one type and name. */
export function calendarApplicationsExportTable(
  title: string,
  lines: readonly CalendarApplicationLine[],
  names: DetailExportNames
): ExportTable {
  const herd = herdOf(names);
  return buildTable(
    title,
    [
      { header: "Brinco", value: (l) => l.earTag },
      { header: "Categoria", value: (l) => herd.category(l.earTag) },
      { header: "Lote", value: (l) => herd.lot(l.earTag) },
      { header: "Dose", value: (l) => l.dose ?? null },
      { header: "Custo (R$)", kind: "money", value: (l) => l.costBrl },
      { header: "Observação", value: note },
    ],
    lines
  );
}
