# Cadastrar vários animais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the farmer register a group of animals from one page: a padrão shared by the group, one line per brinco, overrides per line, saved all or nothing.

**Architecture:** A pure module in `lib/domain` owns every decision the page makes (sequence, paste, effective values, validation, payloads). `POST /animals/batch` inserts the batch in one transaction through a new use case beside `Add.useCase`. The store gains `addAnimals`; the page at `/herd/cadastrar-varios` composes a defaults card, a desktop table, phone cards and two dialogs. The Rebanho header's "Cadastrar" opens a chooser in front of today's dialog.

**Tech Stack:** Next.js 16 app router, React 19, Zustand store, Elysia API with Eden Treaty, Drizzle ORM on PostgreSQL, vitest with a chainable db stub, Tailwind 4 tokens, shadcn `Dialog`/`Select`/`Button`/`Input`/`Textarea`, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-12-cadastrar-varios-animais-design.md`

## Global Constraints

- pt-BR copy, verbatim from the spec. Tokens only (`text-ink`, `text-ink-soft`, `bg-panel`, `bg-surface`, `border-hairline`, `text-brand`, `bg-brand`, `text-overdue`, `text-attention`); never loose hex.
- 44px touch targets on the phone: `min-h-11`; desktop table controls are `h-8`.
- Read `node_modules/next/dist/docs/` before Next-specific code. `Link` takes `onNavigate` with `preventDefault()` in this version.
- Business rules live in `lib/domain/animalBatch.ts`; components hold state and markup only.
- A batch holds at most 500 lines (`BATCH_MAX_ROWS`), client and server.
- A refused batch writes nothing: every check runs before the first insert.
- **No commits during the tasks.** One `feat(herd): ...` commit at the end, after the user picks commit.
- Commands: `pnpm exec vitest run <file>`, `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`.

---

## File map

| File | Responsibility |
| --- | --- |
| `lib/domain/animalBatch.ts` (+ `__tests__/animalBatch.test.ts`) | sequence, paste, blank lines, effective values, overrides, validation, payloads |
| `lib/api/domains/animals/useCases/AddBatch.useCase.ts` (+ `__tests__/AddBatch.test.ts`) | the batch transaction |
| `lib/api/domains/animals/schemas/animal.schema.ts` | `NewAnimalsBody` |
| `lib/api/domains/animals/animals.controller.ts` | `POST /animals/batch` |
| `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap` | the new route pinned |
| `lib/store/useHerdStore.ts` | `addAnimals`, `AddAnimalsResult` |
| `components/herd/RegisterAnimalDialog.tsx` | controlled, trigger removed |
| `components/herd/AddAnimalsButton.tsx` | header button + chooser + single dialog |
| `app/(app)/herd/page.tsx` | uses `AddAnimalsButton` |
| `app/(app)/herd/cadastrar-varios/page.tsx` | route |
| `components/herd/batch/BatchFieldSelects.tsx` | option lists from the store, `FieldSelect` |
| `components/herd/batch/BatchDefaultsCard.tsx` | Padrão do grupo |
| `components/herd/batch/BatchRowsTable.tsx` | desktop table |
| `components/herd/batch/BatchRowCard.tsx` | phone card |
| `components/herd/batch/EarTagSequenceDialog.tsx` | Gerar sequência |
| `components/herd/batch/PasteEarTagsDialog.tsx` | Colar brincos |
| `components/herd/batch/BatchRegisterForm.tsx` | state, save, leave guard, action bar |

---

### Task 1: The pure batch module

**Files:**
- Create: `lib/domain/animalBatch.ts`
- Test: `lib/domain/__tests__/animalBatch.test.ts`

**Interfaces:**
- Consumes: `impliedSex(category)` and `parseImportDate(raw)` from `lib/domain/herdImport.ts`; `CATEGORY_LABEL` from `lib/domain/labels.ts`; `Category`, `CustomCategory`, `Sex` from `lib/types`.
- Produces:
  - `BATCH_MAX_ROWS = 500`
  - `type BatchField = "category" | "breed" | "sex" | "birthDate" | "lotId"`
  - `interface BatchDefaults { category: string; breed: string; sex: Sex | ""; birthDate: string; lotId: string }` — `category` is `"base:<category>"` or `"custom:<id>"`
  - `interface BatchRow { key: string; earTag: string; weightKg: string; overrides: Partial<BatchDefaults> }`
  - `interface EffectiveRow extends BatchDefaults { sexLocked: boolean }`
  - `type BatchRowErrors = Partial<Record<"earTag" | "weightKg" | BatchField, string>>`
  - `type BatchDefaultErrors = Partial<Record<BatchField, string>>`
  - `interface BatchContext { existingEarTags: readonly string[]; customCategories: readonly CustomCategory[]; todayIso: string }`
  - `interface BatchValidation { rows: BatchRowErrors[]; defaults: BatchDefaultErrors; filledCount: number; weighedCount: number; problemRows: number; valid: boolean }`
  - `interface BatchAnimal { earTag; category: Category; customCategoryId?; breed; sex: Sex; birthDate; lotId; initialWeightKg? }`
  - `resolveCategory(choice, customCategories): { category: Category; customCategoryId?: string } | null`
  - `sequenceEarTags(prefix, first, count): string[]`
  - `parseEarTagList(text): { earTags: string[]; repeated: string[] }`
  - `isBlankRow(row): boolean`
  - `appendEarTags(rows, earTags, newKey): { rows: BatchRow[]; dropped: number }`
  - `effectiveRow(row, defaults, customCategories): EffectiveRow`
  - `withOverride(row, field, value, defaults, customCategories): BatchRow`
  - `parseWeightKg(text): number | undefined | null`
  - `validateBatch(rows, defaults, ctx): BatchValidation`
  - `removeProblemRows(rows, validation): BatchRow[]`
  - `batchPayloads(rows, defaults, customCategories): BatchAnimal[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import type { CustomCategory } from "@/lib/types";
import {
  BATCH_MAX_ROWS,
  appendEarTags,
  batchPayloads,
  effectiveRow,
  isBlankRow,
  parseEarTagList,
  parseWeightKg,
  removeProblemRows,
  sequenceEarTags,
  validateBatch,
  withOverride,
  type BatchDefaults,
  type BatchRow,
} from "@/lib/domain/animalBatch";

const TODAY = "2026-09-12";

const DEFAULTS: BatchDefaults = {
  category: "base:calf",
  breed: "Nelore",
  sex: "female",
  birthDate: "2025",
  lotId: "lot-1",
};

const BLANK_DEFAULTS: BatchDefaults = { category: "", breed: "", sex: "", birthDate: "", lotId: "" };

const CUSTOM: CustomCategory[] = [{ id: "cc-1", name: "Garrote", baseCategory: "steer" }];

let seq = 0;
function row(earTag: string, patch: Partial<Omit<BatchRow, "key" | "earTag">> = {}): BatchRow {
  seq += 1;
  return { key: `r${seq}`, earTag, weightKg: "", overrides: {}, ...patch };
}

function ctx(existingEarTags: string[] = []) {
  return { existingEarTags, customCategories: CUSTOM, todayIso: TODAY };
}

const newKey = () => `k${++seq}`;

describe("sequenceEarTags", () => {
  it("runs from the first number with the prefix", () => {
    expect(sequenceEarTags("BR-", "1001", 3)).toEqual(["BR-1001", "BR-1002", "BR-1003"]);
  });

  it("keeps the width of the first number", () => {
    expect(sequenceEarTags("", "0098", 3)).toEqual(["0098", "0099", "0100"]);
  });

  it("grows past the width when the first number has no zeros to spare", () => {
    expect(sequenceEarTags("", "98", 3)).toEqual(["98", "99", "100"]);
  });

  it("returns nothing for a start that is not a number or a quantity below one", () => {
    expect(sequenceEarTags("BR-", "10a", 3)).toEqual([]);
    expect(sequenceEarTags("BR-", "1", 0)).toEqual([]);
  });

  it("stops at the batch limit", () => {
    expect(sequenceEarTags("", "1", 900)).toHaveLength(BATCH_MAX_ROWS);
  });
});

describe("parseEarTagList", () => {
  it("splits on lines, commas, semicolons and tabs and drops blanks", () => {
    expect(parseEarTagList("BR-1\r\nBR-2, BR-3;BR-4\tBR-5\n\n")).toEqual({
      earTags: ["BR-1", "BR-2", "BR-3", "BR-4", "BR-5"],
      repeated: [],
    });
  });

  it("keeps a repeated brinco once and reports it", () => {
    expect(parseEarTagList("BR-1\nBR-2\nBR-1\nBR-1")).toEqual({
      earTags: ["BR-1", "BR-2"],
      repeated: ["BR-1"],
    });
  });
});

describe("isBlankRow", () => {
  it("is blank with no brinco, no weight and no override", () => {
    expect(isBlankRow(row("  "))).toBe(true);
    expect(isBlankRow(row("", { weightKg: "180" }))).toBe(false);
    expect(isBlankRow(row("", { overrides: { sex: "male" } }))).toBe(false);
  });
});

describe("appendEarTags", () => {
  it("replaces the blank lines at the end of the list", () => {
    const result = appendEarTags([row("BR-1"), row(""), row("")], ["BR-2"], newKey);

    expect(result.rows.map((r) => r.earTag)).toEqual(["BR-1", "BR-2"]);
    expect(result.dropped).toBe(0);
  });

  it("keeps a blank line that sits between filled ones", () => {
    const result = appendEarTags([row(""), row("BR-1")], ["BR-2"], newKey);

    expect(result.rows.map((r) => r.earTag)).toEqual(["", "BR-1", "BR-2"]);
  });

  it("stops at the limit and counts what did not fit", () => {
    const full = Array.from({ length: BATCH_MAX_ROWS - 1 }, (_, i) => row(`A-${i}`));
    const result = appendEarTags(full, ["x", "y", "z"], newKey);

    expect(result.rows).toHaveLength(BATCH_MAX_ROWS);
    expect(result.dropped).toBe(2);
  });
});

describe("effectiveRow", () => {
  it("fills every field from the padrão", () => {
    expect(effectiveRow(row("BR-1"), DEFAULTS, CUSTOM)).toEqual({ ...DEFAULTS, sexLocked: false });
  });

  it("lets an override win", () => {
    const effective = effectiveRow(row("BR-1", { overrides: { breed: "Angus", sex: "male" } }), DEFAULTS, CUSTOM);

    expect(effective.breed).toBe("Angus");
    expect(effective.sex).toBe("male");
  });

  it("locks the sex a category implies, over any override", () => {
    const effective = effectiveRow(
      row("BR-1", { overrides: { category: "base:cow", sex: "male" } }),
      DEFAULTS,
      CUSTOM
    );

    expect(effective.sex).toBe("female");
    expect(effective.sexLocked).toBe(true);
  });

  it("reads the implied sex of a custom category from its base", () => {
    const effective = effectiveRow(row("BR-1", { overrides: { category: "custom:cc-1" } }), DEFAULTS, CUSTOM);

    expect(effective.sex).toBe("male");
    expect(effective.sexLocked).toBe(true);
  });
});

describe("withOverride", () => {
  it("records a value that differs from the padrão", () => {
    expect(withOverride(row("BR-1"), "breed", "Angus", DEFAULTS, CUSTOM).overrides).toEqual({ breed: "Angus" });
  });

  it("drops the override when the value matches the padrão or is blank", () => {
    const angus = row("BR-1", { overrides: { breed: "Angus", birthDate: "14/03/2025" } });

    const back = withOverride(angus, "breed", "Nelore", DEFAULTS, CUSTOM);
    expect(withOverride(back, "birthDate", "  ", DEFAULTS, CUSTOM).overrides).toEqual({});
  });

  it("keeps a typed nascimento even when it spells the padrão", () => {
    expect(withOverride(row("BR-1"), "birthDate", "2025", DEFAULTS, CUSTOM).overrides).toEqual({
      birthDate: "2025",
    });
  });

  it("drops a sex override when the new category implies the sex", () => {
    const macho = row("BR-1", { overrides: { sex: "male" } });

    expect(withOverride(macho, "category", "base:heifer", DEFAULTS, CUSTOM).overrides).toEqual({
      category: "base:heifer",
    });
  });
});

describe("parseWeightKg", () => {
  it("reads blank as no weight and a positive number with dot or comma", () => {
    expect(parseWeightKg("")).toBeUndefined();
    expect(parseWeightKg("182")).toBe(182);
    expect(parseWeightKg("182,5")).toBe(182.5);
    expect(parseWeightKg("182.5")).toBe(182.5);
  });

  it("refuses zero, negatives and text", () => {
    expect(parseWeightKg("0")).toBeNull();
    expect(parseWeightKg("-5")).toBeNull();
    expect(parseWeightKg("abc")).toBeNull();
  });
});

describe("validateBatch", () => {
  it("passes a clean list and counts filled and weighed lines, ignoring blanks", () => {
    const result = validateBatch([row("BR-1", { weightKg: "180" }), row("BR-2"), row("")], DEFAULTS, ctx());

    expect(result).toEqual({
      rows: [{}, {}, {}],
      defaults: {},
      filledCount: 2,
      weighedCount: 1,
      problemRows: 0,
      valid: true,
    });
  });

  it("flags a brinco already in the herd", () => {
    const result = validateBatch([row("BR-1"), row("BR-2")], DEFAULTS, ctx(["BR-2"]));

    expect(result.rows[1]).toEqual({ earTag: "Já existe um animal com este brinco." });
    expect(result.problemRows).toBe(1);
    expect(result.valid).toBe(false);
  });

  it("flags the later repeat with the line of the first", () => {
    const result = validateBatch([row("BR-1"), row("BR-2"), row(" BR-1 ")], DEFAULTS, ctx());

    expect(result.rows[0]).toEqual({});
    expect(result.rows[2]).toEqual({ earTag: "Brinco repetido na linha 1." });
  });

  it("asks for the brinco on a line that has other data", () => {
    const result = validateBatch([row("", { weightKg: "180" })], DEFAULTS, ctx());

    expect(result.rows[0].earTag).toBe("Informe o brinco do animal.");
  });

  it("flags a birth override that cannot be read or lies in the future", () => {
    const result = validateBatch(
      [
        row("BR-1", { overrides: { birthDate: "31/02/2025" } }),
        row("BR-2", { overrides: { birthDate: "2027" } }),
      ],
      DEFAULTS,
      ctx()
    );

    expect(result.rows[0].birthDate).toBe("Data inválida. Use DD/MM/AAAA ou só o ano.");
    expect(result.rows[1].birthDate).toBe("O nascimento não pode ser no futuro.");
  });

  it("flags a weight that is not a positive number", () => {
    const result = validateBatch([row("BR-1", { weightKg: "0" })], DEFAULTS, ctx());

    expect(result.rows[0].weightKg).toBe("Informe um peso válido em kg.");
  });

  it("reports a missing padrão field only when some line relies on it", () => {
    const result = validateBatch(
      [row("BR-1", { overrides: { breed: "Angus", lotId: "lot-2", birthDate: "2024" } })],
      BLANK_DEFAULTS,
      ctx()
    );

    expect(result.defaults).toEqual({
      category: "Selecione a categoria.",
      sex: "Selecione o sexo.",
    });
    expect(result.problemRows).toBe(0);
    expect(result.valid).toBe(false);
  });

  it("does not ask for the padrão sex when the category implies it", () => {
    const result = validateBatch([row("BR-1")], { ...DEFAULTS, category: "base:cow", sex: "" }, ctx());

    expect(result.defaults).toEqual({});
  });

  it("flags a padrão birth that cannot be read", () => {
    const result = validateBatch([row("BR-1")], { ...DEFAULTS, birthDate: "abc" }, ctx());

    expect(result.defaults.birthDate).toBe("Data inválida. Use DD/MM/AAAA ou só o ano.");
  });

  it("never passes an empty list", () => {
    const result = validateBatch([row("")], BLANK_DEFAULTS, ctx());

    expect(result.valid).toBe(false);
    expect(result.filledCount).toBe(0);
    expect(result.defaults).toEqual({});
  });
});

describe("removeProblemRows", () => {
  it("drops lines with errors of their own and keeps the rest", () => {
    const rows = [row("BR-1"), row("BR-1"), row("")];
    const kept = removeProblemRows(rows, validateBatch(rows, DEFAULTS, ctx()));

    expect(kept).toEqual([rows[0], rows[2]]);
  });
});

describe("batchPayloads", () => {
  it("turns each filled line into an animal", () => {
    const rows = [
      row(" BR-1 ", { weightKg: "182,5" }),
      row("BR-2", { overrides: { category: "custom:cc-1", birthDate: "14/03/2025" } }),
      row(""),
    ];

    expect(batchPayloads(rows, DEFAULTS, CUSTOM)).toEqual([
      {
        earTag: "BR-1",
        category: "calf",
        breed: "Nelore",
        sex: "female",
        birthDate: "2025-01-01",
        lotId: "lot-1",
        initialWeightKg: 182.5,
      },
      {
        earTag: "BR-2",
        category: "steer",
        customCategoryId: "cc-1",
        breed: "Nelore",
        sex: "male",
        birthDate: "2025-03-14",
        lotId: "lot-1",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm exec vitest run lib/domain/__tests__/animalBatch.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/domain/animalBatch"`.

- [ ] **Step 3: Implement the module**

```ts
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
 * "base:<category>" or "custom:<id>", and `birthDate` is the text as typed.
 * An empty string means the field is unset.
 */
export interface BatchDefaults {
  category: string;
  breed: string;
  sex: Sex | "";
  birthDate: string;
  lotId: string;
}

/** One line of the list; `overrides` holds only what differs from the padrão. */
export interface BatchRow {
  key: string;
  earTag: string;
  /** Text as typed: "182,5" and "182.5" both read. */
  weightKg: string;
  overrides: Partial<BatchDefaults>;
}

/** A line with the padrão filled in. */
export interface EffectiveRow extends BatchDefaults {
  /** The category implies the sex, so the sex cannot be picked. */
  sexLocked: boolean;
}

export type BatchRowErrors = Partial<Record<"earTag" | "weightKg" | BatchField, string>>;

export type BatchDefaultErrors = Partial<Record<BatchField, string>>;

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
  return { ...row, overrides: overrides as Partial<BatchDefaults> };
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
  const needed = new Set<BatchField>();
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

    const weight = parseWeightKg(row.weightKg);
    if (weight === null) errors.weightKg = MESSAGES.weightInvalid;
    else if (weight !== undefined) weighedCount += 1;

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
      const weight = parseWeightKg(row.weightKg);
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm exec vitest run lib/domain/__tests__/animalBatch.test.ts`
Expected: PASS, every test green.

---

### Task 2: POST /animals/batch

**Files:**
- Create: `lib/api/domains/animals/useCases/AddBatch.useCase.ts`
- Test: `lib/api/domains/animals/useCases/__tests__/AddBatch.test.ts`
- Modify: `lib/api/domains/animals/schemas/animal.schema.ts` (after `NewAnimalBody`)
- Modify: `lib/api/domains/animals/animals.controller.ts` (after `POST /`)
- Modify: `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap`

**Interfaces:**
- Consumes: `NewAnimalInput` from `Insert.useCase.ts`; `ValidateLotAssignmentUseCase`; `normalizeEarTag`; `isUniqueViolation`; `toWeighing`; `todayISO`.
- Produces:
  - `interface DuplicateEarTags { error: "duplicate_ear_tags"; earTags: string[] }`
  - `AddAnimalsUseCase.run({ farmId, inputs: NewAnimalInput[] }): Promise<Animal[] | DuplicateEarTags | "lot_not_found">`
  - `NewAnimalsBody = t.Object({ animals: t.Array(NewAnimalBody, { minItems: 1, maxItems: 500 }) })`
  - HTTP: 200 `Animal[]`, 409 `DuplicateEarTags`, 404 `{ error: "lot_not_found" }`.

- [ ] **Step 1: Write the failing use-case test**

```ts
/**
 * addAnimals: a batch of new animals in one transaction. A brinco repeated in
 * the batch or already on the farm, or a lot that fails validation, refuses the
 * whole batch before anything is written.
 *
 * Same chainable db stub as the other use-case tests: selects answer from a
 * queued list of rows, inserts record the rows and echo them from returning().
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as Record<string, unknown>[][],
    inserts: [] as Record<string, unknown>[][],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    for: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) =>
      Promise.resolve(
        run({
          select: selectBuilder,
          insert: () => ({
            values: (rows: Record<string, unknown>[]) => {
              state.inserts.push(rows);
              return { returning: () => Promise.resolve(rows) };
            },
          }),
        })
      ),
  },
}));

import { todayISO } from "@/lib/domain/dates";
import { AddAnimalsUseCase } from "../AddBatch.useCase";

const BASE = {
  category: "calf" as const,
  breed: "Nelore",
  sex: "female" as const,
  birthDate: "2025-01-01",
  lotId: "lot-1",
};

beforeEach(() => {
  state.selectResults = [];
  state.inserts = [];
});

describe("addAnimals", () => {
  it("inserts the animals and their first weighings", async () => {
    // taken brincos, the lot, its open placement
    state.selectResults = [[], [{ id: "lot-1" }], [{ id: 7 }]];

    const result = await new AddAnimalsUseCase().run({
      farmId: 1,
      inputs: [
        { ...BASE, earTag: " BR-1 ", initialWeightKg: 182 },
        { ...BASE, earTag: "BR-2", sex: "male" },
      ],
    });

    if (!Array.isArray(result)) throw new Error(`expected animals, got ${JSON.stringify(result)}`);
    expect(result.map((animal) => animal.earTag)).toEqual(["BR-1", "BR-2"]);
    expect(result[0].weighings).toEqual([{ date: todayISO(), weightKg: 182 }]);
    expect(result[1].weighings).toEqual([]);
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0]).toHaveLength(2);
    expect(state.inserts[1]).toEqual([
      { animalId: result[0].id, date: todayISO(), weightKg: 182 },
    ]);
  });

  it("forces the base category of a custom one", async () => {
    state.selectResults = [[], [{ id: "lot-1" }], [{ id: 7 }], [{ id: "cc-1", baseCategory: "steer" }]];

    const result = await new AddAnimalsUseCase().run({
      farmId: 1,
      inputs: [{ ...BASE, earTag: "BR-1", sex: "male", customCategoryId: "cc-1" }],
    });

    if (!Array.isArray(result)) throw new Error("expected animals");
    expect(result[0]).toMatchObject({ category: "steer", customCategoryId: "cc-1" });
  });

  it("refuses a brinco already on the farm and writes nothing", async () => {
    state.selectResults = [[{ earTag: "BR-2" }]];

    const result = await new AddAnimalsUseCase().run({
      farmId: 1,
      inputs: [{ ...BASE, earTag: "BR-1" }, { ...BASE, earTag: "BR-2" }],
    });

    expect(result).toEqual({ error: "duplicate_ear_tags", earTags: ["BR-2"] });
    expect(state.inserts).toEqual([]);
  });

  it("refuses a brinco repeated inside the batch", async () => {
    const result = await new AddAnimalsUseCase().run({
      farmId: 1,
      inputs: [{ ...BASE, earTag: "BR-1" }, { ...BASE, earTag: "BR-1 " }],
    });

    expect(result).toEqual({ error: "duplicate_ear_tags", earTags: ["BR-1"] });
    expect(state.inserts).toEqual([]);
  });

  it("refuses a lot that fails validation", async () => {
    state.selectResults = [[], []];

    const result = await new AddAnimalsUseCase().run({
      farmId: 1,
      inputs: [{ ...BASE, earTag: "BR-1" }],
    });

    expect(result).toBe("lot_not_found");
    expect(state.inserts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run lib/api/domains/animals/useCases/__tests__/AddBatch.test.ts`
Expected: FAIL, cannot resolve `../AddBatch.useCase`.

- [ ] **Step 3: Implement the use case**

```ts
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { animals, customCategories, weighings } from "@/lib/db/schema";
import { todayISO } from "@/lib/domain/dates";
import { normalizeEarTag } from "@/lib/domain/earTags";
import { isUniqueViolation } from "@/lib/api/dbErrors";
import { toWeighing } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import type { NewAnimalInput } from "./Insert.useCase";
import {
  ValidateLotAssignmentUseCase,
  type LotAssignmentError,
} from "./ValidateLotAssignment.useCase";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Animal, Weighing } from "@/lib/types";

/** Brincos that refuse the batch; empty when a concurrent insert took one. */
export interface DuplicateEarTags {
  error: "duplicate_ear_tags";
  earTags: string[];
}

interface AddAnimalsUseCaseProps {
  farmId: number;
  inputs: NewAnimalInput[];
}

type AddAnimalsUseCaseResponse = Animal[] | DuplicateEarTags | LotAssignmentError;

type CurrUseCase = _UseCase<AddAnimalsUseCaseProps, AddAnimalsUseCaseResponse>;

const duplicates = (earTags: string[]): DuplicateEarTags => ({
  error: "duplicate_ear_tags",
  earTags: [...new Set(earTags)],
});

/**
 * Registers a batch of animals ("Cadastrar vários animais") in one
 * transaction, all or nothing. Every refusal happens before the first insert:
 * a brinco repeated in the batch or already on the farm (active or not), and
 * a lot that is missing, cross-farm or unplaced. Each distinct lot is validated
 * once and stays locked until commit. Animals go in one statement and their
 * optional first weighings, dated today, in another.
 */
export class AddAnimalsUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("AddAnimalsUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, inputs }) => {
    try {
      return await this.repository.transaction(async (tx) => {
        const earTags = inputs.map((input) => normalizeEarTag(input.earTag));
        const repeated = earTags.filter((earTag, index) => earTags.indexOf(earTag) !== index);
        if (repeated.length > 0) return duplicates(repeated);

        const taken = await tx
          .select({ earTag: animals.earTag })
          .from(animals)
          .where(and(eq(animals.farmId, farmId), inArray(animals.earTag, earTags)));
        if (taken.length > 0) return duplicates(taken.map((row) => row.earTag));

        for (const lotId of new Set(inputs.map((input) => input.lotId))) {
          const lotError = await new ValidateLotAssignmentUseCase(tx).run({ farmId, lotId });
          if (lotError) return lotError;
        }

        const customIds = [
          ...new Set(inputs.flatMap((input) => (input.customCategoryId ? [input.customCategoryId] : []))),
        ];
        const customs =
          customIds.length === 0
            ? []
            : await tx
                .select()
                .from(customCategories)
                .where(and(eq(customCategories.farmId, farmId), inArray(customCategories.id, customIds)));
        const baseById = new Map(customs.map((custom) => [custom.id, custom.baseCategory]));

        const rows = inputs.map((input, index) => {
          const base = input.customCategoryId ? baseById.get(input.customCategoryId) : undefined;
          return {
            id: randomUUID(),
            farmId,
            earTag: earTags[index],
            category: base ?? input.category,
            customCategoryId: base ? (input.customCategoryId ?? null) : null,
            breed: input.breed,
            sex: input.sex,
            birthDate: input.birthDate,
            lotId: input.lotId,
            active: true,
          };
        });
        const inserted = await tx.insert(animals).values(rows).returning();

        const today = todayISO();
        const firstWeighings = inputs.flatMap((input, index) =>
          input.initialWeightKg === undefined
            ? []
            : [{ animalId: rows[index].id, date: today, weightKg: input.initialWeightKg }]
        );
        const insertedWeighings =
          firstWeighings.length === 0
            ? []
            : await tx.insert(weighings).values(firstWeighings).returning();
        const weighingByAnimal = new Map<string, Weighing>(
          insertedWeighings.map((row) => [row.animalId, toWeighing(row)])
        );

        return inserted.map((row) => {
          const weighing = weighingByAnimal.get(row.id);
          return {
            id: row.id,
            earTag: row.earTag,
            category: row.category,
            customCategoryId: row.customCategoryId ?? undefined,
            breed: row.breed,
            sex: row.sex,
            birthDate: row.birthDate,
            lotId: row.lotId,
            active: row.active,
            weighings: weighing ? [weighing] : [],
          };
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) return duplicates([]);
      throw error;
    }
  };
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run lib/api/domains/animals/useCases/__tests__/AddBatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the body schema**

In `animal.schema.ts`, right after `NewAnimalBody`:

```ts
/** Body of POST /animals/batch ("Cadastrar vários animais"). */
export const NewAnimalsBody = t.Object({
  animals: t.Array(NewAnimalBody, { minItems: 1, maxItems: 500 }),
});
```

- [ ] **Step 6: Add the route**

In `animals.controller.ts`, import `AddAnimalsUseCase` and `NewAnimalsBody`, then after `.post("/", …)`:

```ts
  .post(
    "/batch",
    async ({ farmId, body, status }) => {
      const result = await new AddAnimalsUseCase().run({ farmId, inputs: body.animals });
      if (result === "lot_not_found") return status(404, { error: result });
      if ("error" in result) return status(409, result);
      return result;
    },
    { farm: true, body: NewAnimalsBody }
  )
```

Update the header comment to "registration (one or a batch), bulk import, edits and the baixa".

- [ ] **Step 7: Pin the route**

Run: `pnpm exec vitest run lib/api/__tests__/routeTable.test.ts -u`
Then read the snapshot diff: exactly one added line, `"POST /api/herd/animals/batch",`.

---

### Task 3: Store action

**Files:**
- Modify: `lib/store/useHerdStore.ts` (types near `ImportSummary`, interface near `addAnimal`, implementation after `addAnimal`)

**Interfaces:**
- Consumes: `api.animals.batch.post({ animals })` (Eden, from Task 2).
- Produces: `addAnimals(animals: NewAnimal[]): Promise<AddAnimalsResult>` and `type AddAnimalsResult = { added: number } | { duplicates: string[] }`.

- [ ] **Step 1: Add the type and the action**

```ts
/** Outcome of a batch registration: how many went in, or the brincos that refused it. */
export type AddAnimalsResult = { added: number } | { duplicates: string[] };
```

```ts
  /** Registers a batch all or nothing; lists the brincos taken when refused. */
  addAnimals: (animals: NewAnimal[]) => Promise<AddAnimalsResult>;
```

```ts
  addAnimals: async (list) => {
    const { data, error } = await api.animals.batch.post({
      animals: list.map((animal) => ({ ...animal, earTag: animal.earTag.trim() })),
    });
    if (error) {
      if (error.status === 409) {
        const detail = error.value as { earTags?: string[] };
        return { duplicates: detail.earTags ?? [] };
      }
      apiFail("cadastrar os animais", error.status);
    }
    const created = data as Animal[];
    set((s) => ({ animals: [...s.animals, ...created] }));
    return { added: created.length };
  },
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

---

### Task 4: The chooser in the Rebanho header

**Files:**
- Modify: `components/herd/RegisterAnimalDialog.tsx`
- Create: `components/herd/AddAnimalsButton.tsx`
- Modify: `app/(app)/herd/page.tsx:13,86`

**Interfaces:**
- Produces: `RegisterAnimalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })` with no trigger and no internal reset (the parent remounts it with a new `key` each time it opens); `AddAnimalsButton()`.

- [ ] **Step 1: Make the dialog controlled**

Remove `DialogTrigger`, the `Plus` import, the `open` state and the reset inside `onOpenChange`. Take `open`/`onOpenChange` props, pass them to `<Dialog>`, and call `onOpenChange(false)` after a successful submit. Update the header comment: the trigger now lives in `AddAnimalsButton`.

- [ ] **Step 2: Write `AddAnimalsButton`**

`Button` "Cadastrar" (`Plus`, `min-h-11`) as the chooser's `DialogTrigger`. `DialogContent` with title "Cadastrar animais", description "Como você quer registrar?" and two rows styled `flex min-h-11 items-center gap-3 rounded-lg border border-hairline bg-panel p-3 text-left transition-colors hover:border-brand/45 hover:bg-surface`, each with a `size-9 rounded-[9px] bg-brand-soft` tile holding `Tag` / `Tags` (`size-[18px] text-brand`), title `text-sm font-medium text-ink`, text `text-xs text-ink-soft`, and `ChevronRight`:

- "Um animal" — "Brinco, categoria, raça, lote e peso de um animal só." — a `button` that closes the chooser, bumps `singleKey` and opens `RegisterAnimalDialog key={singleKey}`.
- "Vários animais" — "Um padrão para o grupo e uma linha por brinco. Para uma compra, uma desmama, uma leva de bezerros." — a `Link href="/herd/cadastrar-varios"` that closes the chooser.

- [ ] **Step 3: Use it on the page**

Replace `<RegisterAnimalDialog />` with `<AddAnimalsButton />` and swap the import.

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: clean.

---

### Task 5: The batch page

**Files:**
- Create: `app/(app)/herd/cadastrar-varios/page.tsx`
- Create: `components/herd/batch/BatchFieldSelects.tsx`, `BatchDefaultsCard.tsx`, `BatchRowsTable.tsx`, `BatchRowCard.tsx`, `EarTagSequenceDialog.tsx`, `PasteEarTagsDialog.tsx`, `BatchRegisterForm.tsx`

**Interfaces:**
- Consumes: everything from Task 1; `addAnimals` (Task 3); `animalPrerequisites`/`blocksRegistration`; `activeLots`, `currentlyPlacedLots`, `currentPlacementForLot`; `CATEGORY_LABEL`, `SEX_LABEL`; `useToast`.
- Produces:
  - `interface FieldOption { value: string; label: string }`
  - `useBatchOptions(): { categories: FieldOption[]; breeds: FieldOption[]; sexes: FieldOption[]; lots: FieldOption[] }` — categories `base:*` then `custom:*` as "Nome (Base)"; lots are the placed lots as "Nome · Inv. código" ("Sem invernada" fallback)
  - `FieldSelect({ value, options, onChange, placeholder?, disabled?, invalid?, className?, ariaLabel?, id?, children? })` — shadcn `Select`; `children` renders before `SelectValue` (the override dot)
  - `BatchDefaultsCard({ defaults, errors, options, prerequisites, onChange(field, value) })`
  - `BatchRowsTable({ rows, defaults, errors, options, customCategories, onEarTag, onWeight, onOverride, onRemove, onEarTagEnter })`
  - `BatchRowCard({ index, row, defaults, errors, options, customCategories, expanded, onToggle, onEarTag, onWeight, onOverride, onRemove, onEarTagEnter })`
  - `EarTagSequenceDialog({ open, onOpenChange, room, existingEarTags, onAdd(earTags) })`
  - `PasteEarTagsDialog({ open, onOpenChange, room, onAdd(earTags) })`
  - Handler shapes: `onEarTag(key, value)`, `onWeight(key, value)`, `onOverride(key, field: BatchField, value)`, `onRemove(key)`, `onEarTagEnter(key)`.

- [ ] **Step 1: Route**

```tsx
import { BatchRegisterForm } from "@/components/herd/batch/BatchRegisterForm";

/** /herd/cadastrar-varios: a group of animals from one padrão and a list of brincos. */
export default function RegisterManyAnimalsPage() {
  return <BatchRegisterForm />;
}
```

- [ ] **Step 2: Selects and options** (`BatchFieldSelects.tsx`) per the interfaces above.

- [ ] **Step 3: Padrão do grupo** (`BatchDefaultsCard.tsx`)

`SectionCard` "Padrão do grupo", action `text-xs text-ink-soft` "Vale para toda linha que você não alterar" (hidden below `sm`). Grid `grid gap-4 sm:grid-cols-2 lg:grid-cols-6`, Lote `lg:col-span-2`. Controls `min-h-11 w-full`. Sexo disabled with "Definido pela categoria." when the categoria implies it. Nascimento `Input` with placeholder "Ex.: 2025" and hint "DD/MM/AAAA ou só o ano". Raça/Lote disabled with the `text-attention` prerequisite hint when missing. Errors in `text-xs text-overdue`, controls `aria-invalid`.

- [ ] **Step 4: Desktop table** (`BatchRowsTable.tsx`)

`overflow-x-auto`, `table-fixed min-w-[960px]`, columns 44/150/132/120/108/156/198/124/56. Header `h-10 bg-surface text-xs font-medium text-ink-soft`. Rows `group/row border-b border-hairline hover:bg-surface`; a row with errors `bg-overdue-soft/35` with a second `<tr>` listing its messages (`text-xs text-overdue`) under the Brinco column. Brinco and Peso are bordered `h-8` inputs (Brinco `font-mono font-medium`, Peso `font-mono`, `inputMode="decimal"`). Inherited selects: `h-8 border-transparent bg-transparent text-ink-soft shadow-none hover:border-hairline`; overridden: `text-ink` with a `size-1.5 rounded-full bg-brand` dot and a `RotateCcw` "Voltar ao padrão" button that shows on row hover or focus. Nascimento is an `Input` whose value is the override and whose placeholder is the padrão. Every input has `aria-label` with the line number; Brinco inputs carry `data-batch-eartag={row.key}`. Enter on Brinco calls `onEarTagEnter`. Footer: ghost "Adicionar linha" (`Plus`), hint "Enter no último brinco também cria uma linha", legend with the dot "alterado nesta linha · cinza segue o padrão do grupo".

- [ ] **Step 5: Phone card** (`BatchRowCard.tsx`)

`rounded-lg border border-hairline bg-panel p-3` (`border-brand/45` when expanded). Line number, Brinco `min-h-11 font-mono text-base`, Peso `w-24 min-h-11` with "kg". Summary line: overridden values with dots, or "Segue o padrão". "Alterar"/"Fechar" `text-brand` toggles the five fields (2-column grid, Lote spanning), each overridden one with "Voltar ao padrão", then a ghost `text-overdue` "Remover linha". Errors listed inside the card.

- [ ] **Step 6: Dialogs**

`EarTagSequenceDialog`: `sm:max-w-md`, title "Gerar sequência de brincos", description "Cria uma linha por brinco, já com o padrão do grupo." Fields Prefixo / Primeiro nº / Quantidade (`inputMode="numeric"`), hint "Zeros à esquerda ficam: 0098, 0099, 0100." Preview card (`bg-surface`) "Prévia · N linhas" with the first three and the last brinco, and in `text-attention` the brincos of the sequence already on the farm ("BR-1004 e BR-1017 já existem no rebanho. Essas linhas entram marcadas para você corrigir.", up to three named plus "e mais N"). When `room` is smaller than the quantity: "Cabem mais N linhas nesta lista." Footer "Cancelar" / "Adicionar N linhas", disabled with no valid sequence.

`PasteEarTagsDialog`: title "Colar brincos", description "Cole uma coluna da planilha ou uma lista do WhatsApp. Um brinco por linha, ou separados por vírgula." `Textarea` `min-h-40 font-mono`. Summary "N brincos" plus "· BR-2214 aparece duas vezes e entra uma só" (or "· 3 repetidos entram uma vez só") plus "· cabem N" when over `room`. Footer "Cancelar" / "Adicionar N linhas".

- [ ] **Step 7: The form** (`BatchRegisterForm.tsx`)

State: `defaults`, `rows` (starts `[]`), `attempted`, `busy`, `taken: string[]`, `expandedKey`, `focusKey`, `sequenceOpen`, `pasteOpen`, `leaveOpen`. Keys come from a module counter.

- `validation = useMemo(() => validateBatch(rows, defaults, { existingEarTags: [...animals.map(a => a.earTag), ...taken], customCategories, todayIso: todayISO() }))`.
- Default change: set the field; a categoria that implies the sex also sets `defaults.sex`.
- Row handlers use `withOverride` for fields; `onEarTagEnter(key)` focuses the next line's Brinco or appends a blank line and focuses it; an effect focuses the visible `[data-batch-eartag=key]` input when `focusKey` changes.
- Dialogs append through `appendEarTags`.
- Empty list: `SectionCard` "Animais" holding `EmptyState` (`Tags`, "Nenhum brinco na lista", "Gere uma sequência numerada, cole os brincos de uma planilha ou digite o primeiro.") and the three outline buttons; otherwise the card header shows the count and "Gerar sequência" / "Colar brincos", the body shows the table (`hidden md:block`) and the cards (`md:hidden`).
- Default errors show when `attempted` or the field is not empty.
- Action bar `fixed inset-x-0 z-30 border-t border-hairline bg-panel/95 backdrop-blur-sm md:left-60 bottom-[calc(3.125rem+env(safe-area-inset-bottom))] md:bottom-0`, inner `mx-auto max-w-6xl px-4 py-3 md:px-8`; page container gets `pb-40`. States per the spec: empty / problems ("N linhas com problema" + "Remover essas linhas", or "Complete o padrão do grupo") / ready ("N animais prontos · M com peso, registrado como a primeira pesagem"). Primary "Cadastrar N animais" disabled while empty, busy, blocked by prerequisites, with row problems, or after an attempt with padrão errors.
- Save: `setAttempted(true)`; stop unless `validation.valid`; `addAnimals(batchPayloads(...))`; duplicates → add to `taken` (an empty list toasts "Um dos brincos acabou de ser cadastrado. Recarregue a página e tente de novo."); success → `savedRef = true`, toast "N animais cadastrados" ("1 animal cadastrado"), `router.push("/herd")`.
- Leave guard: `dirty = rows.some(r => !isBlankRow(r))`; `beforeunload` listener while dirty and not saved; the back `Link` gets `onNavigate` that prevents and opens the confirm; "Cancelar" does the same; the confirm dialog "Descartar a lista?" / "Os N animais preenchidos não foram cadastrados." / "Continuar editando" / "Descartar" (`variant="destructive"`), which sets `savedRef` and pushes `/herd`.

- [ ] **Step 8: Typecheck, lint and tests**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: clean; all tests pass.

---

### Task 6: Check it in the running app

- [ ] **Step 1:** Build and start on a free port per the smoke-test memory (`pnpm build`, `next start -p 3010` with `DATABASE_URL` through the socat bridge), sign in as a throwaway `teste.*` user with a seeded farm.
- [ ] **Step 2:** On `/herd`: "Cadastrar" opens the chooser; "Um animal" registers one animal as before.
- [ ] **Step 3:** On `/herd/cadastrar-varios` at 1440px: fill the padrão, generate `BR-9001` × 5, paste two more with a repeat, override a sexo and a nascimento, type an existing brinco and see the error, remove it, save; land on `/herd` with the toast and the seven animals listed.
- [ ] **Step 4:** At 390px: cards, "Alterar", the bar above the tab bar.
- [ ] **Step 5:** Back link with filled lines asks before leaving.
- [ ] **Step 6:** Stop the server and the bridge.
