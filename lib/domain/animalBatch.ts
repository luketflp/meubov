/**
 * "Cadastrar vários animais": one padrão for the group plus one line per
 * brinco, where a line may override any field of the padrão.
 *
 * Everything the page decides lives here, pure: how a sequence of brincos runs,
 * how a paste splits, what a line holds once the padrão fills its gaps, what is
 * wrong with the list and the animals it sends. Dates go through the import's
 * parser, so a bare year means 1 January here as it does there.
 */
import type { Category, CustomCategory, Sex } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import { impliedSex, parseImportDate } from "@/lib/domain/herdImport";

/** Most lines one batch may hold; POST /animals/batch accepts the same. */
export const BATCH_MAX_ROWS = 500;

/** Fields a line inherits from the padrão and may override. */
export type BatchField = "category" | "breed" | "sex" | "birthDate" | "lotId";

/**
 * The padrão as the form holds it. `category` is a select choice,
 * "base:<category>" or "custom:<id>"; `birthDate` and `weightKg` are the text
 * as typed. An empty string means the field is unset; the weight is optional.
 */
export interface BatchDefaults {
  category: string;
  breed: string;
  sex: Sex | "";
  birthDate: string;
  lotId: string;
  weightKg: string;
}

/** One line of the list; `overrides` holds only what differs from the padrão. */
export interface BatchRow {
  key: string;
  earTag: string;
  /** Text as typed: "182,5" and "182.5" both read. Blank takes the padrão's. */
  weightKg: string;
  overrides: Partial<Pick<BatchDefaults, BatchField>>;
}

/** A line with the padrão filled in. */
export interface EffectiveRow extends BatchDefaults {
  /** The category implies the sex, so the sex cannot be picked. */
  sexLocked: boolean;
}

export type BatchRowErrors = Partial<Record<"earTag" | "weightKg" | BatchField, string>>;

export type BatchDefaultErrors = Partial<Record<keyof BatchDefaults, string>>;

export interface BatchContext {
  /** Every brinco on the farm, active or not: the unique index covers both. */
  existingEarTags: readonly string[];
  customCategories: readonly CustomCategory[];
  todayIso: string;
}

export interface BatchValidation {
  /** Errors of each line's own fields, index-aligned with the rows. */
  rows: BatchRowErrors[];
  /** Padrão fields that are missing or wrong while some line relies on them. */
  defaults: BatchDefaultErrors;
  /** Lines that are not blank. */
  filledCount: number;
  /** Filled lines carrying a readable weight. */
  weighedCount: number;
  /** Filled lines with at least one error of their own. */
  problemRows: number;
  valid: boolean;
}

/** An animal ready for POST /animals/batch (the store's NewAnimal). */
export interface BatchAnimal {
  earTag: string;
  category: Category;
  customCategoryId?: string;
  breed: string;
  sex: Sex;
  birthDate: string;
  lotId: string;
  initialWeightKg?: number;
}

const MESSAGES = {
  earTagMissing: "Informe o brinco do animal.",
  earTagTaken: "Já existe um animal com este brinco.",
  weightInvalid: "Informe um peso válido em kg.",
  birthMissing: "Informe a data de nascimento.",
  birthInvalid: "Data inválida. Use DD/MM/AAAA ou só o ano.",
  birthFuture: "O nascimento não pode ser no futuro.",
  category: "Selecione a categoria.",
  breed: "Selecione a raça.",
  sex: "Selecione o sexo.",
  lotId: "Selecione o lote.",
} as const;

const BRINCO_SEPARATORS = /[\r\n,;\t]+/;

/** Resolves a select choice; null when unset or when the custom category is gone. */
export function resolveCategory(
  choice: string,
  customCategories: readonly CustomCategory[]
): { category: Category; customCategoryId?: string } | null {
  if (choice.startsWith("base:")) {
    const category = choice.slice("base:".length);
    return category in CATEGORY_LABEL ? { category: category as Category } : null;
  }
  if (choice.startsWith("custom:")) {
    const id = choice.slice("custom:".length);
    const custom = customCategories.find((item) => item.id === id);
    return custom ? { category: custom.baseCategory, customCategoryId: id } : null;
  }
  return null;
}

/**
 * Brincos from `first`, counting up. The number keeps the width of `first`, so
 * "0098" runs into "0100"; a start that is not a plain number yields nothing.
 */
export function sequenceEarTags(prefix: string, first: string, count: number): string[] {
  const digits = first.trim();
  if (!/^\d{1,15}$/.test(digits) || !Number.isInteger(count) || count < 1) return [];
  const start = Number(digits);
  const lead = prefix.trimStart();
  return Array.from(
    { length: Math.min(count, BATCH_MAX_ROWS) },
    (_, index) => `${lead}${String(start + index).padStart(digits.length, "0")}`
  );
}

/** Splits a pasted column or list; a brinco repeated in the paste enters once. */
export function parseEarTagList(text: string): { earTags: string[]; repeated: string[] } {
  const earTags: string[] = [];
  const repeated: string[] = [];
  const seen = new Set<string>();
  for (const part of text.split(BRINCO_SEPARATORS)) {
    const earTag = part.trim();
    if (earTag === "") continue;
    if (seen.has(earTag)) {
      if (!repeated.includes(earTag)) repeated.push(earTag);
      continue;
    }
    seen.add(earTag);
    earTags.push(earTag);
  }
  return { earTags, repeated };
}

/** A line nobody has touched: no brinco, no weight, no override. */
export function isBlankRow(row: BatchRow): boolean {
  return (
    row.earTag.trim() === "" &&
    row.weightKg.trim() === "" &&
    Object.keys(row.overrides).length === 0
  );
}

/**
 * Adds one line per brinco after the last filled line; blank lines at the end
 * are replaced, so the line the Enter key just created does not stay behind.
 */
export function appendEarTags(
  rows: readonly BatchRow[],
  earTags: readonly string[],
  newKey: () => string
): { rows: BatchRow[]; dropped: number } {
  let end = rows.length;
  while (end > 0 && isBlankRow(rows[end - 1])) end -= 1;
  const kept = rows.slice(0, end);
  const room = Math.max(BATCH_MAX_ROWS - kept.length, 0);
  const added = earTags
    .slice(0, room)
    .map((earTag) => ({ key: newKey(), earTag, weightKg: "", overrides: {} }));
  return { rows: [...kept, ...added], dropped: earTags.length - added.length };
}

/** What the line holds once the padrão fills what it does not override. */
export function effectiveRow(
  row: BatchRow,
  defaults: BatchDefaults,
  customCategories: readonly CustomCategory[]
): EffectiveRow {
  const category = row.overrides.category ?? defaults.category;
  const resolved = resolveCategory(category, customCategories);
  const implied = resolved ? impliedSex(resolved.category) : null;
  return {
    category,
    breed: row.overrides.breed ?? defaults.breed,
    sex: implied ?? row.overrides.sex ?? defaults.sex,
    birthDate: row.overrides.birthDate ?? defaults.birthDate,
    lotId: row.overrides.lotId ?? defaults.lotId,
    weightKg: row.weightKg.trim() !== "" ? row.weightKg : defaults.weightKg,
    sexLocked: implied !== null,
  };
}

/**
 * Sets one field of a line. A blank, or a pick equal to the padrão, is no
 * override at all; a typed nascimento stays even when it spells the padrão, so
 * the text does not vanish under the cursor. A category that implies the sex
 * drops a sex picked by hand.
 */
export function withOverride(
  row: BatchRow,
  field: BatchField,
  value: string,
  defaults: BatchDefaults,
  customCategories: readonly CustomCategory[]
): BatchRow {
  const overrides: Record<string, string> = { ...row.overrides };
  if (value.trim() === "" || (field !== "birthDate" && value === defaults[field])) {
    delete overrides[field];
  } else {
    overrides[field] = value;
  }
  if (field === "category") {
    const resolved = resolveCategory(value, customCategories);
    if (resolved && impliedSex(resolved.category)) delete overrides.sex;
  }
  return { ...row, overrides: overrides as BatchRow["overrides"] };
}

/** Weight in kg: undefined when blank, null when not a positive number. */
export function parseWeightKg(text: string): number | undefined | null {
  const raw = text.trim();
  if (raw === "") return undefined;
  if (!/^\d+([.,]\d+)?$/.test(raw)) return null;
  const weight = Number(raw.replace(",", "."));
  return weight > 0 ? weight : null;
}

function checkBirthDate(text: string, todayIso: string): { iso: string } | { error: string } {
  if (text.trim() === "") return { error: MESSAGES.birthMissing };
  const iso = parseImportDate(text);
  if (iso === null) return { error: MESSAGES.birthInvalid };
  if (iso > todayIso) return { error: MESSAGES.birthFuture };
  return { iso };
}

/**
 * Validates the list against the herd and itself. A line is charged only for
 * its own fields; a gap in the padrão is reported once, on the padrão, and only
 * when some filled line relies on that field.
 */
export function validateBatch(
  rows: readonly BatchRow[],
  defaults: BatchDefaults,
  ctx: BatchContext
): BatchValidation {
  const existing = new Set(ctx.existingEarTags);
  const firstLine = new Map<string, number>();
  const needed = new Set<keyof BatchDefaults>();
  let filledCount = 0;
  let weighedCount = 0;
  let problemRows = 0;

  const rowErrors = rows.map((row, index) => {
    const errors: BatchRowErrors = {};
    if (isBlankRow(row)) return errors;
    filledCount += 1;

    const earTag = row.earTag.trim();
    if (earTag === "") {
      errors.earTag = MESSAGES.earTagMissing;
    } else if (existing.has(earTag)) {
      errors.earTag = MESSAGES.earTagTaken;
    } else if (firstLine.has(earTag)) {
      errors.earTag = `Brinco repetido na linha ${firstLine.get(earTag)}.`;
    }
    if (earTag !== "" && !firstLine.has(earTag)) firstLine.set(earTag, index + 1);

    if (row.weightKg.trim() === "") needed.add("weightKg");
    const weight = parseWeightKg(row.weightKg.trim() === "" ? defaults.weightKg : row.weightKg);
    if (weight === null && row.weightKg.trim() !== "") errors.weightKg = MESSAGES.weightInvalid;
    else if (weight != null) weighedCount += 1;

    if (row.overrides.birthDate !== undefined) {
      const birth = checkBirthDate(row.overrides.birthDate, ctx.todayIso);
      if ("error" in birth) errors.birthDate = birth.error;
    } else {
      needed.add("birthDate");
    }
    for (const field of ["category", "breed", "lotId"] as const) {
      if (row.overrides[field] === undefined) needed.add(field);
    }
    const effective = effectiveRow(row, defaults, ctx.customCategories);
    if (!effective.sexLocked && row.overrides.sex === undefined) needed.add("sex");

    if (Object.keys(errors).length > 0) problemRows += 1;
    return errors;
  });

  const defaultErrors: BatchDefaultErrors = {};
  if (needed.has("category") && resolveCategory(defaults.category, ctx.customCategories) === null) {
    defaultErrors.category = MESSAGES.category;
  }
  if (needed.has("breed") && defaults.breed === "") defaultErrors.breed = MESSAGES.breed;
  if (needed.has("sex") && defaults.sex === "") defaultErrors.sex = MESSAGES.sex;
  if (needed.has("birthDate")) {
    const birth = checkBirthDate(defaults.birthDate, ctx.todayIso);
    if ("error" in birth) defaultErrors.birthDate = birth.error;
  }
  if (needed.has("lotId") && defaults.lotId === "") defaultErrors.lotId = MESSAGES.lotId;
  if (needed.has("weightKg") && parseWeightKg(defaults.weightKg) === null) {
    defaultErrors.weightKg = MESSAGES.weightInvalid;
  }

  return {
    rows: rowErrors,
    defaults: defaultErrors,
    filledCount,
    weighedCount,
    problemRows,
    valid: filledCount > 0 && problemRows === 0 && Object.keys(defaultErrors).length === 0,
  };
}

/** The list without the lines that carry errors of their own. */
export function removeProblemRows(rows: readonly BatchRow[], validation: BatchValidation): BatchRow[] {
  return rows.filter((_, index) => Object.keys(validation.rows[index] ?? {}).length === 0);
}

/** The animals a valid list sends; call only when `validateBatch` passed. */
export function batchPayloads(
  rows: readonly BatchRow[],
  defaults: BatchDefaults,
  customCategories: readonly CustomCategory[]
): BatchAnimal[] {
  return rows
    .filter((row) => !isBlankRow(row))
    .map((row) => {
      const effective = effectiveRow(row, defaults, customCategories);
      const category = resolveCategory(effective.category, customCategories);
      const birthDate = parseImportDate(effective.birthDate);
      const weight = parseWeightKg(effective.weightKg);
      if (!category || effective.sex === "" || birthDate === null || weight === null) {
        throw new Error(`Batch line ${row.earTag} is not valid; run validateBatch first`);
      }
      return {
        earTag: row.earTag.trim(),
        category: category.category,
        customCategoryId: category.customCategoryId,
        breed: effective.breed,
        sex: effective.sex,
        birthDate,
        lotId: effective.lotId,
        initialWeightKg: weight,
      };
    });
}
