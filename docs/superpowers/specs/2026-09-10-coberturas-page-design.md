# Coberturas page under Nascimentos — design

Date: 2026-09-10. Status: approved layout (design canvas), ready to implement.

## Goal

A herd-wide screen for coberturas (breedings): every breeding on the farm, newest
first, with its pregnancy diagnosis and the expected calving date, plus the two
writes the ficha already has — register a cobertura (after picking the dam) and
register the diagnosis of a pending cobertura straight from its row.

Today both writes exist only on the female's ficha (`AnimalReproduction`,
`RegisterBreedingDialog`, `RegisterDiagnosisDialog`). Nothing changes in the
data model, the API or the store actions. "Cobertura" is the app's term and
covers both `timedAI` (IATF) and `naturalMating` (Monta natural).

## Route and navigation

- Route: `app/(app)/nascimentos/coberturas/page.tsx`. Own page, own header. Not a
  tab inside Nascimentos.
- `lib/nav.ts`: `NavItem` gains an optional `children: readonly NavChild[]`
  (`NavChild = { label: string; href: string }`). Nascimentos gets one child:
  `{ label: "Coberturas", href: "/nascimentos/coberturas" }`. `isActiveRoute`
  unchanged.
- Sidebar (`components/layout/Sidebar.tsx`): children render as rows directly
  under their parent, always visible, indented so the label aligns with the
  parent's label (`pl-[38px]` = icon 16 + gap 10 + padding 12). A child is
  active when `isActiveRoute(pathname, child.href)`. The parent is active (bg +
  brand bar) only when its route matches AND no child is active; when a child is
  active the parent keeps the bright text (`text-surface`) with no background.
  Child active style = same as parent active (bg-sidebar-active, text-surface,
  brand bar).
- Mobile tab bar (`components/layout/MobileTabBar.tsx`): the bottom tabs are
  unchanged (the Partos tab stays highlighted on the child route because
  `isActiveRoute` matches the parent). The "Mais" dialog lists every child of
  every nav item after the item (or in place of the parent for primary tabs,
  which are not listed there), with a right-aligned hint `em {parent.label}`
  (`text-[11px] text-ink-soft`). `moreActive` also counts children of the
  non-primary items.

## Page

`app/(app)/nascimentos/coberturas/page.tsx` ("use client"), container
`mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8`:

1. Back link to `/nascimentos`, same markup as the ficha's back link in
   `app/(app)/herd/[id]/page.tsx` (ArrowLeft, `min-h-11 md:min-h-0`), label
   "Nascimentos".
2. `PageHeader` title "Coberturas", subtitle "Coberturas das matrizes, o
   diagnóstico de prenhez e a previsão de parto", actions =
   `<RegisterBreedingDialog />` from `components/breedings`.
3. `<BreedingsList />`.

## Domain and selector

`lib/domain/reproduction.ts` gains:

```ts
export interface BreedingOutcome {
  result: DiagnosisResult;            // "pending" when the breeding has no diagnosis
  diagnosis: PregnancyDiagnosis | null;
  /** Expected calving when pregnant and the dam has not calved since the breeding. */
  expectedCalvingDate: string | null;
}
export function breedingOutcome(record: ReproductionRecord, breeding: Breeding): BreedingOutcome
```

`lib/store/selectors.ts` gains:

```ts
export type BreedingFilter = "all" | "pending" | "pregnant" | "open";
export interface BreedingRow {
  key: string;                 // breeding.id
  breeding: Breeding;
  dam: Animal;
  /** The bull when its ear tag resolves to a herd animal; null for an external bull or a semen code. */
  bull: Animal | null;
  outcome: BreedingOutcome;
}
/** Every breeding on the farm, newest first, then by dam ear tag. */
export function recentBreedings(animals: Animal[]): BreedingRow[]
/** Rows whose outcome matches the filter; "all" keeps everything. */
export function filterBreedings(rows: BreedingRow[], filter: BreedingFilter): BreedingRow[]
```

Both are pure and unit-tested (vitest, node environment, no React). Sort with
`compareDate` like `recentBirths`.

## Components

New folder `components/breedings/`:

- `breedings-list.tsx` — `SectionCard` titled "Coberturas registradas". Header
  action: a `Select` bound to local `BreedingFilter` state with options "Todas as
  coberturas" / "Aguardando diagnóstico" / "Prenhes" / "Vazias" (trigger
  `min-h-11 md:min-h-8`). Rows from `recentBreedings(animals)` then
  `filterBreedings`. Empty herd-wide: `EmptyState` (icon `HeartPulse` from
  lucide-react if exported, else `Stethoscope`), title "Nenhuma cobertura
  registrada", description "Registre uma cobertura para acompanhar o diagnóstico
  e a previsão de parto de cada matriz.". Empty after filtering: one line
  `text-sm text-ink-soft` "Nenhuma cobertura nesse filtro.".
  - Desktop table (`hidden md:block`), columns: Data (mono), Matriz (ear tag
    link to `/herd/{dam.id}`, `font-mono font-medium text-ink underline-offset-2
    hover:underline`), Tipo (`BreedingPill`), Touro (ear tag link when `bull`
    resolves, else plain `font-mono`), Diagnóstico (`ResultPill`), Previsão de
    parto (mono date + `text-xs text-ink-soft` "· em N dias" via the same
    wording as the ficha's `daysToCalvingText`; "—" when null), last column
    right-aligned: `<RowDiagnosisDialog>` trigger only when
    `outcome.result === "pending"` and the dam is active.
  - Mobile cards (`md:hidden`, `rounded-lg border border-hairline bg-surface
    p-4`): row 1 dam link + date; row 2 both pills; "Touro {tag}"; when
    pregnant "Parto previsto {date} · em N dias"; when pending and dam active a
    full-width outline `min-h-11` trigger "Lançar diagnóstico".
- `register-breeding-dialog.tsx` — herd-wide "Registrar cobertura" (primary
  button, `Plus` icon, `min-h-11`). Step 1: `DamPicker`; step 2: `BreedingForm`
  with `leadingAction` "Trocar matriz". Description: step 1 "Escolha a matriz
  coberta. Só matrizes ativas aparecem aqui.", step 2 "Cobertura da matriz
  {earTag}. A previsão de parto sai 283 dias depois, quando o diagnóstico
  confirmar a prenhez.". Mirrors `components/births/register-birth-dialog.tsx`.
- `row-diagnosis-dialog.tsx` — trigger variants: `outline sm` with
  `Stethoscope`, label "Diagnóstico" (desktop) or full-width "Lançar
  diagnóstico" (mobile) via a `variant`/`className` prop. Dialog title "Lançar
  diagnóstico", description "Resultado do toque ou ultrassom da matriz
  {earTag}. Repetir o exame da mesma cobertura atualiza o resultado.". Body:
  `DiagnosisForm` with the breeding fixed (no cobertura select; instead a
  summary panel `rounded-lg border border-hairline bg-surface px-3 py-2.5` with
  eyebrow "Cobertura", the date, the `BreedingPill`, "Touro {tag}").

Extractions in `components/animal/` (behavior-preserving, like the earlier
`CalvingForm` extraction):

- `reproduction-pills.tsx` exports `ResultPill` and `BreedingPill`, moved out of
  `AnimalReproduction.tsx` (which imports them back).
- `dam-picker.tsx` exports `DamPicker({ onPick })`: the search + active-female
  list currently inline in `components/births/register-birth-dialog.tsx`, which
  now uses it.
- `breeding-form.tsx` exports `BreedingForm({ earTag, onRegistered, leadingAction? })`:
  the form from `RegisterBreedingDialog.tsx`, which keeps only trigger + dialog.
  Footer: `leadingAction`, then Cancelar (`DialogClose`) and Registrar.
- `diagnosis-form.tsx` exports `DiagnosisForm({ earTag, record, breeding?, onRegistered })`:
  the form from `RegisterDiagnosisDialog.tsx`. With `breeding` given, the
  cobertura select is replaced by the summary panel and that breeding is used;
  without it, behavior is exactly today's. Validation unchanged.

## Conventions

- pt-BR copy, ear tags and dates in `font-mono`, 44px touch targets on mobile
  (`min-h-11`, desktop may drop to `md:min-h-0`).
- Tokens only (`text-ink`, `bg-panel`, ...). Never loose hex.
- Read `node_modules/next/dist/docs/` before touching routing; this Next.js
  version differs from training data.
- TDD for `breedingOutcome`, `recentBreedings`, `filterBreedings`: failing test
  first. Component files have no test harness (node env only).
- No commits from implementation agents. The working tree is shared.

## Out of scope

KPI summary row, editing or deleting a cobertura, changes to the API or the
database, a "Inseminações" label, the animal ficha's layout.
