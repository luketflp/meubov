# Equipe e permissões — design

Date: 2026-09-12. Status: implemented.

Design canvas: https://claude.ai/code/artifact/884b9d24-3779-49a9-8907-951f344a3490

## Goal

A farm is worked by more than its owner: a gerente who runs it while the owner
is away, vaqueiros who weigh and vaccinate at the chute, a veterinarian or
consultor who needs to read the herd. MeuBov already stores memberships in
`farm_users` and the API already refuses a farm the caller does not belong to,
but nobody can add a member, and the stored role (`owner` or `member`) is never
read, so a member can do everything the owner can.

This work lets the owner bring people in and decide, area by area, what each
one sees and changes. ROADMAP item 3 lists "convidar membro, listar membros"
as the missing half of multi-fazenda; this covers it, plus the permissions it
needs.

## Decisions

- **Convite by e-mail, nothing sent.** The owner types an e-mail. MeuBov has no
  mail provider, so the invite waits in the database and the owner tells the
  person. It is claimed by signing in with that e-mail.
- **The invitee accepts.** Every convite is pending until the invitee accepts it
  in the app. Nobody lands in a farm they did not agree to, and the owner cannot
  use the form to find out which e-mails have an account.
- **Roles are presets over per-area levels.** Each member has a level per area
  (Nada, Ver, Editar). Gerente, Vaqueiro and Consultor fill the levels; changing
  any level makes the member Personalizado.
- **Nada only on Financeiro and Equipe.** Every other area hangs off animals and
  lotes, so those are always at least Ver.
- **Financeiro Nada hides every R$.** The server strips money from what it
  returns, not only the Financeiro page.
- **One Dono.** The owner cannot be edited, removed or leave. Team management can
  be delegated, bounded by the manager's own levels.
- **No stray farms.** A new account with a pending convite goes to `/convites`,
  and no empty farm is created for it.
- **Venda and Entrada need Financeiro Editar.** The owner opens a sale or a
  purchase with its price; a vaqueiro can run its chute without seeing values.

## Areas, levels and presets

Levels are ordered `none < view < edit`. Code keys are English, the UI is pt-BR.

| key | UI | covers | floor |
| --- | --- | --- | --- |
| `herd` | Rebanho | animals, import, batch, pesagens, baixa, raças, categorias | view |
| `manejo` | Manejo | manejo sessions, chute passes, venda and entrada runs | view |
| `reproduction` | Reprodução | coberturas, diagnósticos, partos | view |
| `sanitary` | Sanitário | calendar treatments, protocols | view |
| `lots` | Lotes e Mapa | lotes, alocações, invernadas, sede on the map | view |
| `finance` | Financeiro | despesas and every BRL value | none |
| `farm` | Fazenda | farm registration data | view |
| `team` | Equipe | members, convites, permissions | none |

| preset | herd | manejo | reproduction | sanitary | lots | finance | farm | team |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dono (role `owner`) | edit | edit | edit | edit | edit | edit | edit | edit |
| `gerente` | edit | edit | edit | edit | edit | edit | edit | edit |
| `vaqueiro` | edit | edit | edit | edit | edit | none | view | none |
| `consultor` | view | view | view | view | view | view | view | none |

A new convite starts as Vaqueiro. Gerente and Dono hold the same levels; what
differs is that the Dono cannot be touched and carries the plan.

`personalizado` is stored when the levels match no preset. Picking a preset in
the editor overwrites all levels; changing one level after that turns the
select to Personalizado. The editor marks each area that differs from the preset
the member started from with the brand dot used for overrides in "Cadastrar
vários animais".

Superusers resolve to full levels, as they resolve to `owner` today.

## Team rules

- Exactly one Dono per farm, the `farm_users` row with role `owner`. It cannot be
  edited, removed, or leave.
- Equipe `view` shows the Equipe page read-only. Equipe `edit` invites, cancels
  convites, changes levels and removes members.
- Nobody changes their own levels.
- **Grant ceiling.** An actor sets each area of another member at most to the
  actor's own level in that area.
- **Nobody above you.** An actor may edit or remove a member only when every one
  of that member's levels is at or below the actor's. The Dono passes every check.
- Any member but the Dono can leave the farm.
- Convites follow the grant ceiling too: an actor who is not the Dono sees,
  cancels and re-sends only convites whose levels are within their own, and
  accepting re-checks that whoever sent the convite still holds its levels.

The list shows why a row cannot be edited: "É você", "Tem mais acesso que você",
or nothing for the Dono row.

### Convites

- The e-mail is trimmed and lowercased before it is stored or compared.
- A convite is valid for 7 days (`expires_at`).
- An e-mail that already belongs to a member of the farm is refused.
- Inviting an e-mail that has a pending convite (expired or not) updates that
  convite: new preset, levels and expiry. Inviting an e-mail whose latest convite
  was declined marks that one `canceled` and creates a new pending one.
- Accepting requires the signed-in user's e-mail to match, the convite to be
  pending and not expired.
- The owner's list shows pending ("Pendente", "expira em N dias"), expired
  ("Expirado", "expirou em DD/MM/AAAA") and declined ("Recusado", "recusou em
  DD/MM/AAAA"). Accepted and canceled convites stay in the table for history and
  are not listed.

### Risk: no e-mail verification

MeuBov does not verify e-mail addresses, so whoever first creates an account
with a pending convite's e-mail can accept it. The convite expires in 7 days,
the accepted member shows by name on the Equipe page, and removal is one action.
Closing the gap needs a verification e-mail, which needs a mail provider, and is
out of scope.

## Data model

One migration, generated with `pnpm migration:create`, plus a hand-written
data update. It is `0015`: the touros de sêmen took `0014` on main first.

`farm_users` gains:

- `preset`, enum `farm_member_preset` (`gerente`, `vaqueiro`, `consultor`,
  `personalizado`), nullable;
- `permissions`, `jsonb`, nullable, shaped `{ herd: "edit", manejo: "view", … }`.

Both are null on the Dono row. Existing `member` rows are updated to `gerente`
with every area at `edit`, so nobody loses access they have today. (No code path
creates member rows yet; the update covers rows added by hand.)

New table `farm_invites`:

| column | type |
| --- | --- |
| `id` | serial primary key |
| `farm_id` | integer, references `farm`, on delete cascade |
| `email` | text, normalized |
| `preset` | `farm_member_preset` |
| `permissions` | jsonb |
| `status` | enum `farm_invite_status` (`pending`, `accepted`, `declined`, `canceled`) |
| `invited_by_user_id` | text, references `user`, on delete set null |
| `created_at` | timestamp, default now |
| `expires_at` | timestamp |
| `responded_at` | timestamp, nullable |

Indexes: a partial unique index on `(farm_id, email)` where `status = 'pending'`,
and an index on `email` for the invitee's lookup.

`parsePermissions(json)` fills a missing area with its floor, replaces an
unknown value with the floor, and raises a level below the floor to it, so a row
written before a new area existed still resolves and a body can never store Nada
on Rebanho.

## Domain

`lib/domain/permissions.ts`, pure:

- `AREAS`, `LEVELS`, `PRESETS`, `FLOORS`, `FULL_PERMISSIONS`;
- `parsePermissions(value)`, described above;
- `resolvePermissions({ role, permissions }, superuser)`: full for the Dono and
  superusers, parsed levels otherwise;
- `can(permissions, area, level)`;
- `presetFor(permissions)`: the matching preset, or `personalizado`;
- `closestPreset(permissions)`: the preset with the fewest differing areas, for
  the editor's hint on a Personalizado member;
- `accessGroups(permissions)`: the areas at edit, at view and at none;
- `canGrant(actor, next)`: every area of `next` at or below `actor`;
- `canManage(actor, target)`: `{ ok: true }` or `{ ok: false, reason: "owner" | "self" | "above" }`;
- `accessSummary(role, permissions)`: the short line under a member's role.
  The Dono reads "Acesso total"; all areas at edit read "Edita tudo"; no area at
  edit reads "Vê tudo · não edita"; one or two areas at edit read "Edita
  Reprodução e Sanitário · vê o resto"; more read "Edita 5 áreas". Areas at none
  other than Equipe are appended as "sem Financeiro". Equipe at none is the
  common case and is left out of the line.

`lib/domain/moneyRedaction.ts`, pure: `redactHerdMoney(data: HerdData)` returns a
copy without `Treatment.costBrl`, `ManejoSessionAnimal.amountBrl`, the plan's
`costBrl`, `ManejoSession.pricePerArroba` and `totalAmountBrl`,
`Movement.amountBrl`, `SemenPurchase.totalBrl`, and with `expenses` empty. `carcassYieldPct` stays: it is a
percentage. A session that lost any value gets `valuesHidden: true`, a new
optional field of `ManejoSession`, so the client can tell "no price" from "price
you may not see". Small helpers redact a single `ManejoSession` and a pass result
for the write responses below (`redactSemenBull` for a bull); `hasMoney` and
`startNeedsFinance` hold the write rules. `SemenPurchase.totalBrl` becomes
optional, and the cost helpers of `lib/domain/semen.ts` (total bought, average
cost per dose, semen cost per bull and per cow) answer null when a total is
missing, while the doses still count.

`lib/domain/invites.ts`, pure: `normalizeEmail`, `isValidEmail`,
`INVITE_TTL_DAYS`, `inviteExpiry(now)`, `inviteState(invite, now)` and the date
lines of the convites list.

## Server

### Resolving permissions

The `farm` macro (`lib/api/plugins/farm.ts`) already reads the caller's
`farm_users` row. It now selects `preset` and `permissions` too and adds
`permissions` (resolved) and `preset` to the context next to `farmRole`.

The requirement of each route lives in one table,
`lib/api/permissions/routeRequirements.ts`, keyed by method and full path
(`"POST /api/herd/animals"`). After resolving the membership, the macro looks up
`` `${request.method} ${route}` `` and answers 403 `{ error: "forbidden", area }`
when a level is short. A route missing from the table is refused (fail closed);
a test keeps the table complete. Elysia validates the body before the macro
resolves, so a forbidden caller with a malformed body gets 422, which leaks
nothing.

Requirement shapes: `{ read: true }` (any member), `{ view: Area }`,
`{ edit: Area[] }`.

### Route requirements

| requirement | routes |
| --- | --- |
| read | `GET /`, `GET /farms`, `GET /health` |
| herd edit | `POST /animals`, `POST /animals/batch`, `PATCH /animals/:id`, `POST /animals/:id/deactivate`, `POST /animals/:id/weighings`, `DELETE /weighings`, `POST /breeds`, `DELETE /breeds/:name`, `POST /categories`, `DELETE /categories/:id` |
| herd + lots edit | `POST /animals/import` (it creates lotes and alocações) |
| manejo edit | `POST /manejo`, `DELETE /manejo/:id`, `POST /manejo/:id/animals`, `POST /manejo/:id/animals/:animalId/complete`, `…/reopen`, `…/skip`, `POST /manejo/:id/close` |
| manejo + finance edit | `POST /manejo/:id/carcass-yield` (it reprices passes) |
| reproduction edit | `POST /animals/:id/breedings`, `POST /animals/:id/calvings`, `POST /animals/:id/diagnoses`, `DELETE /animals/:id/diagnoses/:breedingId`, `POST /births/import`, `POST /semen-bulls` (Financeiro too with a first purchase, see below), `PATCH /semen-bulls/:id` |
| reproduction + finance edit | `POST /semen-bulls/:id/purchases`, `DELETE /semen-bulls/:id/purchases/:purchaseId` (a purchase is a Reprodução expense) |
| sanitary edit | `POST /treatments/schedule`, `POST /treatments/complete`, `DELETE /treatments/:id`, `POST /protocols`, `DELETE /protocols/:id` |
| lots edit | `POST /lots`, `PATCH /lots/:id`, `DELETE /lots/:id`, `POST /lots/:id/archive`, `POST /lots/:id/placements`, `POST /invernadas`, `PATCH /invernadas/:id`, `DELETE /invernadas/:id`, `PUT /farm/headquarters` |
| finance edit | `POST /expenses`, `DELETE /expenses/:id` |
| farm edit | `PUT /farm` |
| team view | `GET /farm/team` |
| team edit | `POST /farm/invites`, `DELETE /farm/invites/:id`, `PATCH /farm/members/:userId`, `DELETE /farm/members/:userId` |
| read, Dono refused by the use case | `POST /farm/leave` |

A route declares the area of the action it starts; what the action writes on the
way belongs to it. Recording a parto inserts the calf, a chute pass inserts the
treatment and the weighing, and neither needs Rebanho or Sanitário on top. An
inseminação is a manejo (kind `insemination`): starting it and each pass need
Manejo, although every pass records a cobertura and takes a dose of semen.

### Money on writes

Checked in the controller or use case, since they depend on the body or the
stored session:

- `POST /manejo` needs Financeiro `edit` when `kind` is `sale` or `entry`, or when
  the body carries `pricePerArroba`, `totalAmountBrl` or `treatment.costBrl`.
- `DELETE /manejo/:id` needs Financeiro `edit` when the session has a price, a
  total or a plan cost. (A pass carries `amountBrl` only when its session has a
  price, so passes need no check of their own.) `DeleteManejoUseCase` receives
  `canEditFinance` and returns `forbidden` before writing.
- Chute passes, reopen and close need only Manejo. A sale pass prices itself from
  the session's price, so a vaqueiro can run a sale the owner opened.
- An inseminação carries no BRL value: its body names only the touro principal
  and each pass only the bull, so `startNeedsFinance` leaves it alone, and
  deleting it gives the doses back without touching the financeiro.
- `POST /semen-bulls` needs Financeiro `edit` when the body carries
  `firstPurchase`, which writes an expense as a purchase of its own would. The
  semen controller answers 403 `{ error: "forbidden", area: "finance" }` before
  writing. Buying and deleting a purchase ask for it in the route table.

The session a vaqueiro receives has no `pricePerArroba`, so the runner does not
open the rendimento dialog for them. Passes are priced by the server with the
default rendimento, and the owner can set the real one later, which reprices the
passes already done.

### Money on reads

When Financeiro is `none`, `GET /` returns `redactHerdMoney(data)`, semen
purchases without `totalBrl` included. The same redaction applies to the
responses of `POST /manejo`, of a chute pass (`…/complete`), and of
`POST /semen-bulls` and `PATCH /semen-bulls/:id`, which return the bull with its
purchases. The other write responses carry no money or already require
Financeiro `edit`.

`/api/market/quote` is public market data and stays as it is; the UI hides it.

### Splitting `PUT /farm`

The same route saves the farm data and, from the map, the sede. It splits:

- `PUT /farm` takes the registration fields only (Fazenda `edit`);
- `PUT /farm/headquarters` takes `{ headquarters: { lat, lng, zoom? } | null }`
  with the bounds `FarmDataBody` uses today (Lotes e Mapa `edit`).

`SaveFarmUseCase` loses the `headquarters` branch; `SaveHeadquartersUseCase`
takes it. The store's `saveHeadquarters` calls the new route and stops resending
the farm's other fields.

### Farm list

`GET /farms` items become
`{ id, name, role, preset, permissions, joinedAt }`, with `permissions` resolved,
so the client never re-derives the Dono or superuser case. `joinedAt` feeds "Sua
participação" and is null for a superuser without a membership.

### Team routes (farm-scoped)

`lib/api/domains/team/team.controller.ts`:

- `GET /farm/team` returns
  `{ members: TeamMember[], invites: TeamInvite[] }`. A member carries `userId`,
  `name`, `email`, `role`, `preset`, `permissions`, `joinedAt` and
  `manage: { ok } | { ok: false, reason }` computed with `canManage` against the
  caller. An invite carries `id`, `email`, `preset`, `permissions`, `status`
  (`pending`, `expired` or `declined`; expired is derived), `expiresAt`,
  `respondedAt`.
- `POST /farm/invites`, body `{ email, permissions }`. Returns the invite; 422
  `invalid_email`; 409 `already_member`; 403 `forbidden` when `canGrant` fails.
- `DELETE /farm/invites/:id` marks it `canceled`. Used for "Cancelar convite" and
  "Remover da lista". 404 when the invite is not this farm's.
- `PATCH /farm/members/:userId`, body `{ permissions }`. 403 with
  `reason` when `canManage` or `canGrant` fails; 404 when not a member.
- `DELETE /farm/members/:userId`, same guards.
- `POST /farm/leave`. 409 `owner_cannot_leave` for the Dono.

Stored permissions always pass through `parsePermissions`, and `preset` is
computed with `presetFor`; the client never sends it.

### Invitee routes (session only)

These do not use the farm macro. A small `session` macro
(`lib/api/plugins/session.ts`) resolves the user or answers 401.

- `GET /invites`: `{ invites, hasFarm }`. `invites` are the caller's pending,
  unexpired convites, each with `id`, `farmId`, `farmName`, `municipality`,
  `invitedByName`, `preset`, `permissions`, `expiresAt`. `hasFarm` tells
  `/convites` whether to offer "Criar minha fazenda" or "Ir para o painel" without
  calling a farm-scoped route, which would create a farm.
- `POST /invites/:id/accept`: in one transaction, insert the `farm_users` row
  (`member`, preset, permissions; an existing membership is kept as it is) and mark
  the convite `accepted`. Returns `{ farmId }`. 404 when the convite is not the
  caller's, not pending, or expired.
- `POST /invites/:id/decline`: marks it `declined`.
- `POST /farms`: runs `EnsureFarmForUserUseCase` and returns `{ farmId }`. This is
  "Criar minha fazenda".

### No membership yet

In the macro's no-header branch, before the lazy farm creation, a user who is not
a superuser and has a pending, unexpired convite for their e-mail gets 409
`{ error: "pending_invites" }` and no farm is created. The check runs only on
that branch, which a member never reaches.

## Client

### Store

- `FarmOption` gains `preset` and `permissions`.
- `selectActivePermissions(state)` returns the active farm's permissions. When
  the farm list failed to load it returns the floors, so the UI hides writes
  rather than offering buttons that will fail.
- `useCan(area, level)` in `lib/store/usePermissions.ts`.
- `pendingInvites` is loaded with `GET /invites` inside `load()`, alongside the
  herd and the farm list, and refreshed after accepting or declining.
- Team actions call the team routes; the Equipe page keeps its list in local
  state rather than in the herd store.

### Errors

- `ApiHerdRepository.load()` maps 409 `pending_invites` to
  `window.location.assign("/convites")`.
- A write answering 403 `forbidden` toasts "Seu acesso a esta fazenda mudou." and
  reloads the farm list and the herd, so the buttons match the new levels.
- A write answering 403 `not_a_member` clears the stored farm id and reloads, as
  the load path already does.

### Navigation

- `NavItem` and `NavChild` gain an optional `area`. Financeiro gets `finance`.
- Configurações gains the child **Equipe** (`/settings/equipe`, area `team`).
- `visibleNav(items, permissions)` drops items and children whose area is `none`.
  The sidebar and the phone tab bar both use it.
- The phone's "Mais" dialog gets a Fazenda select at the top when the user has
  more than one farm, with "Você é {papel} nesta fazenda" under it. Picking a farm
  calls `switchFarm`.
- Opening `/finance` or `/settings/equipe` by URL without access shows an empty
  state ("Sem acesso a esta área") instead of the page.

### Hiding writes

Controls that write are hidden, not disabled, when their area is below `edit`.
A page whose area is `view` shows a "Somente leitura" pill next to its title
(Rebanho, ficha do animal, Manejo, Nascimentos, Reprodução with its three tabs,
página do touro, Calendário Sanitário, Lotes, ficha do lote, Mapa, Financeiro).
Settings sections follow their own area.

| area | write entry points |
| --- | --- |
| herd | `AddAnimalsButton` (and through it `RegisterAnimalDialog`, `/herd/cadastrar-varios`), `ImportHerdDialog` trigger, `EditAnimalDialog` (edit and baixa), `WeighingForm`, the Pesagem item of the manejo row menu, `HerdCategories` and `RegisteredBreeds` add/remove |
| manejo | "Iniciar manejo" (`register-manejo-dialog`), "Iniciar inseminação" (`StartInseminationButton`, on Reprodução and in the empty Ultrassom), the runner's complete, skip, reopen and close, `entry-chute-form`, `insemination-chute-form`, `sale-yield-dialog` (also needs finance), "Excluir manejo" in the runner and the row menu (also needs finance when the session has money) |
| reproduction | `breeding-form`, `diagnosis-form`, `calving-form` at every mount (ficha do animal, Coberturas, Nascimentos); `SemenBullDialog` ("Novo touro" on Touros, "Editar" on the página do touro); Ultrassom's Prenhe, Vazia and Alterar, with the exam date; "Limpar diagnóstico" in `delete-manejo-dialog` and on the undo toast of the runner |
| reproduction + finance | the "Primeira compra" fields of `SemenBullDialog`, `SemenPurchaseDialog` ("Registrar compra" on Touros and on the página do touro), the purchase delete on the página do touro |
| sanitary | `ScheduleTreatmentForm`, calendar complete and delete, Painel's complete, `HealthHistory` complete, `activity-panel`, `HealthProtocols` add/remove, the treatment item of the manejo row menu |
| lots | `add-lot-dialog`, `edit-lot-dialog`, `move-lot-dialog`, `archive-lot-dialog`, `DeleteLotButton` and `LotCardMenu`, `InvernadasSettings`, `save-boundary-dialog`, map setup pages, the map's boundary clear and "Definir sede aqui" |
| finance | `RegisterExpenseDialog`, `ExpensesList` delete |
| farm | `FarmDataForm` (read-only fields without edit) |

The map setup pages (`/map/setup/*`) redirect to `/map` without Lotes e Mapa
`edit`.

### Money in the UI

With Financeiro `none`:

- the sidebar and "Mais" drop Financeiro;
- the Painel drops Arroba do boi, Valor do rebanho, Resultado do período and
  Despesas, and its KPI grid closes to the cards left (three columns);
- the Manejo history drops the Custo / Valor column and the value lines;
- the sale page (`/manejo/venda/[id]`) and the runner show animals and weights
  with no price, total or per-pass value. They omit those lines rather than
  printing "sem preço", which would read as a missing price;
- `delete-manejo-dialog` drops "O valor de … sai do financeiro";
- Touros drops "Custo médio por dose"; the página do touro drops "Custo médio
  por dose" and "Total comprado" from the resumo (the column reads "Prenhez")
  and "Valor total" and "Por dose" from Compras; the inseminação record drops
  "Custo do sêmen".

Without Financeiro `edit`, "Iniciar manejo" lists Vacina, Vermifugação, Medicação,
Exame, Pesagem and Troca de lote, hides the plan's "Custo por animal", and shows
under Tipo de manejo: "Venda e entrada (compra) ficam com quem cuida do
financeiro."

With Financeiro `view`, values show and cannot be typed.

## Pages

### Equipe (`/settings/equipe`)

`PageHeader` "Equipe", subtitle "Quem acessa a {farm} e o que cada pessoa pode
fazer", action "Convidar membro" (Equipe `edit`). Same width as Configurações.

**Membros** card, count beside the title. One row per member: avatar with
initials, name ("· você" on the caller), e-mail, role badge (outline for Dono,
surface for Personalizado, brand-soft for the presets), `accessSummary` under it,
and "Permissões" when `manage.ok`, otherwise the lock text. Dono first, then by
`joinedAt`.

**Convites** card, count beside the title. One row per listed convite: e-mail, "como
{papel}", state pill (Pendente in scheduled, Expirado in attention, Recusado in
overdue) with its date line, and the action: "Cancelar convite" (ghost) for
pending, "Convidar de novo" (outline) for expired and declined, plus "Remover da
lista" for declined. Footer: "O convite aparece quando a pessoa entra no MeuBov
com o e-mail convidado. Nada é enviado: avise você mesmo. Vale por 7 dias." Hidden
when there are no convites.

On the phone the rows stack, a member row opens the permissions page, and
"Convidar membro" spans the width.

### Convidar membro

Dialog `sm:max-w-xl`:

- E-mail.
- Papel: three radio cards. Gerente: "Edita tudo, inclusive valores e equipe."
  Vaqueiro: "Trabalha o rebanho no dia a dia. Não vê valores em R$." Consultor: "Vê
  tudo e não altera nada. Para veterinário ou consultor." Presets above the
  actor's ceiling are not offered.
- A surface box, "O que o {papel} pode fazer", listing Edita / Só vê / Sem acesso,
  with "Ajustar por área" expanding the permission grid in place.
- Footer: Cancelar, "Criar convite". Success toasts "Convite criado para {email}".

Errors show under the e-mail: "Informe um e-mail válido.", "Esta pessoa já é
membro da fazenda."

### Permissões

Dialog on desktop, page `/settings/equipe/[userId]` on the phone. Header: avatar,
name, "{email} · membro desde DD/MM/AAAA".

- Papel select. Hint when Personalizado: "Parecido com {closestPreset}. Escolher
  um papel troca todas as áreas." The dot marks areas that differ from that
  preset, or from the preset picked last in the editor.
- "Permissões por área": one row per area with name, description and a Nada | Ver |
  Editar segmented control in the `PeriodPicker` shell. Nada is disabled on floor
  areas. Levels above the actor's are disabled, with "Você tem só Ver em
  {área}, então pode dar até Ver." under the row. On the phone the control spans
  the row at 44px.
- Footer: "Remover da fazenda" (destructive) on the left; Cancelar and Salvar on
  the right. Removing asks "Remover {nome}?" / "{nome} deixa de acessar a {farm}.
  Para voltar, precisa de um novo convite."

Area descriptions: Rebanho "Animais, pesagens, raças e categorias"; Manejo
"Sessões no brete, trocas de lote, vendas e entradas"; Reprodução "Coberturas,
diagnósticos e partos"; Sanitário "Calendário, tratamentos e protocolos"; Lotes e
Mapa "Lotes, invernadas e a sede no mapa"; Financeiro "Despesas e todos os
valores em R$"; Fazenda "Nome, município e responsável"; Equipe "Membros,
convites e permissões".

### Convites (`/convites`)

Outside the `(app)` shell, which would try to load a farm. The server component
redirects to `/` without a session. Brand row, then:

- with convites: "Você tem um convite" (or "Você tem N convites"), "Aceite para
  entrar na fazenda e começar a trabalhar.", one card per convite with farm name,
  município, papel badge, "{quem} convidou você como {papel}. Expira em N dias.",
  the Edita / Só vê / Sem acesso box, "Aceitar e entrar" and "Recusar". Accepting
  stores the farm as active and goes to `/dashboard`;
- without convites: `EmptyState` "Nenhum convite pendente" and "Criar minha
  fazenda" (`POST /farms`, then `/dashboard`). A user who already has a farm gets
  "Ir para o painel" instead;
- footer: "Convites para {email} · Sair".

### Convite for someone who already has a farm

While `pendingInvites` is not empty, the Painel opens with a card: icon tile,
"{quem} convidou você para a {farm} como {papel}", the access line and "Expira em
N dias", Recusar and Aceitar. The sidebar avatar carries a dot. Accepting adds the
farm to the switcher and toasts "Você entrou na {farm}" with "Abrir", which
switches to it.

### Sua participação

Configurações shows, for a member who is not the Dono, a card: "Você é {papel} na
{farm} desde DD/MM/AAAA.", the Edita / Só vê / Sem acesso box, "Só o dono ou quem
cuida da equipe muda o que você pode fazer." and "Sair da fazenda". It confirms
with "Sair da {farm}?" / "Você deixa de ver o rebanho desta fazenda. Para voltar,
alguém da equipe precisa convidar você de novo." Leaving clears the stored farm
and reloads.

## Code layout

| file | role |
| --- | --- |
| `drizzle/0015_farm-members-permissions.sql`, `lib/db/schema.ts` | enums, `farm_users` columns, `farm_invites`, data update |
| `lib/domain/permissions.ts` (+ test) | areas, presets, parse, resolve, grant and manage rules, summary |
| `lib/domain/moneyRedaction.ts` (+ test) | `redactHerdMoney`, single-object helpers, `hasMoney`, `startNeedsFinance` |
| `lib/domain/invites.ts` (+ test) | e-mail normalization, expiry, convite state and date lines |
| `lib/api/permissions/routeRequirements.ts` (+ test) | the route table |
| `lib/api/plugins/farm.ts` (+ test) | permissions on the context, requirement check, `pending_invites` |
| `lib/api/plugins/session.ts` | session-only macro |
| `lib/api/domains/farm/farm.controller.ts` | `PUT /farm/headquarters`, `POST /farms`, `/farms` items |
| `lib/api/domains/farm/useCases/SaveHeadquarters.useCase.ts` | the sede |
| `lib/api/domains/farm/useCases/Browse.useCase.ts` | preset and permissions |
| `lib/api/domains/team/team.controller.ts` | team routes |
| `lib/api/domains/team/useCases/{BrowseTeam,Invite,CancelInvite,UpdateMember,RemoveMember,Leave}.useCase.ts` (+ tests) | team use cases |
| `lib/api/domains/invites/invites.controller.ts` | invitee routes |
| `lib/api/domains/invites/useCases/{BrowseMine,Accept,Decline}.useCase.ts` (+ tests) | invitee use cases |
| `lib/api/domains/herd/herd.controller.ts` | redaction on `GET /` |
| `lib/api/domains/manejo/manejo.controller.ts`, `useCases/Delete.useCase.ts` | money rules and response redaction |
| `lib/api/domains/semen/semen.controller.ts` | first purchase needs Financeiro, bull responses redacted |
| `lib/api/app.ts` | mount team and invites controllers |
| `lib/nav.ts` (+ test) | `area`, Equipe child, `visibleNav` |
| `lib/store/useHerdStore.ts`, `lib/store/usePermissions.ts` | farm options, permissions, invites, 403 handling, `saveHeadquarters` |
| `lib/repository/ApiHerdRepository.ts` | 409 redirect |
| `components/layout/{Sidebar,MobileTabBar}.tsx` | filtered nav, avatar dot, phone switcher |
| `components/layout/ReadOnlyPill.tsx`, `components/layout/NoAccess.tsx` | shared states |
| `app/(app)/settings/equipe/page.tsx`, `app/(app)/settings/equipe/[userId]/page.tsx` | Equipe and phone permissions |
| `components/team/{TeamPage,MembersCard,InvitesCard,InviteDialog,PermissionsEditor,PermissionsDialog,AccessSummaryBox}.tsx` | team UI |
| `app/convites/page.tsx`, `components/invites/{InvitesScreen,InviteCard,PendingInviteBanner}.tsx` | invitee UI |
| `components/settings/MembershipCard.tsx` | Sua participação |
| the components listed under "Hiding writes" and "Money in the UI" | gated by `useCan` |
| `ROADMAP.md` | item 3 updated |

## Testing

Test-first for the pure modules:

- `permissions.test.ts`: presets against the table above, `parsePermissions`
  (missing area, unknown value, null), `resolvePermissions` (Dono, superuser,
  member), `presetFor`, `clampToFloors`, `canGrant`, `canManage` (owner, self,
  above, equal, below), every `accessSummary` string shown in the canvas.
- `moneyRedaction.test.ts`: every BRL field gone (semen purchase totals too),
  expenses empty, `carcassYieldPct` kept, input not mutated.
- `semen.test.ts`: the stock and the semen cost of an inseminação with the
  purchase totals stripped count the doses and have no cost.
- `nav.test.ts`: `visibleNav` for Dono, Vaqueiro and Consultor.

API, with the chainable db stub of the other use-case tests:

- `farmPlugin.test.ts`: permissions on the context; 403 `forbidden` for a Consultor
  on an edit route; Dono passes; unknown route refused; 409 `pending_invites`
  instead of creating a farm.
- `routeRequirements.test.ts`: every route of `herdApi` except the session-only
  ones (`/invites…` and `POST /farms`) has a requirement, no requirement names a route that does not exist, and the table
  is pinned by snapshot.
- `routeTable.test.ts`: snapshot updated with the new routes.
- Use cases: Invite (already a member, above ceiling, re-invite over a pending one,
  re-invite after a decline), Accept (e-mail mismatch, expired, success writes the
  membership), UpdateMember and RemoveMember (owner, self, above), Leave (Dono
  refused), Start manejo and Delete manejo money rules.

In the running app, with throwaway `teste.*` users: the Dono invites an e-mail
that has no account; that person signs up, lands on `/convites`, accepts; as
Vaqueiro the Painel has no R$, Financeiro is gone, "Iniciar manejo" has no Venda or
Entrada, and a sale opened by the Dono runs without values; as Consultor nothing
writes and pages show "Somente leitura"; a Personalizado manager hits the grant
ceiling; the Dono removes a member whose tab is open and the next action returns
them to their own farm; the phone at 390px shows the Equipe list, the permissions
page and the farm switcher in "Mais".

## Out of scope

- Plan limits (`maxUsers`), which the paused enforcement work will cover with the
  other caps.
- Sending e-mail, verifying e-mail, and a "Avisar no WhatsApp" link on the new
  convite.
- Transferring ownership or more than one Dono.
- An audit trail of who changed what.
- Per-action permissions finer than the eight areas.
- Deleting a done, costed treatment from the calendar needs only Sanitário
  edit, although its cost leaves the financeiro; only deleting a whole manejo
  with values asks for Financeiro.
- Creating a second farm for someone who already has one.
