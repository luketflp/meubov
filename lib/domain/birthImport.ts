/**
 * Pure parsing + matching for "Importar nascimentos" (the maternidade caderno).
 *
 * One sheet line is one bezerro: the dam's brinco, the calf's brinco, sexo,
 * raça, peso, data do parto and lote. The dialog reads the file with SheetJS and
 * hands this module the matrix; everything the preview shows and every payload
 * the server receives is decided here. The server re-checks lots, dams and
 * brincos inside its transaction.
 *
 * Dams, raças and lotes are matched against the farm so the farmer does not have
 * to retype the caderno in MeuBov's spelling: "ANGUS" is the farm's "Angus", "2"
 * is the lot named "Lote 2", "R S/ BRINCO" is a dam without a tag.
 */
import type { Sex } from "@/lib/types";
import { toISO } from "@/lib/domain/dates";
import {
  normalizeHeader,
  parseImportDate,
  parseSex,
  parseWeight,
} from "@/lib/domain/herdImport";

/** Max lines accepted in one import (mirrored by the API `maxItems`). */
export const MAX_BIRTH_IMPORT_ROWS = 2000;

/* -------------------------------------------------------------------------- */
/* Headers                                                                    */
/* -------------------------------------------------------------------------- */

/** Canonical column of a caderno. */
export type BirthImportField =
  | "damEarTag"
  | "calfEarTag"
  | "sex"
  | "breed"
  | "weightKg"
  | "date"
  | "lot";

/** Label of each field in a line's error messages. */
export const BIRTH_FIELD_LABEL: Record<BirthImportField, string> = {
  damEarTag: "Mãe",
  calfEarTag: "Brinco do bezerro",
  sex: "Sexo",
  breed: "Raça",
  weightKg: "Peso",
  date: "Data",
  lot: "Lote",
};

/** Label of each required column in the "Colunas obrigatórias ausentes" message. */
const COLUMN_LABEL: Partial<Record<BirthImportField, string>> = {
  damEarTag: "Brinco da mãe",
  calfEarTag: "Brinco do bezerro",
  sex: "Sexo",
  date: "Data do parto",
  lot: "Lote",
};

const REQUIRED_FIELDS: readonly BirthImportField[] = [
  "damEarTag",
  "calfEarTag",
  "sex",
  "date",
  "lot",
];

/** Normalized header → field. */
const HEADER_SYNONYMS: Record<string, BirthImportField> = {
  "brinco mae": "damEarTag",
  "brinco da mae": "damEarTag",
  mae: "damEarTag",
  matriz: "damEarTag",
  "brinco matriz": "damEarTag",
  "brinco da matriz": "damEarTag",
  "brinco bezerro": "calfEarTag",
  "brinco bezerra": "calfEarTag",
  "brinco do bezerro": "calfEarTag",
  "brinco da bezerra": "calfEarTag",
  bezerro: "calfEarTag",
  bezerra: "calfEarTag",
  "brinco cria": "calfEarTag",
  cria: "calfEarTag",
  sexo: "sex",
  raca: "breed",
  peso: "weightKg",
  "peso kg": "weightKg",
  "peso ao nascer": "weightKg",
  "peso nascer": "weightKg",
  "peso nascimento": "weightKg",
  data: "date",
  "data do parto": "date",
  "data parto": "date",
  parto: "date",
  nascimento: "date",
  "data nascimento": "date",
  "data de nascimento": "date",
  lote: "lot",
};

/**
 * Resolves a caderno header to its field. Excel cuts a long title short in the
 * sheet, so anything starting with "brinco bez" is the calf's brinco.
 */
export function birthImportFieldForHeader(raw: string): BirthImportField | undefined {
  const key = normalizeHeader(raw);
  return HEADER_SYNONYMS[key] ?? (key.startsWith("brinco bez") ? "calfEarTag" : undefined);
}

/** Trimmed display text of a cell (a Date becomes ISO). */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : toISO(value);
  return String(value).trim();
}

const isBlankRow = (row: unknown[]) => row.every((cell) => cellText(cell) === "");

/**
 * Combines the two SheetJS readings of a sheet: the raw values for the date and
 * peso columns (a real Excel date, a number) and the displayed text everywhere
 * else, so a brinco "0123" or a lote "02" keeps its zeros.
 */
export function mergeSheetCells(raw: unknown[][], formatted: unknown[][]): unknown[][] {
  const rawColumns = new Set<number>();
  (raw[0] ?? []).forEach((cell, index) => {
    const field = birthImportFieldForHeader(cellText(cell));
    if (field === "date" || field === "weightKg") rawColumns.add(index);
  });
  return raw.map((row, rowIndex) => {
    const shown = formatted[rowIndex] ?? [];
    const width = Math.max(row.length, shown.length);
    return Array.from({ length: width }, (_, column) =>
      rawColumns.has(column) ? row[column] : (shown[column] ?? row[column])
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

/** Key two raça names share when they differ only in case or accents. */
export function breedKey(name: string): string {
  return normalizeHeader(name);
}

/** Key a lote value is grouped and matched by: "2", "02", "Lote 2" and "lote 02" share one. */
export function lotValueKey(raw: string): string {
  const bare = normalizeHeader(raw).replace(/^lote\s*/, "");
  return /^\d+$/.test(bare) ? String(Number(bare)) : bare;
}

/** An animal of the farm, as the dam lookup needs it. */
export interface BirthImportAnimal {
  id: string;
  earTag: string;
  sex: Sex;
  breed: string;
}

/** A lot currently placed in an invernada. */
export interface BirthImportLot {
  id: string;
  name: string;
}

export interface BirthImportContext {
  /** Every animal of the farm, active or not: a dam sold after parir still counts. */
  animals: readonly BirthImportAnimal[];
  breeds: readonly string[];
  lots: readonly BirthImportLot[];
  /** Today as ISO, for the future-parto check (farm timezone). */
  todayIso: string;
}

/** What the brinco da mãe resolved to. Only "matched" records a parto. */
export type BirthDam =
  | { kind: "matched"; id: string; earTag: string; breed: string }
  | { kind: "no_tag" }
  | { kind: "male"; earTag: string }
  | { kind: "not_found"; earTag: string };

const NO_TAG = /\b(s\/|sem)\s*brinco\b/;

function resolveDam(text: string, animals: readonly BirthImportAnimal[]): BirthDam {
  if (text === "" || NO_TAG.test(normalizeHeader(text))) return { kind: "no_tag" };
  let found = animals.find((animal) => animal.earTag === text);
  if (!found) {
    const lower = text.toLocaleLowerCase("pt-BR");
    const loose = animals.filter((animal) => animal.earTag.toLocaleLowerCase("pt-BR") === lower);
    if (loose.length === 1) found = loose[0];
  }
  if (!found) return { kind: "not_found", earTag: text };
  if (found.sex !== "female") return { kind: "male", earTag: found.earTag };
  return { kind: "matched", id: found.id, earTag: found.earTag, breed: found.breed };
}

/** Amber note under a line whose calf enters without a parto; null when the dam matched. */
export function damNote(dam: BirthDam): string | null {
  switch (dam.kind) {
    case "matched":
      return null;
    case "no_tag":
      return "Mãe sem brinco. Entra só o bezerro.";
    case "male":
      return `${dam.earTag} é um macho. Entra só o bezerro.`;
    case "not_found":
      return `${dam.earTag} não é uma fêmea do rebanho. Entra só o bezerro.`;
  }
}

function titleCase(text: string): string {
  return text
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((word) => word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1))
    .join(" ");
}

/** Name a raça the farm does not have is created with: "ANGUS" becomes "Angus". */
function newBreedName(text: string): string {
  const collapsed = text.replace(/\s+/g, " ");
  const upper = collapsed.toLocaleUpperCase("pt-BR");
  const lower = collapsed.toLocaleLowerCase("pt-BR");
  return collapsed === upper || collapsed === lower ? titleCase(collapsed) : collapsed;
}

function matchLot(label: string, lots: readonly BirthImportLot[]): string | undefined {
  const exact = lots.filter((lot) => normalizeHeader(lot.name) === normalizeHeader(label));
  if (exact.length === 1) return exact[0].id;
  const byKey = lots.filter((lot) => lotValueKey(lot.name) === lotValueKey(label));
  return byKey.length === 1 ? byKey[0].id : undefined;
}

const DEATH = /\b(morreu|morto|morta|natimorto|natimorta|obito)\b/;
const BARE_YEAR = /^\d{4}$/;

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

/** One line of the preview. */
export interface BirthImportRow {
  /** 1-based data line (header excluded, blank lines skipped). */
  line: number;
  /** What the file held, per field. */
  cells: Record<BirthImportField, string>;
  status: "ok" | "duplicate" | "error";
  errors: Partial<Record<BirthImportField, string>>;
  duplicateReason?: "in_file" | "in_herd";
  dam: BirthDam;
  /** Resolved raça (the farm's spelling, or the name to create); "" when unresolved. */
  breed: string;
  /** Key of the line's lote value (see lotValueKey). */
  lotKey: string;
  /** Text of the extra cell that says the calf died. */
  deathNote?: string;
  /** Present when status is "ok". */
  parsed?: { calfEarTag: string; sex: Sex; date: string; weightKg?: number };
}

/** A distinct lote value among the ready lines. */
export interface BirthLotValue {
  key: string;
  /** First spelling seen in the file. */
  label: string;
  /** Ready lines carrying it. */
  lines: number;
  /** The lot it matched on its own; undefined when the farmer has to pick. */
  lotId?: string;
}

export interface BirthImportParseResult {
  /** Set when the file or its header is unusable; rows is empty then. */
  headerError?: string;
  /** Non-empty header cells, shown when a required column is missing. */
  headers: string[];
  rows: BirthImportRow[];
  lotValues: BirthLotValue[];
  /** Raças the ready lines will create, in order of appearance. */
  newBreeds: string[];
}

/** Turns a caderno matrix (row 0 = header) into preview lines. */
export function buildBirthImportRows(
  matrix: unknown[][],
  ctx: BirthImportContext
): BirthImportParseResult {
  const refuse = (headerError: string, headers: string[] = []): BirthImportParseResult => ({
    headerError,
    headers,
    rows: [],
    lotValues: [],
    newBreeds: [],
  });
  if (!matrix.length || matrix.every(isBlankRow)) return refuse("Arquivo vazio.");

  const header = matrix[0].map(cellText);
  const columns: Partial<Record<BirthImportField, number>> = {};
  header.forEach((text, index) => {
    const field = birthImportFieldForHeader(text);
    if (field && columns[field] === undefined) columns[field] = index;
  });
  const missing = REQUIRED_FIELDS.filter((field) => columns[field] === undefined);
  if (missing.length > 0) {
    return refuse(
      `Colunas obrigatórias ausentes: ${missing.map((field) => COLUMN_LABEL[field]).join(", ")}.`,
      header.filter((text) => text !== "")
    );
  }

  const dataRows = matrix.slice(1).filter((row) => !isBlankRow(row));
  if (dataRows.length === 0) return refuse("Nenhuma linha de dados encontrada no arquivo.");
  if (dataRows.length > MAX_BIRTH_IMPORT_ROWS) {
    return refuse(
      `O arquivo tem ${dataRows.length} linhas. O limite por importação é ${MAX_BIRTH_IMPORT_ROWS}. Divida o arquivo e importe em partes.`
    );
  }

  const mapped = new Set(Object.values(columns));
  const at = (row: unknown[], field: BirthImportField): unknown => {
    const index = columns[field];
    return index === undefined ? "" : row[index];
  };

  const existingTags = new Set(ctx.animals.map((animal) => animal.earTag.trim()));
  const farmBreeds = new Map(ctx.breeds.map((name) => [breedKey(name), name]));
  const createdBreeds = new Map<string, string>();
  const seen = new Set<string>();
  const rows: BirthImportRow[] = [];

  dataRows.forEach((row, index) => {
    const cells = {} as Record<BirthImportField, string>;
    for (const field of Object.keys(BIRTH_FIELD_LABEL) as BirthImportField[]) {
      cells[field] = cellText(at(row, field));
    }
    const errors: Partial<Record<BirthImportField, string>> = {};

    const calfEarTag = cells.calfEarTag;
    if (calfEarTag === "") errors.calfEarTag = "Informe o brinco do bezerro.";

    const sex = parseSex(cells.sex);
    if (cells.sex === "") errors.sex = "Informe o sexo.";
    else if (!sex) errors.sex = "Sexo não reconhecido (use M ou F).";

    const dam = resolveDam(cells.damEarTag, ctx.animals);

    let breed = "";
    let breedIsNew = false;
    if (cells.breed === "") {
      if (dam.kind === "matched") breed = dam.breed;
      else errors.breed = "Informe a raça.";
    } else {
      const key = breedKey(cells.breed);
      const known = farmBreeds.get(key) ?? createdBreeds.get(key);
      breed = known ?? newBreedName(cells.breed);
      breedIsNew = !farmBreeds.has(key);
    }

    let weightKg: number | undefined;
    if (cells.weightKg !== "") {
      const parsed = parseWeight(at(row, "weightKg"));
      if (parsed === null) errors.weightKg = "Peso inválido.";
      else weightKg = parsed;
    }

    const date = BARE_YEAR.test(cells.date) ? null : parseImportDate(at(row, "date"));
    if (cells.date === "") errors.date = "Informe a data do parto.";
    else if (!date) errors.date = "Data inválida (use DD/MM/AAAA).";
    else if (date > ctx.todayIso) errors.date = "O parto não pode ser no futuro.";

    if (cells.lot === "") errors.lot = "Informe o lote.";

    let deathNote: string | undefined;
    for (let column = 0; column < row.length && deathNote === undefined; column++) {
      if (mapped.has(column)) continue;
      const text = cellText(row[column]);
      if (DEATH.test(normalizeHeader(text))) deathNote = text;
    }

    const base = {
      line: index + 1,
      cells,
      errors,
      dam,
      breed,
      lotKey: lotValueKey(cells.lot),
      deathNote,
    };
    if (calfEarTag !== "" && existingTags.has(calfEarTag)) {
      rows.push({ ...base, status: "duplicate", duplicateReason: "in_herd" });
    } else if (calfEarTag !== "" && seen.has(calfEarTag)) {
      rows.push({ ...base, status: "duplicate", duplicateReason: "in_file" });
    } else if (Object.keys(errors).length > 0) {
      if (calfEarTag !== "") seen.add(calfEarTag);
      rows.push({ ...base, status: "error" });
    } else {
      seen.add(calfEarTag);
      if (breedIsNew && !createdBreeds.has(breedKey(breed))) {
        createdBreeds.set(breedKey(breed), breed);
      }
      rows.push({
        ...base,
        status: "ok",
        parsed: { calfEarTag, sex: sex as Sex, date: date as string, weightKg },
      });
    }
  });

  const lotValues: BirthLotValue[] = [];
  const byKey = new Map<string, BirthLotValue>();
  for (const row of rows) {
    if (row.status !== "ok") continue;
    const value = byKey.get(row.lotKey);
    if (value) {
      value.lines += 1;
      continue;
    }
    const created = {
      key: row.lotKey,
      label: row.cells.lot,
      lines: 1,
      lotId: matchLot(row.cells.lot, ctx.lots),
    };
    byKey.set(row.lotKey, created);
    lotValues.push(created);
  }

  return { headers: header.filter((text) => text !== ""), rows, lotValues, newBreeds: [...createdBreeds.values()] };
}

/* -------------------------------------------------------------------------- */
/* Summary and payloads                                                       */
/* -------------------------------------------------------------------------- */

/** The lot the farmer picked for each unmatched lote value, by key. */
export type LotPicks = Record<string, string>;

export interface BirthImportSummary {
  total: number;
  /** Lines that will import (calf-only ones included). */
  ready: number;
  duplicate: number;
  error: number;
  withoutDam: number;
  deaths: number;
  /** Lote values of ready lines with no lot yet; the import waits for them. */
  unpickedLots: BirthLotValue[];
}

export function summarizeBirthImport(
  result: BirthImportParseResult,
  picks: LotPicks
): BirthImportSummary {
  const ready = result.rows.filter((row) => row.status === "ok");
  return {
    total: result.rows.length,
    ready: ready.length,
    duplicate: result.rows.filter((row) => row.status === "duplicate").length,
    error: result.rows.filter((row) => row.status === "error").length,
    withoutDam: ready.filter((row) => row.dam.kind !== "matched").length,
    deaths: ready.filter((row) => row.deathNote !== undefined).length,
    unpickedLots: result.lotValues.filter((value) => !value.lotId && !picks[value.key]),
  };
}

/** One line as POST /births/import takes it. */
export interface ImportBirthPayload {
  calfEarTag: string;
  calfSex: Sex;
  breed: string;
  lotId: string;
  date: string;
  /** Absent: the calf enters without a parto. */
  damId?: string;
  weightKg?: number;
  /** Present: baixa por morte on `date`, with this note. */
  deathNotes?: string;
}

/** Payloads of the ready lines whose lote resolved (matched or picked). */
export function birthImportPayloads(
  result: BirthImportParseResult,
  picks: LotPicks
): ImportBirthPayload[] {
  const lotByKey = new Map(
    result.lotValues.map((value) => [value.key, value.lotId ?? picks[value.key]])
  );
  return result.rows.flatMap((row) => {
    const lotId = lotByKey.get(row.lotKey);
    if (row.status !== "ok" || !row.parsed || !lotId) return [];
    const payload: ImportBirthPayload = {
      calfEarTag: row.parsed.calfEarTag,
      calfSex: row.parsed.sex,
      breed: row.breed,
      lotId,
      date: row.parsed.date,
    };
    if (row.dam.kind === "matched") payload.damId = row.dam.id;
    if (row.parsed.weightKg !== undefined) payload.weightKg = row.parsed.weightKg;
    if (row.deathNote !== undefined) payload.deathNotes = row.deathNote;
    return [payload];
  });
}

/** "BB125, BB128 e BB140"; past `limit` brincos, "… e mais N". */
export function formatEarTagList(tags: readonly string[], limit = 10): string {
  if (tags.length > limit) {
    return `${tags.slice(0, limit).join(", ")} e mais ${tags.length - limit}`;
  }
  if (tags.length <= 1) return tags.join("");
  return `${tags.slice(0, -1).join(", ")} e ${tags[tags.length - 1]}`;
}

/**
 * CSV for "Baixar modelo": BOM (so Excel reads the accents), the header and one
 * example line. The observação column is where "morreu" goes.
 */
export function buildBirthTemplateCsv(): string {
  const header = "brinco mãe,brinco bezerro,sexo,raça,peso,data,lote,observação";
  const example = "R381,BB97,M,Nelore,28,29/09/2025,Lote 1,";
  return `﻿${header}\n${example}\n`;
}
