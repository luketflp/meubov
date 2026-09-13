# Touros, inseminação e ultrassom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semen bulls with purchases and derived stock, an inseminação manejo at the brete that takes one dose per cow, and an Ultrassom list that diagnoses with one tap.

**Architecture:** Two new tables (`semen_bulls`, `semen_purchases`) and three nullable links (`breedings.semenBullId`, `manejo_sessions.semenBullId`, `manejo_session_animals.breedingId`) plus the `insemination` manejo kind. Stock, cost, pregnancy rate and the ultrassom groups are pure functions in `lib/domain/semen.ts` and `lib/domain/ultrasound.ts`. A new `semen` API domain writes bulls and purchases (each purchase with its expense); the manejo use cases gain an insemination branch that writes a breeding per pass under a row lock on the bull. The store merges every result; the Reprodução page gets tabs, a bull page, and the manejo runner and details learn the new kind.

**Tech Stack:** Next.js 16 app router, React 19, Elysia 1.4 + Eden Treaty, Drizzle ORM on Postgres, Zustand, Vitest, Tailwind 4 tokens, shadcn/radix UI, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-12-touros-inseminacao-ultrassom-design.md` (read it first; copy comes from it verbatim).

**Design canvas:** https://claude.ai/code/artifact/e500f7fe-d4e5-4571-a427-3aaf9023b6e1

## Global Constraints

- Work on `main`. No branch, no worktree, **no commits during the tasks**. The feature lands as one `feat(reproduction): ...` commit at the end, with the spec and this plan, only after the user asks. No attribution trailers.
- Leave the untracked `docs/superpowers/*/2026-09-12-equipe-permissoes*` and `map-before.png` alone. That plan also claims migration `0014`; whichever lands second renumbers.
- `AGENTS.md`: this Next.js has breaking changes. Before a new route file read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` and `dynamic-routes.md`.
- UI copy pt-BR verbatim from the spec; code identifiers and comments English, in the voice of the surrounding code (JSDoc on exported functions, a file header comment).
- Colors only through palette tokens (`text-brand`, `bg-healthy-soft`, …); no loose hex.
- Touch targets `min-h-11` on phone; follow the neighbouring component for desktop heights.
- Test-first for pure modules and use cases. Components have no unit tests.
- Other sessions may commit to `main` meanwhile: re-read a file right before editing it.
- Commands: `pnpm exec vitest run <path>`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm migration:create <kebab-name>`.

## Execution waves

Tasks in one wave touch disjoint files and run in parallel; a wave starts when the previous one is done.

| wave | tasks |
| --- | --- |
| 0 | 1 (types) |
| 1 | 2 (schema, migration, mappers, load, seed) · 3 (pure domain) · 4 (manejo helpers, labels) |
| 2 | 5 (semen + reproduction API) · 6 (manejo API) |
| 3 | 7 (store) |
| 4 | 8 (Touros UI) · 9 (inseminação UI) · 10 (Ultrassom + cobertura avulsa UI) |
| 5 | 11 (route snapshot, full checks, smoke) |

---

### Task 1: Domain types

**Files:** `lib/types.ts`

- [ ] Add, with JSDoc in the file's style:

```ts
/** One purchase of semen doses of a bull; it also became a farm expense. */
export interface SemenPurchase {
  id: string;
  date: string;
  doses: number;
  totalBrl: number;
  seller?: string;
  /** Expense this purchase wrote in Financeiro; absent once that expense is gone. */
  expenseId?: string;
}

/** Bull the farm buys semen from. Stock derives from purchases and breedings. */
export interface SemenBull {
  id: string;
  name: string;
  code?: string;
  breed?: string;
  central?: string;
  /** Sorted asc by date. */
  purchases: SemenPurchase[];
}
```

- [ ] `Breeding.semenBullId?: string` (a registered bull whose dose this cobertura used).
- [ ] `ManejoKind` adds `"insemination"`; update its JSDoc.
- [ ] `ManejoSession.semenBullId?: string` (touro principal of an inseminação).
- [ ] `ManejoSessionAnimal.breedingId?: string` (cobertura the pass wrote, for undo).
- [ ] `HerdData.semenBulls: SemenBull[]`.
- [ ] `pnpm exec tsc --noEmit` will now fail where `HerdData` or exhaustive `ManejoKind` switches are built; later tasks fix those. Do not fix them here.

### Task 2: Schema, migration, mappers, snapshot load, seed

**Files:** `lib/db/schema.ts`, `drizzle/0014_*.sql` + `drizzle/meta/*`, `lib/api/mappers.ts`, `lib/api/domains/herd/useCases/Load.useCase.ts`, `lib/data/seed.ts`, `cli/seedCli.ts` (only if it enumerates HerdData collections), `lib/store/useHerdStore.ts` (only the initial `semenBulls: []` state line)

**Interfaces:**
- Produces tables `semenBulls`, `semenPurchases` and row types `SemenBullRow`, `SemenPurchaseRow`.
- Produces mappers `toSemenBull(row: SemenBullRow, purchases: SemenPurchase[]): SemenBull`, `toSemenPurchase(row: SemenPurchaseRow): SemenPurchase`; `toBreeding` returns `semenBullId`, `toManejoSession` returns `semenBullId`, `toManejoSessionAnimal` returns `breedingId` (all `orNothing`).

- [ ] Schema, per the spec's Data model. `manejoKindEnum` adds `"insemination"` (update its comment). `semenBulls`: `uniqueIndex("semen_bulls_farm_id_name_idx").on(t.farmId, t.name)`. `semenPurchases`: `index` on `bullId`, `check("semen_purchases_doses_positive", sql\`${t.doses} > 0\`)`. `breedings.semenBullId` and `manejoSessions.semenBullId` reference `semenBulls.id` with no `onDelete` (restrict). `manejoSessionAnimals.breedingId` references `breedings.id` `onDelete: "set null"`. Define `semenBulls` before `breedings` (FK order).
- [ ] `pnpm migration:create touros-de-semen` (drizzle-kit generate; no database needed). Read the SQL: two CREATE TABLE, the enum value, four ADD COLUMN/FK. Postgres cannot use a new enum value inside the same transaction that adds it; the migration only adds it, so that is fine.
- [ ] Mappers and `LoadHerdUseCase`: select `semenBulls` of the farm ordered by name and `semenPurchases` joined to bulls of the farm ordered by date, id; assemble `semenBulls` into the result.
- [ ] `lib/data/seed.ts`: return `semenBulls: []` (no sample bulls) and keep `seed.test.ts` green. If `cli/seedCli.ts` writes per collection, nothing to add for an empty list.
- [ ] Update the mapper echo tests if `lib/api/__tests__` has any for `toBreeding`/`toManejoSession`; `pnpm exec vitest run lib/api lib/data`.

### Task 3: Pure domain

**Files:** `lib/domain/semen.ts` + `lib/domain/__tests__/semen.test.ts`; `lib/domain/ultrasound.ts` + `lib/domain/__tests__/ultrasound.test.ts`; `lib/domain/reproduction.ts` + test; `lib/domain/manejo.ts` + test; `lib/domain/manejoRevert.ts` + test; `lib/domain/manejoDetail.ts` + test. Fixtures from `lib/domain/__tests__/fixtures.ts` (extend there if a helper is missing).

**Interfaces (produced):**

```ts
// lib/domain/semen.ts
export interface BullStock {
  bought: number; used: number; left: number; totalBrl: number;
  avgCostPerDose: number | null; lastPurchase: string | null;
}
export function dosesUsed(bullId: string, animals: Animal[]): number;
export function bullStock(bull: SemenBull, animals: Animal[]): BullStock;
export function canRemovePurchase(bull: SemenBull, purchaseId: string, animals: Animal[]): boolean;
export interface BullPregnancy { diagnosed: number; pregnant: number; rate: number | null }
export function bullPregnancy(bullId: string, animals: Animal[]): BullPregnancy;
export interface BullInsemination { breeding: Breeding; dam: Animal; result: DiagnosisResult }
export function bullInseminations(bullId: string, animals: Animal[]): BullInsemination[]; // newest first, then dam ear tag
export function sessionDosesByBull(session: ManejoSession, animals: Animal[]): Map<string, number>;
export interface SemenCostLine { bull: SemenBull; doses: number; costBrl: number | null; avgCostPerDose: number | null }
export interface SemenCost { lines: SemenCostLine[]; doses: number; totalBrl: number | null; perCowBrl: number | null }
export function sessionSemenCost(session: ManejoSession, animals: Animal[], bulls: SemenBull[]): SemenCost;
export function purchaseExpenseNotes(bullName: string, doses: number): string; // "Sêmen — X, 30 doses" / "1 dose"
export function eligibleForInsemination(animal: Animal): boolean; // active female, cow or heifer
export function predominantLotId(earTags: string[], animals: Animal[]): string | null; // most frequent current lot, ties by lot id

// lib/domain/reproduction.ts
export function isPregnantNow(record: ReproductionRecord | undefined): boolean;

// lib/domain/manejo.ts
export interface BreedingEffect { date: string; type: "timedAI"; semenBullId: string }
PassEffects.breeding?: BreedingEffect
PassContext.semenBullId?: string
ManejoPassData (in lib/store/useHerdStore.ts) gains semenBullId?: string   // edit only that interface
KIND_SESSION_NAME.insemination = "Inseminação"

// lib/domain/manejoRevert.ts
RevertBlockReason adds "has_diagnosis"
AnimalFacts.hasDiagnosis: boolean       // the pass's breeding already has a diagnosis
RevertPlan.breedingIds: string[]

// lib/domain/ultrasound.ts
export interface UltrasoundRow { dam: Animal; breeding: Breeding; bull: SemenBull | null; herdBull: Animal | null; result: DiagnosisResult; days: number }
export interface UltrasoundGroup {
  key: string;                       // session id, or "avulsas"
  session: ManejoSession | null;
  date: string | null;               // session date
  lotId: string | null;              // predominant current lot of its cows
  days: number | null;               // today − session date
  rows: UltrasoundRow[];             // awaiting first, then diagnosed; each by ear tag
  pending: number; pregnant: number; open: number;
}
export function awaitsDiagnosis(record: ReproductionRecord, breeding: Breeding, active: boolean): boolean;
export function ultrasoundGroups(animals: Animal[], sessions: ManejoSession[], bulls: SemenBull[], todayIso: string): UltrasoundGroup[];
export function pendingDiagnosisCount(groups: UltrasoundGroup[]): number;
export function searchUltrasound(groups: UltrasoundGroup[], search: string): UltrasoundGroup[]; // filters rows by ear tag substring, drops empty groups
```

- [ ] **semen tests first**: used counts breedings of inactive dams too and ignores other bulls; stock with no purchase (`avgCostPerDose` null, `lastPurchase` null); avg over two purchases (60 doses, R$ 2.280 → 38); `canRemovePurchase` true when the rest still covers used, false when not, false for an unknown id; pregnancy counts only pregnant/open diagnoses, rate null with none; inseminations newest first with dam and result ("pending" without diagnosis); `sessionDosesByBull` counts done entries only via their breeding; `sessionSemenCost` per bull, total, per cow over inseminated cows, a bull with no purchase gives `costBrl: null` and is left out of the total (total null when no bull has cost); notes singular/plural; eligibility (inactive, male, calf, steer out); predominant lot.
- [ ] **reproduction**: `isPregnantNow` false without record/breedings, true for latest pregnant, false when a calving on or after the breeding date exists, false when latest is pending even if an older one was pregnant.
- [ ] **manejo**: insemination pass with `data.semenBullId` → breeding effect with that bull; without it falls back to `session.semenBullId`; no bull at all → no breeding effect; no weighing effect unless the session weighs; other kinds never produce `breeding`; `sessionName(undefined, "insemination") === "Inseminação"`.
- [ ] **manejoRevert**: insemination done pass with `breedingId` and `hasDiagnosis: false` → `plan.breedingIds` holds it; with `hasDiagnosis: true` → blocked `has_diagnosis` and empty plan; skipped/pending passes contribute nothing; existing tests updated for the new `breedingIds: []` and `hasDiagnosis` fact (default false in every fixture).
- [ ] **manejoDetail**: `passedLabel` for insemination is `"inseminadas"`; add any other exhaustive switch case the type check shows.
- [ ] **ultrasound tests first**: awaiting = latest breeding, active dam, no diagnosis, no calving on/after; an older pending breeding of a cow with a newer breeding is not listed; grouping by session entry `breedingId`; avulsas last and only awaiting rows; session group lists diagnosed rows after awaiting ones and disappears when nothing awaits; groups sorted by session date asc; counts; `days` from today; `bull` resolved by `semenBullId`, `herdBull` by ear tag; search by ear tag substring, case-insensitive.
- [ ] Implement each module until green: `pnpm exec vitest run lib/domain`.

### Task 4: Manejo helpers and labels

**Files:** `components/manejo/helpers.ts` + `components/manejo/__tests__/helpers.test.ts`, `components/manejo/manejo-type-pill.tsx`

**Interfaces (produced):**
- `ManejoAction` adds `"insemination"`; `MANEJO_ACTION_LABEL.insemination = "Inseminação"`; `MANEJO_ACTION_LIST` inserts it after `"weighing"`.
- `isSanitaryAction("insemination") === false`, `isMovementAction("insemination") === false`, `actionKind("insemination") === "insemination"`.
- `ManejoFields` gains `semenBullId: string` (empty string when unset); `ManejoErrors` gains `semenBullId`.
- `validateManejo`: for insemination, `semenBullId === ""` → `"Selecione o touro principal."`, no animals → `"Selecione ao menos uma vaca."` (other kinds keep "Selecione ao menos um animal.").
- `sessionWeighs` false for insemination unless `weighAlso`.
- `manejoHistory`: an insemination session row has no value and no responsável.
- Pill style `insemination: "bg-scheduled-soft text-scheduled"`.

- [ ] Tests first for the list order, kind mapping, both validation messages, weighing flag and the history row; run, fail, implement, pass: `pnpm exec vitest run components/manejo`.

### Task 5: Semen API and reproduction changes

**Files:** `lib/api/domains/semen/semen.controller.ts`, `lib/api/domains/semen/schemas/semen.schema.ts`, `lib/api/domains/semen/_shared/stock.ts`, `lib/api/domains/semen/useCases/{AddBull,UpdateBull,AddPurchase,DeletePurchase}.useCase.ts` + `__tests__/*.test.ts`, `lib/api/app.ts`, `lib/api/domains/reproduction/{reproduction.controller.ts, schemas/reproduction.schema.ts, useCases/AddBreeding.useCase.ts, useCases/ClearDiagnosis.useCase.ts}` + tests

**Interfaces (produced):**

```ts
// _shared/stock.ts — call inside a transaction
export async function lockBullStock(tx: Tx, farmId: number, bullId: string):
  Promise<{ bull: SemenBullRow; bought: number; used: number; left: number } | null>;
export function bullEarTagOf(bull: { code: string | null; name: string }): string; // code ?? name

// schemas
export const SemenPurchaseBody = t.Object({ date: DateString, doses: t.Integer({ minimum: 1 }), totalBrl: t.Number({ exclusiveMinimum: 0 }), seller: t.Optional(t.String()) });
export const NewSemenBullBody = t.Object({ name: NonBlankString, code: t.Optional(t.String()), breed: t.Optional(t.String()), central: t.Optional(t.String()), firstPurchase: t.Optional(SemenPurchaseBody) });
export const SemenBullPatchBody = t.Partial(t.Object({ name: NonBlankString, code: t.String(), breed: t.String(), central: t.String() }));

// use case results
AddBullUseCase → { bull: SemenBull; expense?: Expense } | "duplicate_name"
UpdateBullUseCase → SemenBull | "not_found" | "duplicate_name"
AddPurchaseUseCase → { purchase: SemenPurchase; expense: Expense } | "not_found"
DeletePurchaseUseCase → { id: string; expenseId: string | null } | "not_found" | "stock_negative"
AddBreedingUseCase → Breeding | DamError | "bull_not_found" | "out_of_stock" | "semen_requires_timed_ai"
ClearDiagnosisUseCase → { breedingId: string } | DamError | "breeding_not_found"
```

- [ ] Read `lib/api/domains/expenses/useCases/Add.useCase.ts`, `lib/api/domains/manejo/useCases/__tests__/Delete.test.ts` (db stub pattern) and `lib/api/domains/reproduction/useCases/__tests__/ImportBirths.test.ts` first.
- [ ] Tests first per use case with the stub: AddBull trims, stores empty optionals as null, maps the unique violation (`23505`) to `duplicate_name`, with `firstPurchase` inserts purchase + expense (category `breeding`, amount = total, notes from `purchaseExpenseNotes`) and links `expenseId`; UpdateBull not found / duplicate / patch only sent fields; AddPurchase not found (bull of another farm), writes expense; DeletePurchase refuses with `stock_negative` when `bought − doses < used`, otherwise deletes purchase then its expense; AddBreeding with `semenBullId`: wrong type 422 case, unknown bull, zero stock, success stores `bullEarTagOf(bull)` and `semenBullId`; without `semenBullId` unchanged; ClearDiagnosis deletes only a diagnosis of a breeding of this dam.
- [ ] Controller routes and status codes exactly as the spec's API table; mount `semenController` in `app.ts` next to reproduction. `NewBreedingBody` gains `semenBullId: t.Optional(t.String({ minLength: 1 }))`; `DELETE /animals/:id/diagnoses/:breedingId`.
- [ ] Do not touch the route table snapshot (Task 11 updates it). `pnpm exec vitest run lib/api/domains/semen lib/api/domains/reproduction`.

### Task 6: Manejo API for the inseminação

**Files:** `lib/api/domains/manejo/{manejo.controller.ts, schemas/manejo.schema.ts, _shared/session.ts}`, `useCases/{Start,CompleteAnimal,ReopenAnimal,Delete}.useCase.ts` + their tests (`__tests__/Delete.test.ts` exists; add `Start.test.ts`, `CompleteAnimal.test.ts`, `ReopenAnimal.test.ts` for the insemination branches only), `lib/store/useHerdStore.ts` (only the `NewManejoSession` interface: `semenBullId?: string`)

**Consumes:** `lockBullStock`, `bullEarTagOf` from Task 5 (`lib/api/domains/semen/_shared/stock.ts`). If Task 5 is still running, write against those exact signatures.

**Interfaces (produced):**
- `ManejoKindModel` adds `t.Literal("insemination")`; `NewManejoSessionBody.semenBullId?`; `ManejoPassBody.semenBullId?`.
- `ManejoConflict` adds `"out_of_stock" | "has_diagnosis"`.
- `CompleteResult.breeding?: Breeding`.
- `ReopenResult.removedBreedingId?: string`.
- `DeletedManejo.removedBreedings: { earTag: string; breedingId: string }[]` (empty for other kinds).
- `StartSessionUseCaseResponse` adds `"bull_not_found" | "not_female"`.

- [ ] Tests first:
  - Start: insemination stores `semenBullId`; bull of another farm → `bull_not_found`; a male ear tag → `not_female`; other kinds ignore `semenBullId`.
  - Complete: insemination with zero stock → conflict `out_of_stock` and no insert; success inserts breeding (`session.date`, `timedAI`, `bullEarTagOf`, `semenBullId` from pass data, else session's) and sets `breedingId`; returns `breeding`.
  - Reopen: breeding with diagnosis → conflict `has_diagnosis`, nothing written; otherwise clears `breedingId` then deletes the breeding; returns `removedBreedingId`.
  - Delete: facts get `hasDiagnosis` from `pregnancy_diagnoses` of the entries' breedings; blocked → `{ blocked }`; success deletes those breedings (after the session animals' refs set null) and returns `removedBreedings`.
- [ ] Controller: `POST /manejo` 422 `semen_bull_required` for insemination without bull; map `bull_not_found` 404, `not_female` 422; complete/reopen conflicts stay 409 with the code.
- [ ] `pnpm exec vitest run lib/api/domains/manejo lib/domain`.

### Task 7: Store and selectors

**Files:** `lib/store/useHerdStore.ts`, `lib/store/selectors.ts` + `lib/store/__tests__/selectors.test.ts`

**Interfaces (produced):**

```ts
export interface NewSemenPurchase { date: string; doses: number; totalBrl: number; seller?: string }
export interface NewSemenBull { name: string; code?: string; breed?: string; central?: string; firstPurchase?: NewSemenPurchase }
export type SemenBullPatch = Partial<Pick<SemenBull, "name" | "code" | "breed" | "central">>;
addSemenBull(input: NewSemenBull): Promise<SemenBull | "duplicate">;
updateSemenBull(id: string, patch: SemenBullPatch): Promise<boolean>;
addSemenPurchase(bullId: string, input: NewSemenPurchase): Promise<void>;
removeSemenPurchase(bullId: string, purchaseId: string): Promise<boolean>;
clearDiagnosis(earTag: string, breedingId: string): Promise<void>;
recordBreeding(earTag, input): Promise<boolean>;        // false on 409 out_of_stock (toast shown)
BreedingRow.semenBull: SemenBull | null                   // selectors.ts, resolved by semenBullId
```

- [ ] Selector test first: `recentBreedings(animals, semenBulls)` resolves `semenBull`, keeps `bull` for herd ear tags; update existing call sites' signature (grep `recentBreedings(`).
- [ ] Actions per the spec's Store section, using `api.semenBulls...` (Eden paths: `api["semen-bulls"]`), merging `expenses` on add and removing on delete; `completeManejoAnimal` merges `result.breeding` into the dam via `withReproduction`; on `out_of_stock` conflict toast "Esse touro não tem mais doses." and return; `reopenManejoAnimal` removes `removedBreedingId` from the dam and on `has_diagnosis` toast the spec's copy; `deleteManejoSession` removes `removedBreedings`; `clearDiagnosis` calls the DELETE route and filters the diagnosis; `recordBreeding` returns boolean (update callers to ignore or use it).
- [ ] `pnpm exec tsc --noEmit` clean except component files owned by Tasks 8–10; `pnpm exec vitest run lib/store`.

### Task 8: Touros tab and bull page

**Files:** `components/breedings/reproduction-tabs.tsx`, `app/(app)/nascimentos/reproducao/page.tsx`, `app/(app)/nascimentos/reproducao/touros/[id]/page.tsx`, `components/semen/{stock-pill,semen-bulls-list,semen-bull-dialog,semen-purchase-dialog,semen-bull-page}.tsx`

**Consumes:** `StartInseminationButton({ variant?: "default" | "outline" })` from `@/components/breedings/start-insemination-button` (Task 9) and `UltrasoundList()` from `@/components/breedings/ultrasound-list` (Task 10), both named exports. Import them; they may not exist until those tasks finish.

- [ ] Read the Next docs named in Global Constraints and `app/(app)/calendar/page.tsx` (tabs via `use(searchParams)`).
- [ ] `ReproductionTabs({ active })`: `<nav aria-label="Seções da reprodução">` with three `Link`s (`?tab=touros`, `?tab=ultrassom`, bare path for coberturas), the Calendário tab classes.
- [ ] Page: subtitle and actions per spec (`RegisterBreedingDialog` then `StartInseminationButton`), tabs, then `BreedingsList` / `SemenBullsList` / `UltrasoundList`.
- [ ] `StockPill({ left })` per spec thresholds. `SemenBullsList` table + phone cards + empty state; "Novo touro" opens `SemenBullDialog` (mode create with first purchase section / mode edit), row "Registrar compra" opens `SemenPurchaseDialog`.
- [ ] `SemenBullPage({ bullId })` with Resumo (shared `ResumoCard`/`SummaryRow` from `components/manejo/detail-shell.tsx` if they fit, else the same markup), Compras (delete with confirm-free button; false result → toast spec copy), Inseminações, not-found card. Route page renders it with the id from params.
- [ ] Money via `formatCurrency`, dates via `formatDate`, numbers mono like the manejo details.
- [ ] `pnpm exec tsc --noEmit && pnpm lint`.

### Task 9: Inseminação manejo UI

**Files:** `components/breedings/start-insemination-button.tsx`, `components/manejo/register-manejo-dialog.tsx`, `components/manejo/session-runner.tsx`, `components/manejo/insemination-chute-form.tsx`, `components/manejo/insemination-detail.tsx`, `components/manejo/manejo-screen.tsx`, `components/manejo/delete-manejo-dialog.tsx`

- [ ] Read `register-manejo-dialog.tsx`, `session-runner.tsx`, `entry-chute-form.tsx`, `detail-shell.tsx`, `weighing-detail.tsx` in full first.
- [ ] `RegisterManejoDialog` accepts `initialAction?: ManejoAction` and `trigger?: ReactNode` (keep today's defaults). Insemination mode per spec: title, Lote select at the top bound to the existing lot filter, Touro principal select (`bullStock` for doses, disabled at 0, empty-bulls message), eligible cows only (`eligibleForInsemination`), pregnant cows (`isPregnantNow`) unchecked with "Já prenhe" and skipped by "Selecionar todos", counter, stock notice, validation via `validateManejo`, submit `startManejoSession({ kind: "insemination", semenBullId, weighing: false, earTags, date })`.
- [ ] `StartInseminationButton({ variant = "default" }: { variant?: "default" | "outline" })`: `min-h-11` button "Iniciar inseminação" with `Syringe` icon opening the dialog with `initialAction="insemination"`.
- [ ] `InseminationChuteForm({ session, onDone })`: bull chips per spec (live `bullStock` from the store), selection state persisting across cows, sold-out notice, observação, "Inseminar"/"Pular (não passou)"; calls `completeManejoAnimal(sessionId, earTag, { semenBullId, notes })`.
- [ ] `session-runner.tsx`: for insemination use the title/subtitle, "Doses usadas hoje" line (`sessionDosesByBull`), the chute form, and list titles "Inseminadas" with bull name per entry (via the dam's breeding `breedingId`).
- [ ] `InseminationDetail({ session })` on the shared shell per spec (`sessionSemenCost`, `predominantLotId`). `ManejoScreen` case. Delete dialog consequence and `BLOCK_REASON.has_diagnosis`.
- [ ] `pnpm exec tsc --noEmit && pnpm lint`.

### Task 10: Ultrassom tab, cobertura avulsa, breedings list

**Files:** `components/breedings/ultrasound-list.tsx`, `components/animal/breeding-form.tsx`, `components/breedings/breedings-list.tsx`

- [ ] `UltrasoundList`: toolbar (date input default `todayISO()`, hint, search, count), group cards per spec from `searchUltrasound(ultrasoundGroups(...), search)`, rows with Prenhe/Vazia calling `recordDiagnosis(dam.earTag, { breedingId, result, date })` then `toast.success("Diagnóstico salvo", { action: { label: "Desfazer", onClick: () => clearDiagnosis(...) } })`; per-row "Alterar" local state; pending button state disables both while saving; desktop table + phone cards; empty state with `<StartInseminationButton variant="outline" />`. The exam date input has `max` today; a row whose breeding is after the exam date shows its buttons disabled.
- [ ] `BreedingForm`: IATF + registered bulls → select per spec with "Outro (digitar código)" switching to the text input; submits `semenBullId` and `bullEarTag` (bull name for display until the server replaces it). Monta natural and no-bulls unchanged. Respect `recordBreeding`'s boolean in its dialogs (keep the dialog open on false).
- [ ] `BreedingsList`: Touro column/card uses `row.semenBull` name linked to `/nascimentos/reproducao/touros/[id]`.
- [ ] `pnpm exec tsc --noEmit && pnpm lint`.

### Task 11: Snapshot, checks, smoke

- [ ] `pnpm exec vitest run lib/api/__tests__/routeTable.test.ts -u`; read the diff: only the new semen routes and the diagnosis DELETE.
- [ ] `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`.
- [ ] Migrate a reachable database (see the smoke-test memory: socat bridge on 5440) and run the spec's Testing walk-through in a throwaway `teste.inseminacao@meubov.local` farm, desktop 1440 and phone 390, with screenshots.
- [ ] Review the diff for spec coverage and dead code before asking the user about the commit.
