# Excluir manejo (soft delete com reversão) — design

Date: 2026-09-11. Status: approved, ready for the implementation plan.

Companion work: the `/manejo/registro/[key]` record screen is specified
separately and is where the closed-manejo delete button lives. This spec does
not depend on that screen shipping first — until it does, the button has a home
on the chute screen and on the history row menu.

## Goal

A manejo can be wrong: the vermífugo booked on the wrong lote, a venda typed
with the wrong buyer, a truck of compras registered twice. Today nothing can be
taken back once the session closes — `reopenAnimal` undoes a single pass, but
only while the session is still open, and there is no delete route at all.

The farmer gets one verb per state: **descartar** a manejo still running at the
chute, **excluir** one already closed. Both undo what the manejo did to the
herd, and both leave the row in the database with a `deleted_at` stamp so the
history of the fazenda is never actually erased.

## What a delete reverts

A manejo is not a record next to the herd — it moved the herd. Deleting the row
without undoing its effects would leave an animal sold with no venda behind it,
so every kind reverts what it applied:

| kind | reverted | mechanism |
| --- | --- | --- |
| sanitária | the treatments the passes applied, boosters included | `treatments.deleted_at` (column exists, migration 0012) |
| pesagem | the weight readings captured at the chute | `weighings.deleted_at` (new, migration 0013) |
| transferência | each animal back to `previousLotId` | `animals.lot_id` |
| venda | each animal back to the active herd, in its old lote | `active`, `inactive_reason`, `inactive_date` cleared |
| entrada | the animals the session registered cease to exist | animal row removed, passes cascade |

An entrada is the one hard delete: its animals were born with the session and
have no history of their own — the same rule `reopenAnimal` already applies when
a single entry pass is undone.

The session row itself takes `manejo_sessions.deleted_at`. The ledger derives
compras and vendas from sessions (`herdMovements`), so the money leaves the
finance screen with the record; no expense row is touched.

## Guards

The delete is refused when reverting would overwrite something that happened
after the manejo. The rules read the herd's **current state**, not dates:

- **transferência** — refused for an animal no longer standing in the lote this
  session put it in; someone moved it since.
- **venda** — refused for an animal that is active again, or whose inactivity
  was caused by something other than this session.
- **entrada** — refused for an animal carrying anything this session did not
  create: a weighing, a treatment, a pass in another session.
- **origem apagada** — refused when `previousLotId` points at a soft-deleted
  lote, the check `reopenAnimal` runs through `validateLotAssignment`.
- **sanitária** and **pesagem** are never refused. Removing an application or a
  reading leaves nothing downstream standing on it.

A refusal is total: nothing is written, and the response names the animals and
what blocks each one, so the farmer deletes the later manejo first and comes
back. Partial deletes are not offered — half a reverted venda is worse than
none.

An open session is refused only by the lote rule and, when it is an entrada, by
the entrada rule — an animal registered at the truck can already have been
weighed in the same pass, and that weighing belongs to this session, so only an
effect from somewhere else blocks it. Otherwise its passes are recent by
definition and nothing has had time to depend on them.

## Schema — migration 0013

Two columns, both nullable timestamps, both following 0011 and 0012:

```sql
ALTER TABLE "manejo_sessions" ADD COLUMN "deleted_at" timestamp;
ALTER TABLE "weighings" ADD COLUMN "deleted_at" timestamp;
```

Reads filter them at the boundary, never in the selectors:

| query | file | filter |
| --- | --- | --- |
| sessions of the farm | `lib/api/services/herd.ts:96` | `isNull(manejoSessions.deletedAt)` |
| session animals | `lib/api/services/herd.ts:143` | `isNull(manejoSessions.deletedAt)` |
| weighings of the farm | `lib/api/services/herd.ts:110` | `isNull(weighings.deletedAt)` |
| weighings of one animal | `lib/api/services/animals.ts:613` | `isNull(weighings.deletedAt)` |

Everything downstream — `calculateAdg`, the 120-day GMD window, `lotSummary`,
the weight evolution chart, the animal timeline — reads `animal.weighings` off
the loaded snapshot and needs no change.

`manejo_session_animals.weighing_id` is a set-null FK. A soft-deleted weighing
keeps the reference intact, which is what lets a later revert know which reading
belonged to which pass.

`reopenAnimal` changes with this: it stamps the weighing instead of deleting the
row, so a single-pass undo and a whole-session delete leave the same trail.

## Service and routes

`deleteSession(farmId, id)` joins `lib/api/services/manejo.ts` beside
`reopenAnimal`, built from the same per-animal revert and running in one
transaction with the session row locked. Open and closed sessions take the same
path; the status only changes the words the UI puts on it.

```ts
type DeleteSessionResult =
  | { session: ManejoSession; reverted: RevertedEffects }
  | { blocked: BlockedAnimal[] }
  | "session_not_found";
```

`RevertedEffects` carries what the client must drop from its snapshot: the
treatment ids, the weighings by ear tag, the animals restored (lot, active
state) and the ear tags removed by an entrada. `BlockedAnimal` is an ear tag
plus a reason code the UI turns into pt-BR.

`DELETE /manejo/:id` carries it, farm-scoped like every other manejo route,
returning 409 with the blocked list when the guards refuse.

## The rows with no session

Half the history is not sessions: treatments booked on the calendar and
weighings typed on a ficha or imported. They delete from the same button:

- a **treatment group** calls the existing `deleteTreatments(farmId, id, "batch")`,
  which already groups by `batch_id`, or by day/treatment/status when there is
  none;
- a **weighing day** gets a new `deleteWeighings(farmId, ids)` that stamps the
  readings of that group.

The farmer never has to know which kind of row they are looking at.

## UI

**Chute screen** (`/manejo/[id]`, open session): "Descartar manejo" in the
header, next to the close action. The confirmation says how many of how many
have already passed and what comes back.

**Registro screen** (`/manejo/registro/[key]`, closed) and the history row menu:
"Excluir manejo", same confirmation.

One dialog serves both, and it spells the reversal out in the farmer's terms
rather than in table names:

```
Excluir a venda de 12/05?

8 animais voltam ao rebanho ativo, no Lote 3.
O valor de R$ 52.400 sai do financeiro.

[Cancelar]  [Excluir manejo]
```

Blocked, it lists what stands in the way and offers no delete button:

```
Não dá para excluir esta venda

B-0142 passou por um manejo depois desta venda.
B-0180 está em outro lote desde 20/05.

Exclua o manejo mais recente primeiro.

[Entendi]
```

There is no undo toast and no lixeira. Restoring would mean re-applying every
pass to a herd that has moved on; the way back is to register the manejo again.
The confirmation is the moment of truth, which is why it names the consequence.

## Testing

Pure first: `lib/domain/manejoRevert.ts` decides, from a session and the current
herd, what one delete reverts and what blocks it — one case per kind, one per
guard, plus the session that reverts cleanly with a skipped animal in it.
`lib/domain/__tests__/manejoRevert.test.ts` covers them.

The service gets db-stub tests for the three paths the calendar delete
established: the clean revert, the blocked animal that writes nothing, and a
session of another farm, which is `session_not_found`.

## Out of scope

- Restoring a deleted manejo (no lixeira, no undo toast).
- Editing a closed manejo. Delete and register again is the whole story.
- Soft-deleting animals. An entrada's animals are removed outright, as today.
- Any change to how the ledger presents movements beyond losing the deleted ones.
