# Primeiros passos em Configurações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Primeiros passos card to the top of Configurações, send step 2 to the Invernadas card on the same page (made easier to fill), and leave a slim banner on the Painel.

**Architecture:** One pure function (`missingStepsSentence`) joins the domain in `lib/domain/farms.ts`. A small hook (`useFirstSteps`) holds the visibility rule that the card and the banner share. The rest is client components: the card moves to `components/settings/`, the Invernadas card gains an anchor, an empty state, a labeled form and a per-row map link, and the Painel swaps the card for a banner.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before touching routing), React 19, Tailwind, shadcn-style `components/ui/*`, Zustand store `useHerdStore`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-primeiros-passos-configuracoes-design.md`

## Global Constraints

- Work on `main`, no branch. No commit until the user picks it at the end, then one `feat(...)` commit with spec and plan, with no attribution trailers.
- UI copy is pt-BR, exactly as written in the tasks.
- Touch targets: `min-h-11` on phone, `md:min-h-0` (or `sm:min-h-9` for the banner) from there up.
- TDD applies to the pure domain function only; components are checked by tsc, lint and the smoke run.

---

### Task 1: `missingStepsSentence` and the shared `listPt`

**Files:**
- Modify: `lib/domain/farms.ts`
- Test: `lib/domain/__tests__/farms.test.ts`

**Interfaces:**
- Consumes: `FirstStep`, `FirstStepId` (already in `lib/domain/farms.ts`).
- Produces: `export function missingStepsSentence(steps: readonly FirstStep[]): string | null`.

- [ ] **Step 1: Write the failing test**

In `lib/domain/__tests__/farms.test.ts`, add `missingStepsSentence` to the import list (alphabetical, after `firstSteps`), and append:

```ts
describe("missingStepsSentence", () => {
  const steps = (headquarters: boolean, invernada: boolean, animal: boolean) => [
    { id: "headquarters" as const, done: headquarters },
    { id: "invernada" as const, done: invernada },
    { id: "animal" as const, done: animal },
  ];

  it("lists every step on a brand-new farm", () => {
    expect(missingStepsSentence(steps(false, false, false))).toBe(
      "Faltam a sede no mapa, as invernadas e os animais."
    );
  });

  it("joins two steps with e", () => {
    expect(missingStepsSentence(steps(false, true, false))).toBe(
      "Faltam a sede no mapa e os animais."
    );
  });

  it("agrees with a lone singular step", () => {
    expect(missingStepsSentence(steps(false, true, true))).toBe("Falta a sede no mapa.");
  });

  it("agrees with a lone plural step", () => {
    expect(missingStepsSentence(steps(true, true, false))).toBe("Faltam os animais.");
  });

  it("is null when nothing is missing", () => {
    expect(missingStepsSentence(steps(true, true, true))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/domain/__tests__/farms.test.ts`
Expected: FAIL, `missingStepsSentence` is not exported.

- [ ] **Step 3: Implement**

In `lib/domain/farms.ts`, above `counted`, add:

```ts
/** "a", "a e b", "a, b e c": how a sentence lists things in Portuguese. */
function listPt(parts: readonly string[]): string {
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}
```

In `copySummary`, replace the two lines

```ts
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
  return `Traz ${list}.`;
```

with

```ts
  return `Traz ${listPt(parts)}.`;
```

At the end of the file, after `showFirstSteps`, add:

```ts
/** How the Painel banner names each pending step, and whether the phrase is plural. */
const STEP_PHRASES: Record<FirstStepId, { phrase: string; plural: boolean }> = {
  headquarters: { phrase: "a sede no mapa", plural: false },
  invernada: { phrase: "as invernadas", plural: true },
  animal: { phrase: "os animais", plural: true },
};

/**
 * What the Painel banner says is still missing: "Faltam as invernadas e os
 * animais." A lone step sets the verb's number; two or more are plural. Null
 * when every step is done.
 */
export function missingStepsSentence(steps: readonly FirstStep[]): string | null {
  const pending = steps.filter((step) => !step.done).map((step) => STEP_PHRASES[step.id]);
  if (pending.length === 0) return null;
  const verb = pending.length === 1 && !pending[0].plural ? "Falta" : "Faltam";
  return `${verb} ${listPt(pending.map((item) => item.phrase))}.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/domain/__tests__/farms.test.ts`
Expected: PASS, including the unchanged `copySummary` cases.

---

### Task 2: Invernadas card — anchor, empty state, map link, labeled form

**Files:**
- Modify: `components/ui/section-card.tsx`
- Modify: `components/settings/LotsPaddocks.tsx`

**Interfaces:**
- Produces: `export const INVERNADAS_SECTION_ID = "invernadas"` and `export const NEW_INVERNADA_CODE_ID = "invernada-nova-codigo"` from `components/settings/LotsPaddocks.tsx`; `SectionCard` accepts `id?: string`.

- [ ] **Step 1: `SectionCard` takes an `id`**

In `components/ui/section-card.tsx`, add to `SectionCardProps` (after `className`):

```ts
  /** Anchor for links and scrolling to this card. */
  id?: string;
```

Destructure `id` in the function signature (`className, id, titleAs: Heading = "h2"`) and put `id={id}` on the `<section>`.

- [ ] **Step 2: Imports and ids in `LotsPaddocks.tsx`**

Replace the React and lucide imports with:

```ts
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Fence, MapPinPlus, Pencil, Plus, Trash2 } from "lucide-react";
```

Add beside the other `@/components/ui` imports:

```ts
import { EmptyState } from "@/components/ui/empty-state";
```

and beside the `@/lib/domain/format` import:

```ts
import { stepHref } from "@/lib/domain/mapSetup";
```

Below `formatHectares`, add:

```ts
/** The Invernadas card's anchor: Primeiros passos scrolls here. */
export const INVERNADAS_SECTION_ID = "invernadas";

/** The new invernada's Código, focused by Primeiros passos and again after each add. */
export const NEW_INVERNADA_CODE_ID = "invernada-nova-codigo";
```

- [ ] **Step 3: Focus returns to Código after an add**

In `InvernadasSettings`, after `const [adding, setAdding] = useState(false);` add:

```ts
  const codeInput = useRef<HTMLInputElement>(null);
```

In `onAdd`, after `setFormError(null);` inside the `try`, add:

```ts
      codeInput.current?.focus();
```

Update the component's doc comment to:

```ts
/**
 * Fixed farm areas with their current logical lots, removal, and the Nova
 * invernada form. Editing, removal, the form and the "Desenhar no mapa" link
 * belong to whoever may edit Lotes e Mapa; anyone else reads the table, which
 * then has no Ações column.
 */
```

- [ ] **Step 4: Replace the returned JSX**

Replace everything from `return (` to the end of `InvernadasSettings` with:

```tsx
  return (
    <SectionCard id={INVERNADAS_SECTION_ID} title="Invernadas" className="scroll-mt-6">
      <p className="mb-4 text-sm text-ink-soft">
        A invernada é uma área física fixa da fazenda. Seu código permanece o
        mesmo quando os lotes de animais mudam de lugar.
      </p>
      {summaries.length === 0 ? (
        <EmptyState
          icon={Fence}
          title="Nenhuma invernada ainda"
          description={
            canEditLots
              ? "Cadastre cada pasto abaixo, com o código que a equipe usa no campo."
              : "As invernadas da fazenda aparecem aqui quando forem cadastradas."
          }
          className="py-7"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Capim</TableHead>
              <TableHead className="text-right">Hectares</TableHead>
              <TableHead>Lotes atuais</TableHead>
              <TableHead className="text-right">Cabeças</TableHead>
              {canEditLots ? (
                <TableHead className="w-20">
                  <span className="sr-only">Ações</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.map(({ invernada, lots: currentLots, headCount }) => (
              <TableRow key={invernada.id}>
                <TableCell className="font-mono font-medium">{invernada.code}</TableCell>
                <TableCell className="text-ink-soft">
                  <span className="block">{invernada.name || "—"}</span>
                  {canEditLots && invernada.boundary === undefined ? (
                    <span className="mt-0.5 flex items-center gap-1 text-xs">
                      Sem contorno ·
                      <Link
                        href={stepHref({ kind: "invernada", invernadaId: invernada.id })}
                        className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                      >
                        <MapPinPlus aria-hidden className="size-[13px]" />
                        Desenhar no mapa
                      </Link>
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-ink-soft">{invernada.grass}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatHectares(invernada.hectares)}
                </TableCell>
                <TableCell className="max-w-52 text-ink-soft">
                  {currentLots.length === 0
                    ? "Vazia"
                    : currentLots.map((lot) => lot.name).join(", ")}
                </TableCell>
                <TableCell className="text-right font-mono">{formatNumber(headCount)}</TableCell>
                {canEditLots ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <EditInvernadaDialog invernada={invernada} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRemove(invernada)}
                        aria-label={`Remover invernada ${invernada.code}`}
                        className="min-h-11 min-w-11 text-ink-soft hover:text-overdue md:min-h-7 md:min-w-7"
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {removeError ? <p className="mt-3 text-sm text-overdue">{removeError}</p> : null}
      {canEditLots ? (
        <form onSubmit={onAdd} className="mt-4 border-t border-hairline pt-4">
          <p className="mb-3 text-sm font-medium text-ink">Nova invernada</p>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end sm:gap-2">
            <div className="grid gap-1.5 sm:w-24 sm:shrink-0">
              <Label htmlFor={NEW_INVERNADA_CODE_ID}>Código</Label>
              <Input
                id={NEW_INVERNADA_CODE_ID}
                ref={codeInput}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex.: 03"
                className="min-h-11 font-mono md:min-h-0"
                autoCapitalize="characters"
              />
            </div>
            <div className="grid min-w-0 gap-1.5 sm:flex-1">
              <Label htmlFor="invernada-nova-nome">Nome (opcional)</Label>
              <Input
                id="invernada-nova-nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Sede"
                className="min-h-11 md:min-h-0"
              />
            </div>
            <div className="grid min-w-0 gap-1.5 sm:flex-1">
              <Label htmlFor="invernada-nova-capim">Capim</Label>
              <Input
                id="invernada-nova-capim"
                value={grass}
                onChange={(e) => setGrass(e.target.value)}
                placeholder="Ex.: Braquiária"
                className="min-h-11 md:min-h-0"
              />
            </div>
            <div className="grid gap-1.5 sm:w-24 sm:shrink-0">
              <Label htmlFor="invernada-nova-hectares">Hectares</Label>
              <Input
                id="invernada-nova-hectares"
                value={hectares}
                onChange={(e) => setHectares(e.target.value)}
                placeholder="0"
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={adding}
              className="col-span-2 min-h-11 md:min-h-0"
            >
              <Plus aria-hidden />
              {adding ? "Adicionando…" : "Adicionar"}
            </Button>
          </div>
        </form>
      ) : null}
      {formError ? <p className="mt-2 text-sm text-overdue">{formError}</p> : null}
    </SectionCard>
  );
```

The `EditInvernadaDialog` above is untouched; `Pencil` is still used there.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. If `EmptyStateProps.description` is not a `string`, read `components/ui/empty-state.tsx` and match it.

---

### Task 3: `useFirstSteps`, the card in Configurações, step 2 scrolls

**Files:**
- Create: `components/settings/useFirstSteps.ts`
- Move: `components/dashboard/FirstStepsCard.tsx` → `components/settings/FirstStepsCard.tsx` (`git mv`)
- Modify: `app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `INVERNADAS_SECTION_ID`, `NEW_INVERNADA_CODE_ID` from Task 2.
- Produces: `export function useFirstSteps(): FirstStep[] | null` (used by Task 4); `export function FirstStepsCard()` now at `@/components/settings/FirstStepsCard`.

- [ ] **Step 1: Create the hook**

`components/settings/useFirstSteps.ts`:

```ts
"use client";

/**
 * The open farm's Primeiros passos, or null when neither the card in
 * Configurações nor the Painel banner should show: the farm already has an
 * animal, or the viewer can edit neither Lotes nor Rebanho.
 */
import { firstSteps, showFirstSteps, type FirstStep } from "@/lib/domain/farms";
import { can } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";

export function useFirstSteps(): FirstStep[] | null {
  const farm = useHerdStore((s) => s.farm);
  const invernadas = useHerdStore((s) => s.invernadas);
  const animals = useHerdStore((s) => s.animals);
  const permissions = useActivePermissions();

  if (!showFirstSteps(animals)) return null;
  if (!can(permissions, "lots", "edit") && !can(permissions, "herd", "edit")) return null;
  return firstSteps(farm, invernadas, animals);
}
```

- [ ] **Step 2: Move the card**

Run: `git mv components/dashboard/FirstStepsCard.tsx components/settings/FirstStepsCard.tsx`

- [ ] **Step 3: Rewrite `components/settings/FirstStepsCard.tsx`**

Replace the whole file with:

```tsx
"use client";

/**
 * Primeiros passos: what a farm with no animal still needs, at the top of
 * Configurações. Each step is done because the data says so, and the card is
 * gone with the first animal — a farm that already has a herd never sees it.
 * Step 2 stays on this page: it scrolls to the Invernadas card below.
 */
import Link from "next/link";
import { ArrowRight, Check, MapIcon, Plus, type LucideIcon } from "lucide-react";
import type { FirstStepId } from "@/lib/domain/farms";
import { stepHref } from "@/lib/domain/mapSetup";
import { can } from "@/lib/domain/permissions";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { INVERNADAS_SECTION_ID, NEW_INVERNADA_CODE_ID } from "./LotsPaddocks";
import { useFirstSteps } from "./useFirstSteps";

interface StepCopy {
  title: string;
  hint: string;
  action: string;
  /** Where the action goes; null for a step done on this page. */
  href: string | null;
  icon: LucideIcon;
  /** The area whose Editar the action needs. */
  area: "lots" | "herd";
  primary?: boolean;
}

const STEPS: Record<FirstStepId, StepCopy> = {
  headquarters: {
    title: "Marque a sede no mapa",
    hint: "O mapa passa a abrir direto na fazenda.",
    action: "Abrir o mapa",
    href: stepHref({ kind: "headquarters" }),
    icon: MapIcon,
    area: "lots",
  },
  invernada: {
    title: "Cadastre as invernadas",
    hint: "Dê um código a cada pasto. O contorno no mapa pode vir depois.",
    action: "Cadastrar invernada",
    href: null,
    icon: Plus,
    area: "lots",
  },
  animal: {
    title: "Cadastre os animais",
    hint: "Um a um, vários de um padrão ou pela planilha.",
    action: "Ir para o Rebanho",
    href: "/herd",
    icon: ArrowRight,
    area: "herd",
    primary: true,
  },
};

/** Brings the Invernadas card into view and puts the cursor in the new invernada's Código. */
function goToNewInvernada() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(INVERNADAS_SECTION_ID)
    ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  document.getElementById(NEW_INVERNADA_CODE_ID)?.focus({ preventScroll: true });
}

export function FirstStepsCard() {
  const steps = useFirstSteps();
  const permissions = useActivePermissions();

  if (steps === null) return null;

  const done = steps.filter((step) => step.done).length;

  return (
    <SectionCard title={`Primeiros passos (${done} de ${steps.length})`}>
      <ol className="grid gap-5 md:grid-cols-3 md:gap-6">
        {steps.map((step, index) => {
          const copy = STEPS[step.id];
          const buttonClass = "min-h-11 w-full md:min-h-0 md:w-auto";
          const variant = copy.primary ? "default" : "outline";
          return (
            <li key={step.id} className="flex min-w-0 flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                {step.done ? (
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-healthy-soft"
                  >
                    <Check className="size-3.5 text-healthy" />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-panel font-mono text-xs text-ink-soft"
                  >
                    {index + 1}
                  </span>
                )}
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium", step.done ? "text-ink-soft" : "text-ink")}>
                    {copy.title}
                  </p>
                  <p className="mt-0.5 text-xs text-pretty text-ink-soft">{copy.hint}</p>
                </div>
              </div>
              <div className="pl-[34px]">
                {step.done ? (
                  <span className="text-[13px] font-medium text-healthy">Feito</span>
                ) : !can(permissions, copy.area, "edit") ? null : copy.href === null ? (
                  <Button
                    type="button"
                    variant={variant}
                    className={buttonClass}
                    onClick={goToNewInvernada}
                  >
                    <copy.icon aria-hidden />
                    {copy.action}
                  </Button>
                ) : (
                  <Button asChild variant={variant} className={buttonClass}>
                    <Link href={copy.href}>
                      <copy.icon aria-hidden />
                      {copy.action}
                    </Link>
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
```

- [ ] **Step 4: Render it first on Configurações**

In `app/(app)/settings/page.tsx`, add the import

```ts
import { FirstStepsCard } from "@/components/settings/FirstStepsCard";
```

and put `<FirstStepsCard />` right after the `PageHeader`, before `<FarmDataForm />`.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: one error in `app/(app)/dashboard/page.tsx` for the old `@/components/dashboard/FirstStepsCard` import. Task 4 removes it.

---

### Task 4: The Painel banner

**Files:**
- Create: `components/dashboard/FirstStepsBanner.tsx`
- Modify: `app/(app)/dashboard/page.tsx:39,142`

**Interfaces:**
- Consumes: `useFirstSteps()` (Task 3), `missingStepsSentence()` (Task 1).

- [ ] **Step 1: Create the banner**

`components/dashboard/FirstStepsBanner.tsx`:

```tsx
"use client";

/**
 * The Painel's pointer to Primeiros passos, which live in Configurações: how
 * many steps are done, what is still missing, and the way there. It follows the
 * card's rules, so both go away with the first animal.
 */
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { missingStepsSentence } from "@/lib/domain/farms";
import { Button } from "@/components/ui/button";
import { useFirstSteps } from "@/components/settings/useFirstSteps";

export function FirstStepsBanner() {
  const steps = useFirstSteps();
  if (steps === null) return null;

  const done = steps.filter((step) => step.done).length;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-panel p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft"
        >
          <ListChecks className="size-[18px] text-brand" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            Primeiros passos ({done} de {steps.length})
          </p>
          <p className="mt-0.5 text-xs text-pretty text-ink-soft">{missingStepsSentence(steps)}</p>
        </div>
      </div>
      <Button asChild className="min-h-11 w-full sm:min-h-9 sm:w-auto">
        <Link href="/settings">Continuar em Configurações</Link>
      </Button>
    </section>
  );
}
```

- [ ] **Step 2: Swap it into the Painel**

In `app/(app)/dashboard/page.tsx`, replace

```ts
import { FirstStepsCard } from "@/components/dashboard/FirstStepsCard";
```

with

```ts
import { FirstStepsBanner } from "@/components/dashboard/FirstStepsBanner";
```

and `<FirstStepsCard />` with `<FirstStepsBanner />`.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

---

### Task 5: New farms open Configurações; ROADMAP

**Files:**
- Modify: `components/farms/useNewFarm.ts`
- Modify: `components/invites/InvitesScreen.tsx:41-44,55,83`
- Modify: `ROADMAP.md:60`

- [ ] **Step 1: `useNewFarm`**

Change `router.push("/dashboard");` to `router.push("/settings");`, and in the file's doc comment replace "a submit that creates the farm, opens its Painel and says so" with "a submit that creates the farm, opens its Configurações (where Primeiros passos wait) and says so".

- [ ] **Step 2: `/convites`**

Replace

```ts
  function enter(farmId: number) {
    setActiveFarmId(farmId);
    window.location.assign("/dashboard");
  }
```

with

```ts
  /** Stores the farm as active and reloads the app into `path`. */
  function enter(farmId: number, path: "/dashboard" | "/settings") {
    setActiveFarmId(farmId);
    window.location.assign(path);
  }
```

In `accept`, change `enter(data.farmId);` to `enter(data.farmId, "/dashboard");`. In `createFarm`, change `enter(data.farmId);` to `enter(data.farmId, "/settings");` and the comment above that function to `// No herd store runs here: the new farm is stored as active and the app reloads into its Configurações.`

- [ ] **Step 3: ROADMAP**

Replace `hora. Uma fazenda sem animais mostra Primeiros passos no Painel.` with:

```
hora. Uma fazenda sem animais mostra Primeiros passos em Configurações, com
um aviso no Painel.
```

- [ ] **Step 4: Check nothing still points at the old card**

Run: `grep -rn "dashboard/FirstStepsCard" app components lib`
Expected: no output.

---

### Task 6: Verify

- [ ] **Step 1: Static checks and tests**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 2: Smoke in the real app** (see the smoke-test memory for users, dev server and DB port)

With a throwaway `teste.*` user, at desktop width:
1. Create a farm from the switcher: Configurações opens with the toast and "Primeiros passos (0 de 3)".
2. Click "Cadastrar invernada": the page scrolls to Invernadas, "Nenhuma invernada ainda" shows, the cursor is in Código.
3. Type 01 / Sede / Braquiária / 42, Enter; the cursor is back in Código. Add 02 / — / Mombaça / 18,5. Both rows show "Sem contorno · Desenhar no mapa"; the card says "(1 de 3)".
4. Follow "Desenhar no mapa" on 01, trace and save; back in Configurações, 01 has no second line.
5. Open the Painel: the banner reads "Primeiros passos (1 de 3)" and "Faltam a sede no mapa e os animais."; Continuar opens Configurações.
6. Add an animal: the card and the banner are gone.
7. At 390px: stacked steps, the 2-column form (Código | Nome, Capim | Hectares), full-width banner button.
