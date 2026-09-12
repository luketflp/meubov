# Importar nascimentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a maternidade spreadsheet on the Nascimentos screen: one line per bezerro becomes a parto on the dam, a calf in the herd, its first weighing and, when the line says so, its baixa por morte.

**Architecture:** A pure module in `lib/domain/birthImport.ts` reads the sheet matrix, matches dams, raças and lotes against the herd, and builds the payloads; the dialog only reads the file and renders. `POST /api/herd/births/import` writes the accepted lines in one transaction through a new reproduction use case. The store gains `importBirths`, which reloads the herd after the write.

**Tech Stack:** Next.js 16 app router, React 19, Zustand, Elysia + Eden Treaty, Drizzle on PostgreSQL, SheetJS (`xlsx`, loaded on demand), vitest with the chainable db stub, Tailwind 4 tokens, shadcn `Dialog`/`Select`/`Badge`/`Table`, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-12-importar-nascimentos-design.md`

## Global Constraints

- pt-BR copy verbatim from the spec. Tokens only (`text-ink`, `text-ink-soft`, `bg-panel`, `bg-surface`, `border-hairline`, `text-attention`, `bg-attention-soft`, `text-overdue`); never loose hex.
- 2000 rows per import (`MAX_BIRTH_IMPORT_ROWS`), client and server schema.
- The categoria of every imported animal is `calf`; its birth date is the parto date; its weighing is dated the parto.
- A calf brinco already on the farm is skipped, never updated.
- Only lots with an open placement count (`currentlyPlacedLots`).
- Reuse `normalizeHeader`, `parseSex`, `parseWeight`, `parseImportDate` from `lib/domain/herdImport.ts`.
- Work on `main`. **No commits during the tasks.** One `feat(births): ...` commit at the end, after the user picks commit.
- Commands: `pnpm exec vitest run <file>`, `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`.

---

## File map

| File | Responsibility |
| --- | --- |
| `lib/domain/birthImport.ts` (+ `__tests__/birthImport.test.ts`) | headers, sheet merge, rows, dam/raça/lote matching, morreu, summary, payloads, template, brinco list |
| `lib/api/domains/reproduction/useCases/ImportBirths.useCase.ts` (+ `__tests__/ImportBirths.test.ts`) | the transaction |
| `lib/api/domains/reproduction/schemas/reproduction.schema.ts` | `ImportBirthRow`, `ImportBirthsBody` |
| `lib/api/domains/reproduction/births.controller.ts` | `POST /births/import` |
| `lib/api/app.ts` | mounts `birthsController` |
| `lib/api/__tests__/__snapshots__/routeTable.test.ts.snap` | the new route pinned |
| `lib/store/useHerdStore.ts` | `importBirths`, `ImportBirthsSummary` |
| `components/births/import-births-lots.tsx` | Lote da planilha panel |
| `components/births/import-births-preview.tsx` | table, phone cards, status cell |
| `components/births/import-births-dialog.tsx` | steps, file reading, footer, done summary |
| `app/(app)/nascimentos/page.tsx` | second header button |

---

### Task 1: Domain module

**Files:**
- Create: `lib/domain/birthImport.ts`
- Test: `lib/domain/__tests__/birthImport.test.ts`

**Interfaces:**
- Produces:

```ts
export const MAX_BIRTH_IMPORT_ROWS = 2000;
export type BirthImportField = "damEarTag" | "calfEarTag" | "sex" | "breed" | "weightKg" | "date" | "lot";
export const BIRTH_FIELD_LABEL: Record<BirthImportField, string>;
export function birthImportFieldForHeader(raw: string): BirthImportField | undefined;
export function mergeSheetCells(raw: unknown[][], formatted: unknown[][]): unknown[][];
export function breedKey(name: string): string;
export function lotValueKey(raw: string): string;

export interface BirthImportAnimal { id: string; earTag: string; sex: Sex; breed: string }
export interface BirthImportLot { id: string; name: string }
export interface BirthImportContext {
  animals: readonly BirthImportAnimal[];
  breeds: readonly string[];
  lots: readonly BirthImportLot[];
  todayIso: string;
}
export type BirthDam =
  | { kind: "matched"; id: string; earTag: string; breed: string }
  | { kind: "no_tag" }
  | { kind: "male"; earTag: string }
  | { kind: "not_found"; earTag: string };
export interface BirthImportRow {
  line: number;
  cells: Record<BirthImportField, string>;
  status: "ok" | "duplicate" | "error";
  errors: Partial<Record<BirthImportField, string>>;
  duplicateReason?: "in_file" | "in_herd";
  dam: BirthDam;
  breed: string;
  lotKey: string;
  deathNote?: string;
  parsed?: { calfEarTag: string; sex: Sex; date: string; weightKg?: number };
}
export interface BirthLotValue { key: string; label: string; lines: number; lotId?: string }
export interface BirthImportParseResult {
  headerError?: string;
  headers: string[];
  rows: BirthImportRow[];
  lotValues: BirthLotValue[];
  newBreeds: string[];
}
export type LotPicks = Record<string, string>;
export interface BirthImportSummary {
  total: number; ready: number; duplicate: number; error: number;
  withoutDam: number; deaths: number; unpickedLots: BirthLotValue[];
}
export interface ImportBirthPayload {
  calfEarTag: string; calfSex: Sex; breed: string; lotId: string; date: string;
  damId?: string; weightKg?: number; deathNotes?: string;
}
export function buildBirthImportRows(matrix: unknown[][], ctx: BirthImportContext): BirthImportParseResult;
export function summarizeBirthImport(result: BirthImportParseResult, picks: LotPicks): BirthImportSummary;
export function birthImportPayloads(result: BirthImportParseResult, picks: LotPicks): ImportBirthPayload[];
export function damNote(dam: BirthDam): string | null;
export function formatEarTagList(tags: readonly string[], limit?: number): string;
export function buildBirthTemplateCsv(): string;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  birthImportFieldForHeader,
  birthImportPayloads,
  buildBirthImportRows,
  buildBirthTemplateCsv,
  damNote,
  formatEarTagList,
  mergeSheetCells,
  MAX_BIRTH_IMPORT_ROWS,
  summarizeBirthImport,
  type BirthImportContext,
} from "@/lib/domain/birthImport";

const HEADERS = ["BRINCO MÃE", "BRINCO BEZ", "SEXO", "RAÇA", "PESO", "DATA", "LOTE"];

const ctx = (over: Partial<BirthImportContext> = {}): BirthImportContext => ({
  animals: [
    { id: "d1", earTag: "R381", sex: "female", breed: "Angus" },
    { id: "d2", earTag: "vm554", sex: "female", breed: "Nelore" },
    { id: "b1", earTag: "T1", sex: "male", breed: "Nelore" },
    { id: "c0", earTag: "BB90", sex: "male", breed: "Nelore" },
  ],
  breeds: ["Angus", "Nelore"],
  lots: [
    { id: "l1", name: "Lote 2" },
    { id: "l2", name: "Maternidade" },
  ],
  todayIso: "2025-10-10",
  ...over,
});

const sheet = (...rows: unknown[][]) => [HEADERS, ...rows];
const line = (over: Partial<Record<string, unknown>> = {}) => [
  over.dam ?? "R381", over.calf ?? "BB97", over.sex ?? "M", over.breed ?? "ANGUS",
  over.kg ?? 28, over.date ?? "29/09/2025", over.lot ?? "2", ...((over.extra as unknown[]) ?? []),
];

describe("birthImportFieldForHeader", () => {
  it("reads the caderno's headers", () => {
    expect(HEADERS.map(birthImportFieldForHeader)).toEqual([
      "damEarTag", "calfEarTag", "sex", "breed", "weightKg", "date", "lot",
    ]);
    expect(birthImportFieldForHeader("Brinco bezerra")).toBe("calfEarTag");
    expect(birthImportFieldForHeader("Brinco bezer")).toBe("calfEarTag");
    expect(birthImportFieldForHeader("Peso ao nascer")).toBe("weightKg");
    expect(birthImportFieldForHeader("Data do parto")).toBe("date");
    expect(birthImportFieldForHeader("Matriz")).toBe("damEarTag");
    expect(birthImportFieldForHeader("Observação")).toBeUndefined();
  });
});

describe("buildBirthImportRows", () => {
  it("reports missing columns with the headers it read", () => {
    const result = buildBirthImportRows([["BRINCO MÃE", "BEZ", "SEXO", "DIA", "LOTE"], ["R381"]], ctx());
    expect(result.headerError).toBe("Colunas obrigatórias ausentes: Brinco do bezerro, Data do parto.");
    expect(result.headers).toEqual(["BRINCO MÃE", "BEZ", "SEXO", "DIA", "LOTE"]);
    expect(result.rows).toEqual([]);
  });

  it("refuses an empty file and a file over the limit", () => {
    expect(buildBirthImportRows([], ctx()).headerError).toBe("Arquivo vazio.");
    expect(buildBirthImportRows([HEADERS], ctx()).headerError).toBe(
      "Nenhuma linha de dados encontrada no arquivo."
    );
    const many = Array.from({ length: MAX_BIRTH_IMPORT_ROWS + 1 }, (_, i) => line({ calf: `B${i}` }));
    expect(buildBirthImportRows(sheet(...many), ctx()).headerError).toContain("O limite por importação é 2000");
  });

  it("builds a ready line with the dam, the farm's raça and the parsed values", () => {
    const [row] = buildBirthImportRows(sheet(line()), ctx()).rows;
    expect(row.status).toBe("ok");
    expect(row.dam).toEqual({ kind: "matched", id: "d1", earTag: "R381", breed: "Angus" });
    expect(row.breed).toBe("Angus");
    expect(row.parsed).toEqual({ calfEarTag: "BB97", sex: "male", date: "2025-09-29", weightKg: 28 });
  });

  it("matches the dam ignoring case only when one animal fits", () => {
    const [row] = buildBirthImportRows(sheet(line({ dam: "VM554" })), ctx()).rows;
    expect(row.dam).toMatchObject({ kind: "matched", id: "d2" });
  });

  it("imports the calf alone when the dam has no tag, is a male or is not on the farm", () => {
    const rows = buildBirthImportRows(
      sheet(
        line({ dam: "R S/ BRINCO", calf: "B1" }),
        line({ dam: "", calf: "B2" }),
        line({ dam: "T1", calf: "B3" }),
        line({ dam: "R394", calf: "B4" }),
      ),
      ctx()
    ).rows;
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(rows.map((r) => r.dam.kind)).toEqual(["no_tag", "no_tag", "male", "not_found"]);
    expect(rows.map((r) => damNote(r.dam))).toEqual([
      "Mãe sem brinco. Entra só o bezerro.",
      "Mãe sem brinco. Entra só o bezerro.",
      "T1 é um macho. Entra só o bezerro.",
      "R394 não é uma fêmea do rebanho. Entra só o bezerro.",
    ]);
  });

  it("creates an unknown raça in title case and falls back to the dam's when blank", () => {
    const result = buildBirthImportRows(
      sheet(
        line({ calf: "B1", breed: "BRAHMAN" }),
        line({ calf: "B2", breed: "brahman" }),
        line({ calf: "B3", breed: "" }),
        line({ calf: "B4", breed: "", dam: "R394" }),
      ),
      ctx()
    );
    expect(result.rows.map((r) => r.breed)).toEqual(["Brahman", "Brahman", "Angus", ""]);
    expect(result.rows[3].errors.breed).toBe("Informe a raça.");
    expect(result.newBreeds).toEqual(["Brahman"]);
  });

  it("refuses a bare year, a future parto and a bad sex or weight", () => {
    const rows = buildBirthImportRows(
      sheet(
        line({ calf: "B1", date: 2025 }),
        line({ calf: "B2", date: "11/10/2025" }),
        line({ calf: "B3", sex: "X", kg: "abc" }),
        line({ calf: "B4", sex: "", date: "" }),
      ),
      ctx()
    ).rows;
    expect(rows.map((r) => r.status)).toEqual(["error", "error", "error", "error"]);
    expect(rows[0].errors.date).toBe("Data inválida (use DD/MM/AAAA).");
    expect(rows[1].errors.date).toBe("O parto não pode ser no futuro.");
    expect(rows[2].errors).toEqual({ sex: "Sexo não reconhecido (use M ou F).", weightKg: "Peso inválido." });
    expect(rows[3].errors).toEqual({ sex: "Informe o sexo.", date: "Informe a data do parto." });
  });

  it("reads a real date cell", () => {
    const [row] = buildBirthImportRows(sheet(line({ date: new Date(2025, 9, 6) })), ctx()).rows;
    expect(row.parsed?.date).toBe("2025-10-06");
  });

  it("finds morreu in any extra cell", () => {
    const rows = buildBirthImportRows(
      sheet(line({ calf: "B1", extra: ["MORREU"] }), line({ calf: "B2", extra: ["", "natimorto dia 7"] }), line({ calf: "B3", extra: ["ok"] })),
      ctx()
    ).rows;
    expect(rows.map((r) => r.deathNote)).toEqual(["MORREU", "natimorto dia 7", undefined]);
  });

  it("skips brincos already on the farm or repeated in the file", () => {
    const rows = buildBirthImportRows(sheet(line({ calf: "BB90" }), line({ calf: "B1" }), line({ calf: "B1" })), ctx()).rows;
    expect(rows.map((r) => [r.status, r.duplicateReason])).toEqual([
      ["duplicate", "in_herd"], ["ok", undefined], ["duplicate", "in_file"],
    ]);
  });

  it("matches lotes by name or by number and groups the rest for a pick", () => {
    const result = buildBirthImportRows(
      sheet(
        line({ calf: "B1", lot: "02" }),
        line({ calf: "B2", lot: "lote 2" }),
        line({ calf: "B3", lot: "MATERNIDADE" }),
        line({ calf: "B4", lot: "Pasto 9" }),
        line({ calf: "B5", lot: "pasto 9" }),
      ),
      ctx()
    );
    expect(result.lotValues).toEqual([
      { key: "2", label: "02", lines: 2, lotId: "l1" },
      { key: "maternidade", label: "MATERNIDADE", lines: 1, lotId: "l2" },
      { key: "pasto 9", label: "Pasto 9", lines: 2, lotId: undefined },
    ]);
  });
});

describe("summarizeBirthImport and birthImportPayloads", () => {
  const result = buildBirthImportRows(
    sheet(
      line({ calf: "B1" }),
      line({ calf: "B2", dam: "R394", lot: "Pasto 9", extra: ["morreu"] }),
      line({ calf: "BB90" }),
      line({ calf: "B3", sex: "" }),
    ),
    ctx()
  );

  it("counts the lines and asks for the unmatched lote", () => {
    expect(summarizeBirthImport(result, {})).toEqual({
      total: 4, ready: 2, duplicate: 1, error: 1, withoutDam: 1, deaths: 1,
      unpickedLots: [{ key: "pasto 9", label: "Pasto 9", lines: 1, lotId: undefined }],
    });
    expect(summarizeBirthImport(result, { "pasto 9": "l2" }).unpickedLots).toEqual([]);
  });

  it("sends the ready lines whose lote resolves", () => {
    expect(birthImportPayloads(result, {})).toEqual([
      { calfEarTag: "B1", calfSex: "male", breed: "Angus", lotId: "l1", date: "2025-09-29", damId: "d1", weightKg: 28 },
    ]);
    expect(birthImportPayloads(result, { "pasto 9": "l2" })[1]).toEqual({
      calfEarTag: "B2", calfSex: "male", breed: "Angus", lotId: "l2", date: "2025-09-29", weightKg: 28, deathNotes: "morreu",
    });
  });
});

describe("mergeSheetCells", () => {
  it("keeps raw dates and weights and the displayed text elsewhere", () => {
    const date = new Date(2025, 8, 29);
    const merged = mergeSheetCells(
      [HEADERS, [381, 97, "M", "ANGUS", 28, date, 2, "MORREU"]],
      [HEADERS, ["0381", "0097", "M", "ANGUS", "28", "29/09/2025", "02", "MORREU"]]
    );
    expect(merged[1]).toEqual(["0381", "0097", "M", "ANGUS", 28, date, "02", "MORREU"]);
  });
});

describe("formatEarTagList", () => {
  it("joins in pt-BR and cuts long lists", () => {
    expect(formatEarTagList(["A"])).toBe("A");
    expect(formatEarTagList(["A", "B", "C"])).toBe("A, B e C");
    expect(formatEarTagList(["A", "B", "C", "D"], 2)).toBe("A, B e mais 2");
  });
});

describe("buildBirthTemplateCsv", () => {
  it("round-trips through the parser", () => {
    const csv = buildBirthTemplateCsv().replace(/^﻿/, "");
    const matrix = csv.trim().split("\n").map((l) => l.split(","));
    const result = buildBirthImportRows(matrix, ctx({ todayIso: "2030-01-01" }));
    expect(result.headerError).toBeUndefined();
    expect(result.rows[0].status).toBe("ok");
  });
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run lib/domain/__tests__/birthImport.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement `lib/domain/birthImport.ts`**

Header map (normalized key → field), plus `key.startsWith("brinco bez")` → `calfEarTag`. Required fields `damEarTag, calfEarTag, sex, date, lot` with column labels "Brinco da mãe", "Brinco do bezerro", "Sexo", "Data do parto", "Lote". `BIRTH_FIELD_LABEL`: Mãe, Brinco do bezerro, Sexo, Raça, Peso, Data, Lote.

Key rules, in code:

```ts
const NO_TAG = /\b(s\/|sem)\s*brinco\b/;
const DEATH = /\b(morreu|morto|morta|natimorto|natimorta|obito)\b/;
const BARE_YEAR = /^\d{4}$/;

export const breedKey = (name: string) => normalizeHeader(name);

/** "2", "02", "Lote 2" and "lote 02" share one key. */
export function lotValueKey(raw: string): string {
  const bare = normalizeHeader(raw).replace(/^lote\s*/, "");
  return /^\d+$/.test(bare) ? String(Number(bare)) : bare;
}

function matchLot(label: string, lots: readonly BirthImportLot[]): string | undefined {
  const exact = lots.filter((lot) => normalizeHeader(lot.name) === normalizeHeader(label));
  if (exact.length === 1) return exact[0].id;
  const byKey = lots.filter((lot) => lotValueKey(lot.name) === lotValueKey(label));
  return byKey.length === 1 ? byKey[0].id : undefined;
}

function titleCase(text: string): string {
  return text
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((word) => word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1))
    .join(" ");
}
```

- Dam: blank or `NO_TAG` → `no_tag`; exact `earTag` match, else a single case-insensitive match; female → `matched`, male → `male`; none → `not_found`.
- Raça: blank → dam's breed when matched, else error "Informe a raça."; a farm breed with the same `breedKey` → its spelling; otherwise new, title-cased when the text is all upper or all lower case, deduplicated by key in order of appearance (`newBreeds` collects only ok rows).
- Date: `BARE_YEAR` on the trimmed text → invalid; otherwise `parseImportDate`.
- Death: first extra column cell whose `normalizeHeader` matches `DEATH`.
- Duplicate precedence as in `herdImport.buildImportRows` (in herd, then in file, then errors).
- `lotValues`: one entry per `lotValueKey` among ok rows, label = first spelling, `lotId` from `matchLot(label)`.
- `mergeSheetCells`: formatted cells everywhere except columns whose header maps to `date` or `weightKg`.
- Template: BOM + `brinco mãe,brinco bezerro,sexo,raça,peso,data,lote,observação` + `R381,BB97,M,Nelore,28,29/09/2025,Lote 1,`.

- [ ] **Step 4: Run** the same command — expect PASS.

---

### Task 2: Server use case, schema and route

**Files:**
- Create: `lib/api/domains/reproduction/useCases/ImportBirths.useCase.ts`
- Create: `lib/api/domains/reproduction/births.controller.ts`
- Modify: `lib/api/domains/reproduction/schemas/reproduction.schema.ts`, `lib/api/app.ts`
- Test: `lib/api/domains/reproduction/useCases/__tests__/ImportBirths.test.ts`, route table snapshot

**Interfaces:**
- Consumes: `breedKey` from Task 1, `ValidateLotAssignmentUseCase`, `normalizeEarTag`.
- Produces:

```ts
export interface ImportBirthInput {
  calfEarTag: string; calfSex: Sex; breed: string; lotId: string; date: string;
  damId?: string; weightKg?: number; deathNotes?: string;
}
export interface ImportBirthsResult {
  imported: string[]; calvings: number; withoutDam: string[];
  deaths: string[]; skipped: string[]; createdBreeds: string[];
}
type Response = ImportBirthsResult | "future_date" | LotAssignmentError;
// POST /api/herd/births/import  body { births: ImportBirthInput[] } (1..2000)
// 422 { error: "future_date" } · 404 { error: "lot_not_found" }
```

- [ ] **Step 1: Write the failing test** (db stub as in `AddBatch.test.ts`, with `onConflictDoNothing` chained on inserts; selects in order: per distinct lot the lot row and its open placement, then taken brincos, then dams, then breeds)

```ts
it("writes calves, calvings, weighings and baixas", async () => {
  state.selectResults = [[{ id: "lot-1" }], [{ id: 9 }], [], [{ id: "dam-1" }], [{ name: "Nelore" }]];
  const result = await new ImportBirthsUseCase().run({
    farmId: 1,
    rows: [
      { ...BASE, calfEarTag: "BB1", damId: "dam-1", weightKg: 28, breed: "NELORE" },
      { ...BASE, calfEarTag: "BB2", damId: "ghost", breed: "Angus", deathNotes: "MORREU" },
    ],
  });
  expect(result).toEqual({
    imported: ["BB1", "BB2"], calvings: 1, withoutDam: ["BB2"], deaths: ["BB2"],
    skipped: [], createdBreeds: ["Angus"],
  });
  // breeds, animals, calvings, weighings
  expect(state.inserts.map((rows) => rows.length)).toEqual([1, 2, 1, 1]);
  expect(state.inserts[1][0]).toMatchObject({ earTag: "BB1", category: "calf", breed: "Nelore", birthDate: BASE.date, active: true });
  expect(state.inserts[1][1]).toMatchObject({ active: false, inactiveReason: "death", inactiveDate: BASE.date, inactiveNotes: "MORREU" });
  expect(state.inserts[2]).toEqual([{ animalId: "dam-1", date: BASE.date, calfEarTag: "BB1" }]);
  expect(state.inserts[3]).toEqual([{ animalId: state.inserts[1][0].id, date: BASE.date, weightKg: 28 }]);
});
it("skips brincos on the farm or repeated", ...);      // selectResults taken [{earTag:"BB1"}]
it("refuses a lot that fails validation", ...);          // "lot_not_found", no inserts
it("refuses a future date before touching the db", ...); // "future_date"
```

- [ ] **Step 2: Run** `pnpm exec vitest run lib/api/domains/reproduction` — expect FAIL.
- [ ] **Step 3: Implement** the use case per the spec's Server section; schema `ImportBirthRow` (NonBlankString tags and breed, `SexModel`, `DateString`, optional `damId`, `weightKg` exclusiveMinimum 0, `deathNotes`) and `ImportBirthsBody` (`maxItems: 2000`); controller `new Elysia({ prefix: "/births" }).use(farmPlugin).post("/import", …)`; mount it next to `reproductionController`.
- [ ] **Step 4: Run** `pnpm exec vitest run lib/api` — use case PASS; route table FAIL on the new route. Update with `pnpm exec vitest run lib/api/__tests__/routeTable.test.ts -u` and check the diff adds only `POST /api/herd/births/import`.

---

### Task 3: Store action

**Files:** Modify `lib/store/useHerdStore.ts`

**Interfaces:**
- Consumes: `ImportBirthPayload` (Task 1), the route (Task 2).
- Produces: `importBirths: (rows: ImportBirthPayload[]) => Promise<ImportBirthsSummary>` with `ImportBirthsSummary` equal to the server result.

- [ ] **Step 1:** Add the type and the action beside `importHerd`:

```ts
importBirths: async (rows) => {
  const { data, error } = await api.births.import.post({ births: rows });
  if (error) {
    const detail = error.value as { error?: string };
    if (detail.error === "lot_not_found") {
      toast.error("Um dos lotes escolhidos não está mais numa invernada. Escolha de novo.");
      throw new Error("importar os nascimentos failed: lot_not_found");
    }
    apiFail("importar os nascimentos", error.status);
  }
  const summary = data as ImportBirthsSummary;
  try {
    const fresh = await repository.load();
    set({ ...fresh, loaded: true });
  } catch {
    // best-effort: the import already committed
  }
  return summary;
},
```

- [ ] **Step 2:** `pnpm exec tsc --noEmit` — expect no errors.

---

### Task 4: Dialog, preview, lote panel and the header button

**Files:**
- Create: `components/births/import-births-dialog.tsx`, `components/births/import-births-preview.tsx`, `components/births/import-births-lots.tsx`
- Modify: `app/(app)/nascimentos/page.tsx`

**Interfaces:**
- Consumes: Task 1 exports, `importBirths`, `currentlyPlacedLots`, `currentPlacementForLot`, `formatDate`, `SEX_LABEL`.
- Produces: `ImportBirthsDialog` (no props); `BirthImportLots({ values, picks, lots, onPick })`; `BirthImportPreview({ rows, total })`.

- [ ] **Step 1: Lote panel.** Renders only values without `lotId`. Each: mono chip with `label`, "N linha(s)", `ArrowRight` (hidden on phone), `Select` of lots labelled "Nome · Inv. código" (`min-h-11`, `sm:w-[300px]`). Amber container (`border-attention/45 bg-attention-soft/45`) plus "Escolha o lote para liberar a importação." while any value is unpicked; neutral otherwise. The hint names the value when there is one ("Nenhum lote do MeuBov se chama “2”…") and says "Nenhum lote do MeuBov tem esses nomes. Escolha onde esses bezerros entram; vale para todas as linhas." when there are several.
- [ ] **Step 2: Preview.** Desktop (`hidden md:block`) table inside `max-h-[45dvh] overflow-auto rounded-lg border`: `#`, Mãe, Bezerro, Sexo, Raça, Peso, Data, Lote, Situação. Phone (`md:hidden`) cards. Status cell: `Badge` secondary "Válido"; attention badge "Sem mãe" + `damNote`; "Morreu" outline badge with `text-ink-soft` + "Baixa por morte em DD/MM/AAAA."; outline "Já existe"/"Repetido no arquivo"; destructive "Erro" + one `BIRTH_FIELD_LABEL: message` per error. Mãe cell `text-attention` when the dam is not matched.
- [ ] **Step 3: Dialog.** Copy the file-reading flow of `ImportHerdDialog`: `XLSX.read(buffer, { type: "array", cellDates: true })`, for every sheet `sheet_to_json` raw and formatted, then `mergeSheetCells`. State: `step`, `busy`, `fileName`, `sheets: { name: string; matrix: unknown[][] }[]`, `sheetIndex`, `picks`, `readError`, `summary`. `result` is a `useMemo` over the sheet and the store (`animals`, `breeds`, placed lots). Aba `Select` when `sheets.length > 1`, resetting `picks`. Footer and done copy from the spec; `formatEarTagList` for the brinco lists. Toast "N bezerros importados".
- [ ] **Step 4: Header.** `actions={<><ImportBirthsDialog /><RegisterBirthDialog /></>}`.
- [ ] **Step 5:** `pnpm exec tsc --noEmit && pnpm lint && pnpm test` — expect clean.

---

### Task 5: Smoke in the real app

- [ ] Build the sample caderno as `.xlsx` with SheetJS in the scratchpad (headers and lines from the spec, one MORREU, one `R S/ BRINCO`, one unknown dam).
- [ ] With a throwaway `teste.*` user (see the smoke-test memory): import it, pick the lote, confirm, check the summary, the Nascimentos list, the dead calf's baixa on its ficha, and that re-importing skips every line.
- [ ] Phone width 390: preview cards, stacked lote select, buttons.
