/**
 * Pure parsing + validation for the "Importar rebanho" (bulk herd import) flow.
 *
 * No React and no I/O: the dialog reads the file with SheetJS, hands this module
 * a raw sheet matrix (array of rows, each an array of cells), and renders the
 * result; the unit tests exercise it directly. The server re-validates every
 * row it receives — this layer only drives the preview and decides which rows
 * are worth sending.
 *
 * Dates travel as ISO "YYYY-MM-DD" (see lib/domain/dates). Category rules run on
 * the canonical base category; a row that matches a custom category also carries
 * its id so the animal keeps the user-defined label.
 */
import type { Category, CustomCategory, Sex } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import { toISO } from "@/lib/domain/dates";
import {
  resolveImportLocations,
  type ExistingImportLot,
  type ImportLocationInvernada,
} from "@/lib/domain/importLocations";

/** Max rows accepted in a single import (mirrored by the API `maxItems`). */
export const MAX_IMPORT_ROWS = 2000;

/* -------------------------------------------------------------------------- */
/* Fields & headers                                                           */
/* -------------------------------------------------------------------------- */

/** Canonical column of an import file. */
export type ImportField =
  | "earTag"
  | "category"
  | "breed"
  | "sex"
  | "birthDate"
  | "lot"
  | "invernada"
  | "weightKg";

/** Columns that must be present (a header must map to each). */
const REQUIRED_FIELDS: readonly ImportField[] = [
  "earTag",
  "category",
  "breed",
  "birthDate",
  "lot",
  "invernada",
];

/** pt-BR label of each field, for headers and error messages. */
export const FIELD_LABEL: Record<ImportField, string> = {
  earTag: "Brinco",
  category: "Categoria",
  breed: "Raça",
  sex: "Sexo",
  birthDate: "Nascimento",
  lot: "Lote",
  invernada: "Invernada",
  weightKg: "Peso",
};

/**
 * Header text (already normalized) → canonical field. Tolerant of the common
 * pt-BR spellings a farm spreadsheet uses.
 */
const HEADER_SYNONYMS: Record<string, ImportField> = {
  // Only explicit "brinco" spellings map to the ear tag: a bare "id" /
  // "identificação" would collide with a leftmost internal/sequential ID column
  // and silently hijack the ear tag (first matching column wins).
  brinco: "earTag",
  "brinco id": "earTag",
  "brinco eletronico": "earTag",
  categoria: "category",
  category: "category",
  raca: "breed",
  breed: "breed",
  sexo: "sex",
  sex: "sex",
  nascimento: "birthDate",
  "data de nascimento": "birthDate",
  "data nascimento": "birthDate",
  "data de nasc": "birthDate",
  lote: "lot",
  invernada: "invernada",
  pasto: "invernada",
  piquete: "invernada",
  peso: "weightKg",
  "peso kg": "weightKg",
  "peso atual": "weightKg",
};

/** Lowercases, strips accents, drops punctuation and collapses whitespace. */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[().]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolves a spreadsheet header to its canonical import field, when known. */
export function importFieldForHeader(raw: string): ImportField | undefined {
  return HEADER_SYNONYMS[normalizeHeader(raw)];
}

/* -------------------------------------------------------------------------- */
/* Value parsers                                                              */
/* -------------------------------------------------------------------------- */

/** Sex implied by the category, or null when both are possible (bezerro). */
export function impliedSex(category: Category): Sex | null {
  if (category === "heifer" || category === "cow") return "female";
  if (category === "steer" || category === "bull") return "male";
  return null;
}

/** Canonical english category values, for direct matches. */
const CANONICAL_CATEGORIES: readonly Category[] = [
  "calf",
  "heifer",
  "steer",
  "cow",
  "bull",
];

/**
 * Extra pt-BR words a farm might type, beyond the singular CATEGORY_LABEL
 * values (which are added programmatically below). All keys are normalized.
 */
const CATEGORY_SYNONYMS: Record<string, Category> = {
  bezerra: "calf",
  garrote: "steer",
  novilho: "steer",
  vitelo: "calf",
};

/** Normalized label/synonym → base category (built once). */
const CATEGORY_LOOKUP: Record<string, Category> = (() => {
  const map: Record<string, Category> = { ...CATEGORY_SYNONYMS };
  for (const c of CANONICAL_CATEGORIES) map[c] = c;
  for (const c of CANONICAL_CATEGORIES) map[normalizeHeader(CATEGORY_LABEL[c])] = c;
  return map;
})();

/** Result of resolving a category cell. */
export interface ParsedCategory {
  category: Category;
  customCategoryId?: string;
}

/**
 * Resolves a category cell against the farm's custom categories first (so a
 * user-defined label wins), then the canonical english / pt-BR names. Returns
 * null when nothing matches.
 */
export function parseCategory(
  raw: string,
  customCategories: readonly CustomCategory[]
): ParsedCategory | null {
  const key = normalizeHeader(raw);
  if (key === "") return null;
  for (const custom of customCategories) {
    if (normalizeHeader(custom.name) === key) {
      return { category: custom.baseCategory, customCategoryId: custom.id };
    }
  }
  const base = CATEGORY_LOOKUP[key];
  return base ? { category: base } : null;
}

const SEX_LOOKUP: Record<string, Sex> = {
  m: "male",
  macho: "male",
  male: "male",
  f: "female",
  femea: "female",
  female: "female",
  fem: "female",
};

/** Resolves a sex cell; null for empty or unrecognized. */
export function parseSex(raw: string): Sex | null {
  return SEX_LOOKUP[normalizeHeader(raw)] ?? null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const BR_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

/**
 * Parses a date cell into ISO "YYYY-MM-DD". Accepts a JS Date (SheetJS with
 * `cellDates`), ISO strings, and Brazilian `DD/MM/YYYY` (also `-` separated).
 * Returns null when the value cannot be read as a real calendar date.
 */
export function parseImportDate(raw: unknown): string | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return toISO(raw);
  }
  const text = String(raw ?? "").trim();
  if (text === "") return null;

  let year: number;
  let month: number;
  let day: number;
  const iso = ISO_DATE.exec(text);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const br = BR_DATE.exec(text);
    if (!br) return null;
    day = Number(br[1]);
    month = Number(br[2]);
    year = Number(br[3]);
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Reject impossible days (e.g. 31/02) by round-tripping through a real Date.
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parses a weight cell into a positive number of kg. Accepts a number or a
 * string with a comma decimal ("450,5") and/or thousands separators. Returns
 * null when present but not a valid positive number.
 */
export function parseWeight(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  let text = String(raw ?? "").trim();
  if (text === "") return null;
  if (text.includes(",")) {
    // Comma is the decimal sep in pt-BR; drop dots used as thousands grouping.
    text = text.replace(/\./g, "").replace(",", ".");
  }
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/* -------------------------------------------------------------------------- */
/* Row assembly                                                               */
/* -------------------------------------------------------------------------- */

/** Payload sent to the API for one importable animal (server resolves lot/breed). */
export interface ImportAnimalPayload {
  earTag: string;
  category: Category;
  customCategoryId?: string;
  breed: string;
  sex: Sex;
  birthDate: string;
  /** Lot NAME; the server resolves it to a lot id (creating it if new). */
  lot: string;
  /** Fixed invernada CODE where the logical lot must currently be placed. */
  invernada: string;
  weightKg?: number;
}

/** Preview status of one parsed row. */
export type RowStatus = "ok" | "duplicate" | "error";

/** One row of the preview table. */
export interface ImportRow {
  /** 1-based data-row number as it appears in the file (header excluded). */
  line: number;
  /** Display text per field (what the file held), for the preview cells. */
  cells: Record<ImportField, string>;
  status: RowStatus;
  /** Per-field pt-BR messages when status is "error". */
  errors: Partial<Record<ImportField, string>>;
  /** Why the row is a duplicate (skipped), when status is "duplicate". */
  duplicateReason?: "in_file" | "in_herd";
  /** Present only when status is "ok" — the payload to send. */
  payload?: ImportAnimalPayload;
}

/** Outcome of parsing a whole sheet. */
export interface ImportParseResult {
  /** Set when the file/headers are unusable; rows is empty in that case. */
  headerError?: string;
  rows: ImportRow[];
  counts: { ok: number; duplicate: number; error: number; total: number };
}

export interface BuildImportRowsContext {
  customCategories: readonly CustomCategory[];
  /** Ear tags already registered on the farm (active or not). */
  existingEarTags: readonly string[];
  /** Today as ISO, for the future-birth check (farm timezone). */
  todayIso: string;
}

/** Reads one cell into trimmed display text (Date → ISO). */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : toISO(value);
  }
  return String(value).trim();
}

/** True when every cell of a row is blank (SheetJS keeps trailing empties). */
function isBlankRow(row: unknown[]): boolean {
  return row.every((cell) => cellText(cell) === "");
}

/**
 * Turns a raw sheet matrix (row 0 = headers) into preview rows. Pure: given the
 * same matrix and context it always returns the same result.
 */
export function buildImportRows(
  matrix: unknown[][],
  ctx: BuildImportRowsContext
): ImportParseResult {
  const empty = { ok: 0, duplicate: 0, error: 0, total: 0 };
  if (!matrix.length || matrix.every(isBlankRow)) {
    return { headerError: "Arquivo vazio.", rows: [], counts: empty };
  }

  // Map header cells to columns (first occurrence of each field wins).
  const columns: Partial<Record<ImportField, number>> = {};
  matrix[0].forEach((cell, index) => {
    const field = importFieldForHeader(cellText(cell));
    if (field && columns[field] === undefined) columns[field] = index;
  });

  const missing = REQUIRED_FIELDS.filter((f) => columns[f] === undefined);
  if (missing.length) {
    const hasLegacyCombinedLocation = matrix[0].some((cell) => {
      const header = normalizeHeader(cellText(cell));
      return header === "pasto/lote" || header === "pasto lote";
    });
    if (
      hasLegacyCombinedLocation &&
      (missing.includes("lot") || missing.includes("invernada"))
    ) {
      return {
        headerError:
          'Separe a antiga coluna "Pasto/Lote" em duas colunas: "Lote" (grupo de animais) e "Invernada" (código da área física).',
        rows: [],
        counts: empty,
      };
    }
    return {
      headerError: `Colunas obrigatórias ausentes: ${missing
        .map((f) => FIELD_LABEL[f])
        .join(", ")}.`,
      rows: [],
      counts: empty,
    };
  }

  const dataRows = matrix.slice(1).filter((row) => !isBlankRow(row));
  if (!dataRows.length) {
    return {
      headerError: "Nenhuma linha de dados encontrada no arquivo.",
      rows: [],
      counts: empty,
    };
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      headerError: `O arquivo tem ${dataRows.length} linhas. O limite por importação é ${MAX_IMPORT_ROWS}. Divida o arquivo e importe em partes.`,
      rows: [],
      counts: empty,
    };
  }

  const at = (row: unknown[], field: ImportField): unknown => {
    const index = columns[field];
    return index === undefined ? "" : row[index];
  };

  const existing = new Set(ctx.existingEarTags.map((tag) => tag.trim()));
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  const counts = { ok: 0, duplicate: 0, error: 0, total: 0 };

  dataRows.forEach((row, index) => {
    const cells: Record<ImportField, string> = {
      earTag: cellText(at(row, "earTag")),
      category: cellText(at(row, "category")),
      breed: cellText(at(row, "breed")),
      sex: cellText(at(row, "sex")),
      birthDate: cellText(at(row, "birthDate")),
      lot: cellText(at(row, "lot")),
      invernada: cellText(at(row, "invernada")),
      weightKg: cellText(at(row, "weightKg")),
    };
    const errors: Partial<Record<ImportField, string>> = {};

    const earTag = cells.earTag;
    if (earTag === "") errors.earTag = "Informe o brinco.";

    const parsedCategory = parseCategory(cells.category, ctx.customCategories);
    if (cells.category === "") {
      errors.category = "Informe a categoria.";
    } else if (!parsedCategory) {
      errors.category = "Categoria não reconhecida.";
    }

    if (cells.breed === "") errors.breed = "Informe a raça.";

    // Sex: the category's implied sex wins; otherwise the cell is required.
    const implied = parsedCategory ? impliedSex(parsedCategory.category) : null;
    const parsedSex = parseSex(cells.sex);
    const sex: Sex | null = implied ?? parsedSex;
    if (implied === null) {
      if (cells.sex === "") errors.sex = "Informe o sexo.";
      else if (!parsedSex) errors.sex = "Sexo não reconhecido.";
    }

    const birthDate = parseImportDate(at(row, "birthDate"));
    if (cells.birthDate === "") {
      errors.birthDate = "Informe o nascimento.";
    } else if (!birthDate) {
      errors.birthDate = "Data inválida (use DD/MM/AAAA).";
    } else if (birthDate > ctx.todayIso) {
      errors.birthDate = "O nascimento não pode ser no futuro.";
    }

    if (cells.lot === "") errors.lot = "Informe o lote.";
    if (cells.invernada === "") errors.invernada = "Informe a invernada.";

    let weightKg: number | undefined;
    if (cells.weightKg !== "") {
      const parsed = parseWeight(at(row, "weightKg"));
      if (parsed === null) errors.weightKg = "Peso inválido.";
      else weightKg = parsed;
    }

    const line = index + 1;
    let status: RowStatus;
    let duplicateReason: ImportRow["duplicateReason"];
    let payload: ImportAnimalPayload | undefined;

    if (earTag !== "" && existing.has(earTag)) {
      status = "duplicate";
      duplicateReason = "in_herd";
    } else if (earTag !== "" && seen.has(earTag)) {
      status = "duplicate";
      duplicateReason = "in_file";
    } else if (Object.keys(errors).length > 0) {
      status = "error";
      if (earTag !== "") seen.add(earTag);
    } else {
      status = "ok";
      seen.add(earTag);
      payload = {
        earTag,
        category: parsedCategory!.category,
        customCategoryId: parsedCategory!.customCategoryId,
        breed: cells.breed,
        sex: sex as Sex,
        birthDate: birthDate as string,
        lot: cells.lot,
        invernada: cells.invernada,
        weightKg,
      };
    }

    counts[status] += 1;
    counts.total += 1;
    rows.push({ line, cells, status, errors, duplicateReason, payload });
  });

  return { rows, counts };
}

/**
 * Adds farm-aware location validation to a syntactically parsed preview.
 * Unknown fixed codes and lot/location conflicts are marked on every affected
 * row before the user can confirm; the server repeats the same validation as
 * the transactional authority.
 */
export function validateImportRowLocations(
  result: ImportParseResult,
  existingLots: readonly ExistingImportLot[],
  invernadas: readonly ImportLocationInvernada[]
): ImportParseResult {
  if (result.headerError) return result;
  const candidates = result.rows.flatMap((row) =>
    row.status === "ok" && row.payload ? [row.payload] : []
  );
  if (candidates.length === 0) return result;

  // The server resolver intentionally fails fast on unknown codes. The preview
  // must go further: after excluding those already-invalid rows, validate the
  // remainder again so an independent lot conflict cannot survive as "ok" and
  // fail only after the user confirms the import.
  const missingCodes = new Set<string>();
  const conflictingLots = new Set<string>();
  let remaining = candidates;
  while (remaining.length > 0) {
    const resolution = resolveImportLocations(
      remaining,
      existingLots,
      invernadas
    );
    if (resolution.ok) break;

    if (resolution.error === "invernada_not_found") {
      for (const code of resolution.codes) missingCodes.add(code);
      const codes = new Set(resolution.codes);
      remaining = remaining.filter((row) => !codes.has(row.invernada));
    } else {
      for (const lot of resolution.lots) conflictingLots.add(lot);
      const lots = new Set(resolution.lots);
      remaining = remaining.filter((row) => !lots.has(row.lot));
    }
  }

  if (missingCodes.size === 0 && conflictingLots.size === 0) return result;

  let changed = 0;
  const rows = result.rows.map((row): ImportRow => {
    if (row.status !== "ok" || !row.payload) return row;
    const message = missingCodes.has(row.payload.invernada)
      ? "Código de invernada não cadastrado."
      : conflictingLots.has(row.payload.lot)
        ? "Este lote está ou aparece em outra invernada."
        : null;
    if (message === null) return row;
    changed += 1;
    return {
      ...row,
      status: "error",
      errors: { ...row.errors, invernada: message },
      payload: undefined,
    };
  });

  return {
    ...result,
    rows,
    counts: {
      ...result.counts,
      ok: result.counts.ok - changed,
      error: result.counts.error + changed,
    },
  };
}

/** Payloads of the rows worth sending (status "ok"). */
export function importablePayloads(result: ImportParseResult): ImportAnimalPayload[] {
  return result.rows
    .filter((row) => row.status === "ok" && row.payload)
    .map((row) => row.payload as ImportAnimalPayload);
}

/* -------------------------------------------------------------------------- */
/* Template                                                                   */
/* -------------------------------------------------------------------------- */

/** Header row of the downloadable model, in pt-BR. */
export const TEMPLATE_HEADERS = [
  "brinco",
  "categoria",
  "raça",
  "sexo",
  "nascimento",
  "lote",
  "invernada",
  "peso",
] as const;

/**
 * CSV text for the "Baixar modelo" download: BOM (so Excel reads the accents) +
 * header + one example row. Whole-kg weight in the sample so the decimal comma
 * never collides with the CSV separator.
 */
export function buildTemplateCsv(): string {
  const header = TEMPLATE_HEADERS.join(",");
  const example = "BR-1042,Novilha,Nelore,,15/03/2023,Lote 1,01,320";
  return `﻿${header}\n${example}\n`;
}
