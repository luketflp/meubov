# Várias fazendas (criar, gerenciar e excluir) — design

Date: 2026-09-13. Status: approved, ready for the implementation plan.

Canvas: https://claude.ai/code/artifact/79f32d52-c855-4149-bf59-0cc3d39383e7
(pages "Trocar e criar", "Gerenciar" and "Fazenda nova").

## Goal

A user can already belong to many farms: `farm_users` holds one row per
membership, the `x-farm-id` header picks the active one, and the sidebar and
the phone's "Mais" switch between them. What nobody can do is create a second
farm. `POST /farms` runs `EnsureFarmForUserUseCase`, which returns the user's
existing farm when they have one, so the only way to own two farms today is to
be invited into someone else's. The equipe spec and ROADMAP §3 both list this
as left out.

This spec covers three pieces:

1. **Criar uma fazenda** from the switcher, from Configurações > Fazendas and
   from `/convites`, naming it at creation.
2. **Começar uma fazenda nova**: optionally reuse the current farm's raças,
   categorias and protocolos, and a Primeiros passos card on the empty Painel.
3. **Gerenciar fazendas**: a page listing every farm of the account, with the
   Dono able to delete a farm they own.

Out of scope, each its own spec later: moving animals or lotes between farms,
enforcing `maxFarms` per plan (billing is paused, see the plan-on-owner
decision), a consolidated panel across farms, restoring a deleted farm from the
UI, and transferring ownership.

## Decisions

- The Nova fazenda dialog asks for **nome and município**, both required.
  Inscrição estadual and responsável stay in Configurações > Dados da fazenda.
- Copying setup is **one switch**, "Usar o cadastro da {fazenda aberta}". It
  copies raças, categorias and protocolos sanitários, never animais, lotes,
  invernadas, touros or equipe. It starts on when the caller is Dono of the
  open farm and off otherwise, and it is hidden when the open farm has nothing
  to copy or there is no open farm (`/convites`).
- Deleting is a **soft delete**: `farm.deleted_at` is stamped, the farm
  disappears for every member at once, and the rows stay so a mistake can be
  undone by hand in the database.
- Only the **Dono** deletes, and never the **last farm** the account can open.
  A superuser gets no bypass here.
- The switcher is **always shown**, even with one farm, because it is the way
  in to "Nova fazenda". The farm list lives on its own page,
  **Configurações > Fazendas** (`/settings/fazendas`).
- The API is **user-scoped**: `POST /farms` always creates, `DELETE /farms/:id`
  deletes any farm in the list, both behind the session macro.

## Schema — migration 0016

```sql
ALTER TABLE "farm" ADD COLUMN "deleted_at" timestamp;
```

`farm_users` and `farm_invites` rows are kept. Nothing else changes: every
farm-scoped table already reaches the farm through the farm macro, so filtering
the farm out where membership is resolved is enough to hide all of its data.

## Pure domain — `lib/domain/farms.ts`

Node-safe, shared by server and client, written test-first.

- `farmLabel({id, name})` returns `name.trim()` or `Fazenda #id`. It replaces
  the inline copies in `Sidebar.tsx`, `MobileTabBar.tsx`, `MembershipCard.tsx`,
  `InvitesScreen.tsx`, `InviteCard.tsx` and `PendingInviteBanner.tsx`.
- `validateNewFarm({name, municipality})` trims both and returns either the
  trimmed pair or the first problem: `name_required`, `municipality_required`,
  `name_too_long`, `municipality_too_long` (80 characters each).
- `deleteVerdict({role, liveFarmCount})` returns `ok`, `not_owner` or
  `last_farm`. The server refuses with it and the client disables the menu item
  with the same answer, so the two never disagree.
- `confirmsFarmName(typed, label)` is the delete confirmation: the label typed
  again, ignoring case and surrounding spaces.
- `copySummary({breeds, categories, protocols})` writes the switch's hint:
  "Traz 8 raças, 3 categorias e 5 protocolos sanitários." It handles the
  singular ("1 raça") and leaves out the kinds at zero ("Traz 2 raças."). It
  returns null when all three are zero, which is what hides the switch.
- `firstSteps({headquarters, invernadas, animals})` returns the three steps
  with a `done` flag each: sede saved, at least one invernada, at least one
  animal. A step is done because the data says so. No "onboarding done" column
  exists, following `lib/domain/mapSetup.ts`.
- `showFirstSteps(animals)` is true only while the farm has no animal at all,
  active or not, so farms that already have a herd never see the card.

## Use cases

### `CreateFarmUseCase` — `lib/api/domains/farm/useCases/Create.useCase.ts`

Input `{userId, name, municipality, copyFromFarmId?}`, output `{farmId}`.

1. `validateNewFarm`; a problem answers `400 { error: "invalid_farm", problem }`.
2. In one transaction:
   - With `copyFromFarmId`, the caller must hold a membership on that farm and
     the farm must be live; otherwise `403 not_a_member`. Any role may copy:
     every member already sees raças, categorias and protocolos (their floor is
     Ver).
   - Insert the farm (`stateRegistration` and `manager` empty) and the caller's
     `owner` row.
   - With a source, read its `breeds`, `custom_categories` and
     `health_protocols` and insert them on the new farm: raças keep their
     names, categorias and protocolos get fresh `randomUUID()` ids.
3. Return the new id.

The future `maxFarms` check belongs at the top of this transaction, behind the
per-user advisory lock `EnsureFarmForUserUseCase` already takes.

### `DeleteFarmUseCase` — `lib/api/domains/farm/useCases/Delete.useCase.ts`

Input `{userId, farmId, now}`, answers `deleted`, `farm_not_found`, `not_owner` or `last_farm`.

In one transaction, under `pg_advisory_xact_lock(hashtext(userId))` so two tabs
cannot each delete one of the user's last two farms:

1. Read the caller's membership on a live farm with that id. None:
   `404 farm_not_found`.
2. Count the caller's live memberships and run `deleteVerdict`:
   `403 not_owner` or `409 last_farm`.
3. Stamp `farm.deleted_at = now()`.
4. Set every `pending` invite of the farm to `canceled` with `respondedAt`.

### Live-farm filters

`isNull(farm.deletedAt)` joins the places that turn a user into a farm:

| where | file | effect |
| --- | --- | --- |
| header path | `lib/api/plugins/farm.ts` | membership of a deleted farm answers `403 not_a_member`; a superuser gets `404 farm_not_found` |
| default farm | `lib/api/plugins/farm.ts` | oldest **live** membership |
| superuser fallback | `lib/api/plugins/farm.ts` | first live farm |
| lazy first farm | `EnsureForUser.useCase.ts` | memberships of deleted farms do not count |
| farm list | `Browse.useCase.ts` | both branches skip deleted farms |
| `hasFarm` | `invites/useCases/BrowseMine.useCase.ts` | only live memberships count |

Invites need no filter of their own: the delete cancels the farm's pending
convites in the same transaction, and `Accept` already refuses anything that is
not pending.

A member whose farm is deleted gets `403 not_a_member` on the next request.
`apiFail` in `useHerdStore.ts` already clears the stored farm and reloads, and
the macro then takes the path a removed member takes today: their next live
farm, `/convites` if a convite waits, or a lazy empty farm.

### `FarmSummary`

Gains `municipality: string`, so the switcher and the Fazendas page can print
it. `joinedAt` already gives "desde".

## Routes

Both live in `farm.controller.ts` behind `{ session: true }`, and both join
`SESSION_ONLY_ROUTES`.

| route | body | answer |
| --- | --- | --- |
| `POST /farms` | `{ name, municipality, copyFromFarmId? }` | `{ farmId }` · 400 `invalid_farm` · 403 `not_a_member` |
| `DELETE /farms/:id` | — | `{ id }` · 404 `farm_not_found` · 403 `not_owner` · 409 `last_farm` |

`POST /farms` no longer calls `EnsureFarmForUserUseCase`. The macro keeps using
it for lazy first-farm creation.

## Store — `lib/store/useHerdStore.ts`

- `createFarm({name, municipality, copy})` posts with
  `copyFromFarmId: copy ? activeFarmId : undefined`, stores the new id with
  `setActiveFarmId`, reloads the herd and the farm list (as `switchFarm` does,
  plus `GET /farms`), and resolves the id. The caller navigates to
  `/dashboard` and toasts "{nome} criada".
- `deleteFarm(id)` sends the delete. When `id` is the open farm it runs
  `clearActiveFarmId` and reloads onto the default farm; otherwise it refreshes
  `farms` only. The caller toasts "{nome} excluída".
- Errors surface as a toast with the reason. `last_farm` and `not_owner` cannot
  normally be reached from the UI, since the item is disabled or absent.

## UI

### Switcher — `components/farms/FarmSwitcher.tsx`

The Radix `Select` in `Sidebar.tsx` and in the "Mais" dialog becomes a
`DropdownMenu`, because a Select cannot hold action rows. One component serves
both, with two triggers: the rail's green 32px trigger (the classes it has
today) and the 44px field inside "Mais".

The menu, in order:

- One row per farm: a check on the open farm, the name via `farmLabel`, and
  under it `{papel} · {município}` in the hint size (the município is left out
  when blank). Choosing a row runs `switchFarm`.
- A separator.
- "Nova fazenda" (`Plus`) opens `NewFarmDialog`.
- "Gerenciar fazendas" (`Settings2`) links to `/settings/fazendas`.

The rail drops its `farms.length > 1` condition. The "Mais" dialog does the
same and keeps "Você é {papel} nesta fazenda" under the field. On the phone,
menu rows are 44px (`min-h-11`, already in `DropdownMenuItem`).

### Nova fazenda — `components/farms/NewFarmDialog.tsx`

`DialogContent` at `sm:max-w-md`.

- Title "Nova fazenda". Description: "Você será o dono. A equipe desta fazenda
  não vai junto: convide quem precisar depois, em Configurações > Equipe." On
  `/convites` it reads "Você será o dono. Depois é só convidar a equipe em
  Configurações > Equipe."
- Fields "Nome" (autofocus, placeholder "Ex.: Fazenda Boa Vista") and
  "Município" (placeholder "Ex.: Sorriso - MT").
- The copy box: a `surface` panel with "Usar o cadastro da {farmLabel}", the
  `copySummary` hint followed by "Animais, lotes, invernadas, touros e equipe
  não vêm junto.", and a `Switch`. It is shown only when a source exists and
  `copySummary` is not null.
- Footer "Cancelar" and "Criar fazenda". Criar stays disabled until both fields
  pass `validateNewFarm` and while the request runs. On the phone the footer
  stacks with Criar on top, which is `DialogFooter`'s default.

Used from the switcher, from the Fazendas page header, and from `/convites`,
where `InvitesScreen.createFarm` opens it with `copy` unavailable and keeps its
`enter(farmId)` reload.

### Configurações > Fazendas — `app/(app)/settings/fazendas/page.tsx`

`NAV_ITEMS` gains `{ label: "Fazendas", href: "/settings/fazendas" }` after
Equipe under Configurações. It has no `area`: the page belongs to the account,
not to the open farm, so nobody is gated out.

`components/farms/FarmsPage.tsx`:

- `PageHeader` "Fazendas", subtitle "As fazendas em que você trabalha e o seu
  papel em cada uma", primary action "Nova fazenda".
- A `SectionCard` "Suas fazendas" with the count and one row per farm: a
  `brand-soft` tile with `Tractor`, the name and município, the role badge
  (outline for Dono, secondary otherwise) with "desde {joinedAt}", an "Aberta
  agora" healthy pill on the open farm, "Abrir" (outline, runs `switchFarm`,
  keeps you on the page) on the others, and a "…" menu on farms where you are
  Dono.
- The "…" menu holds "Excluir fazenda" (destructive). When `deleteVerdict`
  says `last_farm` the item is disabled and a hint under it reads "Crie ou
  entre em outra fazenda antes de excluir esta."
- Under the card, an info hint: "Para sair de uma fazenda em que você não é
  dono, abra a fazenda e vá em Configurações > Sua participação."
- On the phone, rows stack: tile, name, município, then badge with the pill or
  "desde"; "Abrir" and "…" at 44px on the right.

### Excluir fazenda — `components/farms/DeleteFarmDialog.tsx`

Title "Excluir {farmLabel}?". Description: "O rebanho, os manejos e o
financeiro desta fazenda deixam de aparecer para todos. Quem é da equipe perde
o acesso na hora e os convites pendentes são cancelados." A field labeled
"Digite {farmLabel} para confirmar". The destructive "Excluir fazenda" enables
only when `confirmsFarmName` accepts the typed text, so "fazenda boa vista"
confirms "Fazenda Boa Vista".

### Primeiros passos — `components/dashboard/FirstStepsCard.tsx`

It sits on the Painel right after `PendingInviteBanner`, while
`showFirstSteps(animals)` holds and the viewer can edit Lotes or Rebanho. It is
a `SectionCard` titled "Primeiros passos ({feitos} de 3)", the count in parentheses as on "Membros (5)", and
three steps in a 3-column grid (stacked on the phone):

| # | title | hint | action | needs |
| --- | --- | --- | --- | --- |
| 1 | Marque a sede no mapa | O mapa passa a abrir direto na fazenda. | "Abrir o mapa" → `/map/setup/sede` | Lotes Editar |
| 2 | Cadastre as invernadas | Desenhe cada cerca e dê um código ao pasto. | "Cadastrar invernada" → `/map/setup/invernada/nova` | Lotes Editar |
| 3 | Cadastre os animais | Um a um, vários de um padrão ou pela planilha. | "Ir para o Rebanho" (primary) → `/herd` | Rebanho Editar |

A done step swaps its number for a healthy check, dims its title and replaces
the button with "Feito". A step whose action the viewer cannot take shows no
button. The card disappears by itself when the first animal is saved.

### Other touches

- `PageHeader` on the Painel prints `farm.name · farm.municipality`. With the
  município now required at creation, only old farms can have it blank, so the
  subtitle drops the " · " when it is empty.
- ROADMAP §3: remove "criar uma segunda fazenda" from what was left out.

## Error handling

| case | server | client |
| --- | --- | --- |
| blank or too-long name or município | 400 `invalid_farm` | Criar disabled first; toast if it still happens |
| copy source not a live membership | 403 `not_a_member` on `POST /farms` | toast "Não foi possível criar a fazenda." (not `apiFail`: the open farm is fine) |
| delete a farm that is gone | 404 `farm_not_found` | refresh `farms`, toast "Esta fazenda já foi excluída." |
| delete as non-owner / last farm | 403 `not_owner` / 409 `last_farm` | unreachable from the UI; toast with the reason |
| request on a farm deleted elsewhere | 403 `not_a_member` | existing `apiFail` clears the stored farm and reloads |

## Testing

- **Vitest, test-first:** `lib/domain/__tests__/farms.test.ts` for every
  function above, including `copySummary`'s singular and zero cases and
  `firstSteps` across all three flags.
- **Use-case tests** beside `farm/useCases/__tests__`, with the chainable db
  mocks those files already use:
  - Create: inserts the farm and the owner row; copies the three kinds with new
    ids when the source is a membership; refuses a foreign or deleted source;
    rejects invalid input before touching the db.
  - Delete: 404 for no membership, 403 for a member, 409 for the last farm;
    on success stamps `deleted_at` and cancels pending invites.
  - Browse: skips deleted farms in both branches.
- `lib/api/__tests__/permissions.test.ts` keeps passing with the two routes in
  `SESSION_ONLY_ROUTES`.
- **Smoke in the real app** with throwaway `teste.*` users:
  - Create a second farm with copy on, check raças, categorias and protocolos,
    and see Primeiros passos.
  - Switch back and forth from the rail and from "Mais".
  - Invite a second user to the new farm, delete it as Dono, and watch the
    member's next action land on their own farm.
  - Try to delete the last farm.
  - Create the first farm from `/convites`.
