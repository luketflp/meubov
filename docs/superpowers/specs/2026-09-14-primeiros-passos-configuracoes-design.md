# Primeiros passos em Configurações — design

Date: 2026-09-14. Status: approved, ready for the implementation plan.

Canvas: https://claude.ai/code/artifact/07f6f788-9392-441c-9cdd-f3b1823f8498

## Goal

A farm with no animals shows a Primeiros passos card at the top of the Painel
(`components/dashboard/FirstStepsCard.tsx`). Its second step, "Cadastrar
invernada", opens the map at `/map/setup/invernada/nova`. That makes the
farmer trace a fence before the invernada even exists. Most people find it
easier to set a farm up from Configurações. The page already has an Invernadas
card with a table and an add row, but nothing points there. On top of that,
the add row has placeholders only, and an empty farm sees a table header with
no rows.

This change moves the card to Configurações and sends step 2 to the Invernadas
card on the same page. It also makes that card easier to fill in, and leaves
only a slim banner on the Painel.

Out of scope: pasting many invernadas at once, a phone layout for the
invernadas table (it keeps scrolling sideways), and any change to the map setup
walk itself.

## Decisions

- **Primeiros passos lives at the top of Configurações**, above Dados da
  fazenda. The rules do not change. It shows while `showFirstSteps(animals)`
  holds and the viewer can edit Lotes or Rebanho, each step is done because the
  data says so, and the card goes away with the first animal.
- **Step 2 stays on the page.** "Cadastrar invernada" is a button, not a link.
  It scrolls to the Invernadas card and focuses the new invernada's Código.
  Step 1 still opens `/map/setup/sede`, because the sede can only be set on
  the map. Step 3 still opens `/herd`.
- **The Painel keeps a banner, not the card.** It shows under the same
  conditions as the card, gives the count and what is missing, and links to
  `/settings`. The first sign-up and a switch to an empty farm still land on
  the Painel, so that is where the pointer has to be.
- **Nova fazenda opens `/settings`**, from the switcher, from Configurações >
  Fazendas and from `/convites`, instead of `/dashboard`. Accepting a convite
  still opens the Painel.
- **Invernadas card:**
  - An empty state replaces the headerless table.
  - The add row becomes a labeled "Nova invernada" form.
  - Focus returns to Código after each Adicionar, so a farmer can type one
    invernada after another.
  - Rows without an outline link to the map to draw it. The outline stays
    optional: an invernada registered here is complete for every other screen.

## Components

### Primeiros passos — `components/settings/FirstStepsCard.tsx`

Moved from `components/dashboard/`. `app/(app)/settings/page.tsx` renders it
first, before `FarmDataForm`. The copy stays the same, except step 2:

| # | title | hint | action | needs |
| --- | --- | --- | --- | --- |
| 1 | Marque a sede no mapa | O mapa passa a abrir direto na fazenda. | "Abrir o mapa" → `/map/setup/sede` | Lotes Editar |
| 2 | Cadastre as invernadas | Dê um código a cada pasto. O contorno no mapa pode vir depois. | "Cadastrar invernada" → scroll and focus | Lotes Editar |
| 3 | Cadastre os animais | Um a um, vários de um padrão ou pela planilha. | "Ir para o Rebanho" (primary) → `/herd` | Rebanho Editar |

Step 2 renders a `Button` with an `onClick`. The handler does two things:

- `document.getElementById(INVERNADAS_SECTION_ID)?.scrollIntoView({ behavior, block: "start" })`.
  `behavior` is `"smooth"`, or `"auto"` when `prefers-reduced-motion: reduce`
  matches.
- `document.getElementById(NEW_INVERNADA_CODE_ID)?.focus({ preventScroll: true })`.

Both ids are exported from `components/settings/LotsPaddocks.tsx`, beside the
card that owns them. Scrolling uses the window, since `AppShell` has no inner
scroll container. The card gets `scroll-mt-6` so its header does not touch the
top edge.

### Painel banner — `components/dashboard/FirstStepsBanner.tsx`

It replaces `<FirstStepsCard />` in `app/(app)/dashboard/page.tsx`, right after
`PendingInviteBanner`, and follows that banner's anatomy:

- A `section` with `rounded-lg border border-hairline bg-panel p-4`,
  `flex-col gap-3`, and `sm:flex-row sm:items-center gap-4` from `sm` up.
- A 36px `bg-brand-soft` tile with `ListChecks` at 18px in `text-brand`.
- Text: "Primeiros passos ({feitos} de 3)" in `text-sm font-medium`. Under it,
  in `text-xs text-ink-soft`, the sentence from `missingStepsSentence`, e.g.
  "Faltam as invernadas e os animais."
- A primary `Button asChild` holding `<Link href="/settings">Continuar em
  Configurações</Link>`, `min-h-11 w-full sm:min-h-9 sm:w-auto`.

It returns null under the same checks the card uses: `showFirstSteps(animals)`
false, or neither Lotes nor Rebanho at Editar. Both components read that rule
from one hook, `components/settings/useFirstSteps.ts`, which returns the steps
or null.

### Invernadas — `components/settings/LotsPaddocks.tsx`

`SectionCard` gains an optional `id` prop, passed to its `section`.
`InvernadasSettings` passes `id={INVERNADAS_SECTION_ID}` (`"invernadas"`) and
`className="scroll-mt-6"`.

**Empty state.** When `invernadas.length === 0`, the table is replaced by the
shared `EmptyState` (`components/ui/empty-state.tsx`, as on `/convites`):

- `Fence` icon and the title "Nenhuma invernada ainda".
- Description for Lotes editors: "Cadastre cada pasto abaixo, com o código que
  a equipe usa no campo." For readers: "As invernadas da fazenda aparecem aqui
  quando forem cadastradas."

The intro paragraph above stays as it is.

**Contorno pendente.** In the Nome cell, under the name (or "—"), a row whose
`boundary === undefined` shows a second line, for Lotes editors only:

- "Sem contorno ·" in `text-xs text-ink-soft`.
- Then a `Link` to `stepHref({ kind: "invernada", invernadaId })`: `MapPinPlus`
  at 13px and "Desenhar no mapa" in `font-medium text-brand`.

Readers see no second line.

**Nova invernada form.** It replaces the placeholder-only row and keeps the
`mt-4 border-t border-hairline pt-4` divider. Structure:

- A "Nova invernada" line in `text-sm font-medium text-ink mb-3`.
- Four fields in DOM order Código, Nome (opcional), Capim, Hectares. Each is a
  `Label` above an `Input`, `grid gap-1.5`.
- Ids: Código is `NEW_INVERNADA_CODE_ID` (`"invernada-nova-codigo"`); the
  others are `invernada-nova-nome`, `-capim` and `-hectares`.
- Placeholders "Ex.: 03", "Ex.: Sede", "Ex.: Braquiária" and "0". Código and
  Hectares are `font-mono`; Hectares keeps `type="number"`, `inputMode="decimal"`.
- The button reads "Adicionar", with a `Plus` icon, `variant="outline"`.

Layout:

- **Phone:** `grid grid-cols-2 gap-3`, so Código | Nome and Capim | Hectares
  pair up, and the button spans both columns. The keyboard's "next" key follows
  the screen order. (The canvas pairs Código with Hectares; this order keeps DOM
  and screen in step.)
- **From `sm` up:** `flex items-end gap-2`. Código and Hectares are `w-24`,
  Nome and Capim are `flex-1`, and the button sits at the end.
- **Heights:** inputs and button use `min-h-11 md:min-h-0`, as elsewhere in
  settings.

Validation, messages and `addInvernada` do not change. After a successful add
the fields clear, as today, and a ref puts focus back on Código.

### Nova fazenda destinations

- `components/farms/useNewFarm.ts`: `router.push("/settings")`.
- `components/invites/InvitesScreen.tsx`: `enter(farmId, path)` takes the path.
  `createFarm` passes `"/settings"`; accepting a convite keeps `"/dashboard"`.

## Domain

`lib/domain/farms.ts` gains `missingStepsSentence(steps: FirstStep[]): string | null`:

| step | phrase | agreement |
| --- | --- | --- |
| headquarters | a sede no mapa | singular |
| invernada | as invernadas | plural |
| animal | os animais | plural |

- No step pending returns `null`.
- One pending step agrees with its phrase: "Falta a sede no mapa." or "Faltam
  os animais."
- Two or more read "Faltam …", joined in step order with ", " and a final " e ":
  "Faltam a sede no mapa, as invernadas e os animais."

The "a, b e c" join that `copySummary` writes inline moves to a private
`listPt(parts)` helper that both functions use.

## Error handling

Nothing new reaches the server. Step 2 is a no-op when the elements are
missing, for example if the Invernadas card fails to render. The `?.` calls
make it do nothing instead of throwing. Invernada add errors keep their current
messages.

## Testing

- **Vitest, test-first**, in `lib/domain/__tests__/farms.test.ts`:
  - `missingStepsSentence`: none pending, only the sede, only the animais,
    two, and all three.
  - `copySummary` keeps its current cases after the `listPt` extraction.
- `firstSteps` and `showFirstSteps` tests stay as they are.
- `pnpm lint`, `pnpm exec tsc --noEmit` and `pnpm test`.
- **Smoke in the real app** with a throwaway `teste.*` user:
  - Create a farm and land on Configurações with "(0 de 3)".
  - Click "Cadastrar invernada": the page scrolls and the cursor sits in Código.
  - Add two invernadas back to back without touching the mouse. Step 2 turns
    "Feito" and both rows show "Desenhar no mapa".
  - Follow the link and trace one. Back in Configurações its line is gone.
  - Open the Painel: the banner reads "(1 de 3)" and "Faltam a sede no mapa e os
    animais.", and Continuar opens Configurações.
  - Add an animal: the card and the banner are gone.
  - At 390px, check the stacked steps, the 2-column form and the banner button.

## Docs

ROADMAP §3: "Uma fazenda sem animais mostra Primeiros passos no Painel."
becomes "Uma fazenda sem animais mostra Primeiros passos em Configurações, com
um aviso no Painel."
