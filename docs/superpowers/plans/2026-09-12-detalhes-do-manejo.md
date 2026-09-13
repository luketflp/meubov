# Detalhes do manejo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every row of the Histórico de manejos opens a details page: one per session of any kind, plus the calendar treatment groups and the pesagens avulsas of a day.

**Architecture:** The history rows are rebuilt around sessions in `components/manejo/helpers.ts`, using the `treatmentId`/`weighingId` a pass records (weighings gain their `id` on the client). A pure module `lib/domain/manejoDetail.ts` builds the lines and totals of each page. `/manejo/[id]` picks the chute screen or a details component by status and kind; two avulso routes cover rows with no session. A shared shell gives every page the same header, resumo card and animals card.

**Tech Stack:** Next.js 16 app router, React 19, Zustand store, vitest, Tailwind 4 tokens, shadcn `Select`/`Input`/`Table`, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-12-detalhes-do-manejo-design.md`

## Global Constraints

- pt-BR copy verbatim from the spec; tokens only, no loose hex.
- Read `node_modules/next/dist/docs/` before Next-specific code (dynamic params, `redirects`).
- Business rules in `lib/domain/manejoDetail.ts` and `components/manejo/helpers.ts`, both pure and tested; components only render.
- 44px touch targets on the phone (`min-h-11`), `md:min-h-9` on desktop controls, as the venda page.
- Work on `main`, no commits during the tasks. The Reprodução rename already sits uncommitted in the tree; keep its files out of this feature's commit.
- Commands: `pnpm exec vitest run <file>`, `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.

---

### Task 1: Weighing ids and history rows

**Files:** `lib/types.ts`, `lib/api/mappers.ts`, `components/manejo/helpers.ts`, `components/manejo/__tests__/helpers.test.ts`

**Interfaces:**
- `Weighing { id?: number; date: string; weightKg: number }`; `toWeighing` returns `id: row.id`.
- `ManejoHistoryRow` gains `subtitle?: string`; `href` is set on every row.
- `manejoDetailHref(sessionId)`, `looseWeighingsHref(date)`, `calendarTreatmentsHref(treatmentId)`.
- `manejoHistory(treatments, animals, sessions)` keeps its signature.

- [ ] Replace the "row links" tests with: a session row per kind with ≥1 done animal and `href` `/manejo/[id]` (open or closed); a sanitary session row uses the treatment type, the plan responsável and cost × done; a weighing session row has no value; a session with nothing done is left out; done treatments written by a session are not repeated, the rest group by date+type+name with subtitle "Calendário sanitário" and the avulso href; weighings written by a session are not repeated, the rest group by date as "Pesagens avulsas" / "fora do brete" with the avulso href and their brincos; sort stays date desc then name.
- [ ] Run, see them fail. Implement. Run the helpers tests and `pnpm exec vitest run lib/api` (mapper echoes).

### Task 2: Details domain

**Files:** `lib/domain/manejoDetail.ts`, `lib/domain/__tests__/manejoDetail.test.ts`

**Interfaces:**

```ts
export type DetailScope = "passed" | "lot";
export interface DetailLine { earTag: string; outcome: ManejoOutcome; notes?: string }
export function visibleLines<T extends DetailLine>(lines: T[], scope: DetailScope, search: string): T[];
export function outcomeNote(line: DetailLine): string;

export interface PreviousWeighing { date: string; weightKg: number }
export function previousWeighing(animal: Animal | undefined, beforeIso: string): PreviousWeighing | null;
export interface Gain { gainKg: number; adgKgDay: number }
export function gainSince(weightKg: number, dateIso: string, previous: PreviousWeighing | null): Gain | null;

export interface WeighingLine extends DetailLine { weightKg: number | null; previous: PreviousWeighing | null; gain: Gain | null; atBirth: boolean }
export function sessionWeighingLines(session: ManejoSession, animals: Animal[]): WeighingLine[];
export function looseWeighingLines(dateIso: string, animals: Animal[], sessions: ManejoSession[]): WeighingLine[];
export interface WeighingTotals {
  total: number; passed: number; skipped: number; weighed: number;
  totalKg: number | null; avgKg: number | null;
  withPrevious: number; totalGainKg: number | null; avgGainKg: number | null; avgAdgKgDay: number | null;
  atBirth: number; avgAtBirthKg: number | null;
}
export function weighingTotals(lines: WeighingLine[]): WeighingTotals;

export interface TreatmentLine extends DetailLine { weightKg: number | null; costBrl: number | null }
export function treatmentLines(session: ManejoSession): TreatmentLine[];
export interface TreatmentTotals {
  total: number; passed: number; skipped: number;
  withdrawalUntil: string | null; costTotalBrl: number | null; costPerHeadBrl: number | null;
  boosterDate: string | null; boosters: number; weighed: number; avgKg: number | null;
}
export function treatmentTotals(session: ManejoSession): TreatmentTotals;

export interface CalendarTreatmentGroup { date: string; type: TreatmentType; name: string; treatments: Treatment[] }
export function calendarTreatmentGroup(treatmentId: string, treatments: Treatment[], sessions: ManejoSession[]): CalendarTreatmentGroup | null;
export interface CalendarTotals { heads: number; withdrawalUntil: string | null; costTotalBrl: number | null; costPerHeadBrl: number | null }
export function calendarTotals(group: CalendarTreatmentGroup): CalendarTotals;

export interface MovementLine extends DetailLine { weightKg: number | null; previousLotId?: string }
export function movementLines(session: ManejoSession): MovementLine[];
export function transferOrigins(session: ManejoSession): { lotId: string | null; heads: number }[];
export interface EntryTotals { heads: number; weighed: number; avgKg: number | null; totalBrl: number | null; perHeadBrl: number | null; perArrobaBrl: number | null }
export function entryTotals(session: ManejoSession): EntryTotals;
export function passedLabel(session: ManejoSession): string; // "pesadas", "vacinadas", …
```

- [ ] Tests first for each function: scope/search order and the "pulado · nota" note; previous weighing strictly before the date; gain and GMD over the days, null without a previous one or on the same day; session lines follow the session order with skipped animals weightless; loose lines skip session weighings and mark birth weights; totals with and without previous weighings; sanitary totals (carência end, cost, boosters, weights); calendar group excludes session treatments and returns null for an unknown or session treatment; origins sorted by heads; entry R$/@ only when every done animal weighed.
- [ ] Run, fail, implement, pass.

### Task 3: Shell, detail components and routes

**Files:** the components and routes listed in the spec's code layout; `next.config.ts`.

- [ ] Read the Next docs on dynamic route params for client pages and `redirects`.
- [ ] `detail-shell.tsx`: `DetailHeader({ title, action, subtitle, session?, onDeleted? })`, `ResumoCard({ title, lead, columns })`, `AnimalsCard({ count, total, scope?, onScope?, scopeLabels?, search, onSearch, empty, children })`, `NotFoundCard({ title, description })`.
- [ ] Details components per spec; `SaleDetail` takes `session` and uses `DetailHeader`.
- [ ] `ManejoScreen`: unknown or open → `ManejoSessionRunner`; closed → by kind.
- [ ] History: every name links, chevron link, subtitle line, phone label.
- [ ] Remove `app/(app)/manejo/venda/[id]/page.tsx`, add the redirect.
- [ ] `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`.

### Task 4: Smoke

- [ ] In a test farm, run a pesagem, a vacinação that weighs, a troca de lote and a compra at the chute, mark a calendar treatment feito and save a ficha weighing.
- [ ] Open each row from the history on desktop and phone; switch scope, search, delete one session from its page, hit `/manejo/venda/<id>`.
