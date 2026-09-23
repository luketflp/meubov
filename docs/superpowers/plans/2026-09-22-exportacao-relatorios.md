# Exportação e Relatórios — plan

Spec: `docs/superpowers/specs/2026-09-22-exportacao-relatorios-design.md`. Canvas: https://claude.ai/artifact/CMpFyhEgXZYcfAEvPe1Mny

## Done first (the foundation, already in the tree)

- `lib/export/table.ts`: `Cell`, `ColumnKind`, `ExportColumn`, `ExportTable`, `ExportContext`, `ColumnSpec<T>`, `buildTable(title, columns, items)`, `withoutMoney`, `formatCell`, `plainCell`.
- `lib/export/csv.ts` (`toCsv`, `csvBlob`), `lib/export/xlsx.ts` (`xlsxBlob(tables, context)`), `lib/export/download.ts` (`downloadBlob`), `lib/export/fileName.ts` (`exportFileName`).
- `lib/export/datasets/herd.ts`: `herdExportTable(items, names, todayIso, title?)`. This is the reference dataset. Its test is in `lib/export/__tests__/herd.test.ts`.
- `components/export/ExportMenu.tsx`: `<ExportMenu title current={ExportScope} all?={ExportScope} hint? formats? label? />`.
  - `ExportScope` is `{ label, detail, filters?, build: () => ExportTable[] }`.
  - It strips money columns itself.
  - CSV writes the first table only, so pass `formats={["xlsx", "print"]}` when `build` returns several tables.
- `components/export/useExportContext.ts`: `useExportContext()` and `usePrintFarm()`.
- `components/print/PrintSheet.tsx`: `A4Sheet`, `PrintHeader({farm,title,subtitle})`, `PrintFooter({context})`, `PrintSection`, `PrintTable({table,totals?})`, `PrintFields`, `PrintFigures`, `PrintSignatures`, `PrintNote`, `FarmMark`.
- `components/print/PrintRoot.tsx` and `lib/store/usePrintStore.ts`: list printing, mounted in AppShell.
- `lib/nav.ts`: Relatórios item. `app/globals.css`: `@page` A4.
- Rebanho (`app/(app)/herd/page.tsx`) is the reference screen.

## Rules for every task

- Read `AGENTS.md`. This Next.js is 16.2: check `node_modules/next/dist/docs/` before using a Next API you are unsure of. Pages are `"use client"`, and `useSearchParams` sits inside `<Suspense>` as the herd page does.
- Build tables from the same selectors and ordering the screen already uses. Never re-derive a list differently.
- Dates go in as ISO strings in `kind: "date"` columns. Numbers go in as numbers. BRL goes in as `kind: "money"`. Labels come from `lib/domain/labels.ts`.
- Headers are pt-BR with units: "Peso (kg)", "Valor (R$)".
- The Exportar button sits in the `PageHeader` actions and shows for every level, including read-only viewers. Existing edit-only buttons keep their `canEdit` guard. In a tab or card without a page header, put it in the card's action slot (`SectionCard action`).
- TDD the dataset builders: a vitest next to them in `lib/export/__tests__/<area>.test.ts`, using the fixtures in `lib/domain/__tests__/fixtures.ts` when they fit.
- Code comments match the repo: short English doc comments on exported functions. UI copy is pt-BR.
- Only touch the files your task owns. Do not commit.
- Before finishing, run `npx tsc --noEmit -p .`, `npx eslint <your files>` and `npx vitest run --exclude ".claude/**" <your test files>`.

## Task A · Ficha do animal, Lote, Lotes

Datasets go in `lib/export/datasets/animal.ts` and `lib/export/datasets/lots.ts`.

- **Ficha do animal** (`app/(app)/herd/[id]`): an "Exportar" menu with `formats={["xlsx","print"]}`. `build` returns these tables:
  - "Dados": one row of the animal's fields, laid out as a two-column Campo/Valor table.
  - "Pesagens": data, peso, GMD since the previous weighing.
  - "Sanidade": the treatments.
  - "Reprodução": coberturas with diagnosis and calvings. Females only.

  Also export the weighings alone as xlsx/csv from the weighing history card, if it has an action slot.
- **Lote** (`app/(app)/lots/[id]`): the lot's animals, in the order of the lot page, through `herdExportTable`. Title "Lote <name>".
- **Lotes** (`app/(app)/lots`): lots by invernada, with columns invernada código, invernada nome, área (ha), lote, cabeças, UA/ha, desde. Use the selectors the page draws with.
- `lib/export/datasets/lots.ts` also exports `lotsExportTable` for Relatórios, and `weighingsExportTable(animals, lotNames)` with every weighing of every animal: brinco, data, peso, lote atual, GMD desde a anterior. Relatórios uses both.

## Task B · Nascimentos, Baixas, Manejo, Calendário

Datasets go in `lib/export/datasets/{births,baixas,manejo,calendar}.ts`.

- **Nascimentos**: the table's rows and sort (`recentBirths` + `sortBirths`), with the table's columns. `birthsExportTable(births, ...)`.
- **Baixas**: the `recentBaixas` rows under the `?motivo` filter. Columns: data, brinco, categoria, raça, motivo, observação, and valor (money) when present. Offer "all" when the filter is not "todas".
- **Manejo histórico**: the `manejoHistory` rows under the `?tipo` filter. Columns: data, tipo, nome, lote, animais, comprador/vendedor, R$/@ (money), total (money), status.
- **Manejo detalhe** (`app/(app)/manejo/[id]` and the per-kind detail views): the session's lines, using the builders in `lib/domain/manejoDetail.ts` and `saleRows`, with `formats={["xlsx","print"]}` or all three.
  - A **sale** detail also gets a "Romaneio" link button to `/relatorios/romaneio?manejo=<id>`, shown only with `useCan("finance","view")`.
  - `manejoExportTable(sessions, lots)` is also exported for Relatórios: one row per session.
- **Pesagens avulsas / tratamentos avulsos** detail screens: export their rows if they already have a table.
- **Calendário sanitário**: the treatments of the month on screen plus the overdue ones. Columns: data, brinco, tipo, produto, dose, status, carência (dias), responsável, custo (money).
  - Also exported for Relatórios: `treatmentsExportTable(treatments, animals, lots)` with every treatment.

## Task C · Reprodução, Financeiro

Datasets go in `lib/export/datasets/{reproduction,semen,finance}.ts`.

- **Coberturas** tab: the rows of `recentBreedings` + `filterBreedings`, in screen order. Columns: data, matriz, lote, tipo, touro, diagnóstico, data do diagnóstico, previsão de parto, observação.
  - `breedingsExportTable(rows, ...)` is also used by Relatórios.
- **Ultrassom** tab: the `ultrasoundGroups`/`searchUltrasound` rows flattened, with a lote column.
- **Touros** tab: bulls with code, raça, central, doses compradas, usadas, estoque, prenhez %.
  - A second table "Compras" has date, touro, doses, total (money) and vendedor.
  - The touro page (`reproducao/touros/[id]`) exports its compras and inseminações.
- **Financeiro**: the despesas (every one, not only the 8 on screen) and the vendas by categoria, as two tables with `formats={["xlsx","print"]}`, plus CSV of the despesas through a separate scope if simple.
  - `expensesExportTable(expenses)` is also used by Relatórios.

## Task D · Report selectors (pure, TDD)

`lib/reports/{declaration,romaneio,bank,technical}.ts` and `lib/reports/__tests__/*.test.ts`. The interfaces are fixed; Task E builds on them:

```ts
// declaration.ts
export interface AgeBand { label: string; males: number; females: number }
export interface DeclarationFlow { start: number; births: number; purchases: number; sales: number; deaths: number; others: number; adjustment: number; end: number }
export interface HerdDeclaration {
  baseDate: string; since: string;
  bands: AgeBand[];                         // 0 a 12 meses, 13 a 24 meses, 25 a 36 meses, Acima de 36 meses
  byCategory: { category: Category; males: number; females: number }[]; // calf, heifer, cow, steer, bull order; zero rows kept
  flow: DeclarationFlow;
  undated: number;                          // present animals without birthDate, placed by category (calf 0-12, heifer 13-24, steer 25-36, cow/bull >36)
}
export function herdDeclaration(data: Pick<HerdData, "animals" | "manejoSessions" | "movements">, baseDate: string, since: string): HerdDeclaration;
export function presentOn(animal: Animal, iso: string, entryDates: ReadonlyMap<string, string>): boolean; // born/entered on or before, not left by
// Entry date of an animal = date of the entry manejo whose line has createdAnimal for its earTag; otherwise its birthDate.
// flow.purchases counts the entry-created animals in (since, base]; adjustment = end - (start + births + purchases - sales - deaths - others).

// romaneio.ts
export interface RomaneioRow { n: number; earTag: string; category: string; breed: string; ageMonths: number | null; weightKg: number | null; arrobas: number | null; valueBrl: number | null }
export interface Romaneio {
  session: ManejoSession; rows: RomaneioRow[];
  totals: { heads: number; weightKg: number; avgKg: number | null; arrobas: number; valueBrl: number | null };
  pricePerArroba: number | null; yieldPct: number; counterparty: string | null; originLot: string | null;
}
export function saleSessions(sessions: ManejoSession[]): ManejoSession[]; // kind "sale", newest first, closed and open
export function saleRomaneio(data: HerdData, sessionId: string): Romaneio | null; // built on saleRows()/saleSummary() in lib/domain/movements.ts; done lines only

// bank.ts
export interface BankParams { baseDate: string; pricePerArroba: number; yieldPct: number; headPrice: Partial<Record<Category, number>> }
export interface BankRow { category: Category; heads: number; weighed: number; avgKg: number | null; arrobas: number; unweighed: number; headPrice: number | null; valueBrl: number }
export interface BankLotRow { lotName: string; invernada: string | null; heads: number; avgKg: number | null; adg: number | null }
export interface BankReport {
  rows: BankRow[];                           // category order calf, heifer, cow, steer, bull; rows with heads > 0
  totals: { heads: number; weighed: number; liveKg: number; arrobas: number; valueBrl: number };
  flow: DeclarationFlow;                     // 12 months ending at baseDate (since = first day of month 11 months before), via herdDeclaration
  lots: BankLotRow[];                        // active lots with animals, by heads desc
}
export function lastSalePrice(sessions: ManejoSession[]): { date: string; pricePerArroba: number; yieldPct: number } | null;
export function bankReport(data: HerdData, params: BankParams): BankReport; // animals present on baseDate; last weighing on/before baseDate
export function unweighedByCategory(data: HerdData, baseDate: string): Partial<Record<Category, number>>; // for the params panel

// technical.ts
export interface TechnicalParams { from: string; to: string; lotId: string | null }
export interface TechnicalReport {
  season: { exposed: number; diagnosed: number; pregnant: number; open: number; awaiting: number; ratePct: number | null };
  byBull: { name: string; type: "IATF" | "Monta natural"; covered: number; diagnosed: number; pregnant: number; ratePct: number | null }[];
  calvings: { expected: number; born: number; next30: number; overdue: number };
  lots: { lotName: string; weighed: number; startKg: number; endKg: number; days: number; adg: number }[];
  sanitary: { type: TreatmentType; sessions: number; applications: number; inWithdrawal: number }[];
}
export function technicalReport(data: HerdData, params: TechnicalParams, todayIso: string): TechnicalReport;
// Coberturas dated in [from, to]; animals of lotId when set. byBull groups by semenBullId -> bull name, else bullEarTag (natural mating "Monta natural").
// Reuse currentDiagnosis/breedingOutcome/expectedCalvingDate from lib/domain/reproduction.ts; follow how seasonReproduction in lib/store/dashboard.ts counts.
```

## Task E · Relatórios pages (after A–D)

Owned files: `app/(app)/relatorios/**` and `components/reports/**`.

- `/relatorios`: the canvas's Main board.
  - Four doc cards linking to the report pages. Banco and Romaneio show only with Financeiro view. Each card shows a derived fact, e.g. the last sale.
  - A "Planilhas" list with .xlsx and .csv per dataset, built from the dataset builders over the full farm data.
  - "Baixar tudo (.xlsx)".
  - Despesas show only with Financeiro view.
- `/relatorios/declaracao`, `/relatorios/romaneio?manejo=`, `/relatorios/banco`, `/relatorios/tecnico`: the canvas's BancoEditor board.
  - A back link, a header with actions ("Baixar planilha" where it makes sense, and "Imprimir ou salvar PDF", which calls `window.print()`).
  - A parameters card (`print:hidden`) and an `A4Sheet` preview built from `PrintSheet` blocks.
  - On paper only the sheet prints: the page wrapper and the controls get `print:hidden`, and the preview frame gets `print:p-0 print:bg-transparent print:border-0`.

## Then

A review agent reads the whole diff. A smoke agent runs the app, as in the memory note on smoke tests. After that: lint, tsc, the full vitest, and one commit when Lucas says so.
