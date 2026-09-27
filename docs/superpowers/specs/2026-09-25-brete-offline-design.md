# Brete offline — design

Date: 2026-09-25 · Canvas: "Brete offline" (runner sem sinal, Sincronização,
instalar e começar sem sinal).

## Goal

The phone keeps working at the curral without signal. An open manejo can be
passed animal by animal (pesar, tratar, transferir, vender, refugo, dúvida,
baixa, pular, desfazer, encerrar), a manejo can be started there (except an
entrada), and everything done offline is sent, in order, when the signal
returns. The app installs on the home screen and opens without signal on the
last snapshot of the farm. Nothing is lost silently: what the server refuses
because someone else got there first is shown as a conflito, and the vaqueiro
decides, one by one or all at once, whether the server's record or the
phone's stands.

Out of scope: registering new animals offline (entrada), background sync
while the app is closed, push notifications, offline writes on any screen
other than the brete and Iniciar manejo.

## Words

- **Snapshot**: the last `GET /api/herd` payload the phone received for this
  user and farm, kept in IndexedDB with the time it was taken. It is what the
  user was allowed to see (money already redacted server-side), never shared
  between users.
- **Fila** (outbox): the ordered list of operations done offline, or done
  while earlier operations of the same session were still waiting, kept in
  IndexedDB until the server accepts or the user discards them.
- **Pass guardado**: an operation in the fila. The entry it produced in the
  store is provisional (`pending`) until the server confirms it.
- **Conflito**: an operation the server refused with 409 because the entry
  was no longer actionable (someone else completed, skipped, set aside or
  reopened it, the session was closed, the bull ran out of doses, the animal
  was given a baixa).
- **Aplicar o meu**: resend the operation with `force`, which reopens the
  server's entry and applies the phone's pass in one transaction.
- **Manter do servidor**: drop the operation and take the server's record.

## How it behaves

### Online, nothing waiting

Exactly as today: each pass is one request, the store merges the response.

### The signal drops during a session

The runner keeps working. Each pass is applied to the store at once through
the same pure `buildPassEffects` the server uses (`lib/domain/manejo.ts`), so
the animal leaves the line, the weight and the treatment appear, the
progress moves; the entry and the records it created are marked `pending`
and listed under "Guardados no celular". The header shows the pill "Sem
conexão" and a banner "Sem conexão desde 14:07 · N passes guardados no
celular. Serão enviados quando o sinal voltar." with "Ver fila". Desfazer on
a guardado pass removes it from the fila and reverts its local effects
without any request. Encerrar goes to the fila after the passes.

Order is preserved beyond the offline moment: while a session has anything in
the fila, new passes of that session also go to the fila, so a later pass
never reaches the server before an earlier one.

### Starting a manejo without signal

Iniciar manejo works offline for sanidade, pesagem, transferência, venda and
inseminação (the tipo stays the dialog's Select; Entrada is a disabled
option there). The phone generates the session id and the fila holds a "start"
operation before the passes. The dialog says "Sem conexão: o manejo começa no
celular e é enviado quando o sinal voltar." and disables Entrada with
"precisa de sinal (cria animais novos)". The primary button reads "Começar no
celular". The session appears in the Manejo list with a "no celular" pill.

If the server later refuses the start (an animal not found, a lot no longer
valid, a bull of another farm, a non-female in an inseminação), every
operation of that session becomes a falha with the server's reason and the
only action is Descartar (which also removes the local session).

### Opening the app without signal

The installed app (or the browser) loads the shell from the service worker's
cache and the farm from the snapshot. A line under the header of every page
says "Sem conexão · dados de 24/09 às 14:07". Reads work everywhere; writes
outside the brete and Iniciar manejo show the existing failure toast. A page
never visited online falls back to `/offline`, which says "Sem conexão. Abra
Manejo para continuar um brete." with a link to `/manejo`.

### The signal returns

Sync starts by itself (the `online` event, the app coming to the foreground,
each new operation while online, and every 30 s while the fila is not empty)
and can be forced with "Sincronizar agora". Operations go one at a time in
fila order:

| Server answer | What happens |
| --- | --- |
| 2xx | the provisional records of that operation are removed and the response is merged exactly as the online path merges it |
| 409 `entry_not_actionable`, `held_pending`, `out_of_stock`, `animal_inactive`, `has_diagnosis`, `session_closed`, `not_female`, `bull_not_found`, `id_taken` | the operation becomes a conflito with the server's detail; later operations on the same animal in the same session become conflitos too; other animals continue |
| 401 | sync pauses; the sheet says "Entre de novo para enviar"; the fila stays |
| network error, 5xx, 429 | retry after 1 s, 5 s, 30 s, then every 30 s; the order holds |
| other 4xx (422 validation) | falha with the server's message; Descartar is the only action |

The sheet "Sincronização" (from the pill, from the Manejo tab badge, from the
Manejo list) shows: the status line ("Sem conexão desde 14:07" · "Conectado ·
enviando 2 de 3…" with a thin progress bar · "Tudo enviado às 14:41"), "A
enviar · N" (hora, brinco, ação, valor), "Conflitos · N" with the explanation
"Estes animais já foram tratados em outro aparelho.", the batch buttons
"Aplicar todos os meus" and "Manter todos do servidor", and per conflito the
phone's record against the server's ("Concluído 14:12 · 301 kg" vs "Concluído
por Ana às 14:15 · 299 kg") with "Manter do servidor" and "Aplicar o meu";
"Falhas · N" with Descartar. When the server's session is closed, "Aplicar o
meu" is disabled with "manejo já encerrado"; when the conflict is
`has_diagnosis`, it is disabled with "vaca já tem diagnóstico".

"Manter do servidor" drops the operation; the local provisional records go
and the store takes the server's state (one `reloadHerd` after the last
choice of a batch). "Aplicar o meu" resends with `force: true`; a second 409
turns it into a falha.

### Where the fila shows

The Manejo tab (phone) and the Manejo row of the sidebar (desktop) carry a
small brand badge with the count of operations waiting; the runner's header
pill reads "Sem conexão" offline, "Sincronizando" while a replay is in
flight and "N a enviar" online while the fila is not empty. Tapping any of them opens the sheet.

### Installing

`app/manifest.ts` (name MeuBov, `start_url` `/dashboard`, `display`
standalone, theme `#3e7150`, background `#f4f1ea`, 192 and 512 px PNG icons
rendered from the brand mark). On Android/Chrome the Painel shows the card
"Instale o MeuBov no celular" when `beforeinstallprompt` fires, with
"Instalar" and "Agora não" (hidden for 30 days after "Agora não", forever once
installed). On iOS the card explains "Compartilhar → Adicionar à Tela de
Início". Desktop never shows it.

## Rules of the machine

- **Storage**: IndexedDB database `meubov`, stores `snapshot` (key
  `userId:farmId` → `{ data: HerdData, farms, permissions, savedAt }`),
  `outbox` (key `id`, indexed by `seq`), `meta`. Behind a five-function
  interface (`get`, `put`, `delete`, `list`, `clear`) with an in-memory
  implementation for tests. No new dependency.
- **Operation**: `{ id: uuid, seq: number, userId, farmId, sessionId,
  kind: "start" | "complete" | "skip" | "set-aside" | "baixa" | "reopen" |
  "carcass-yield" | "close", earTag?: string, body: object, createdAt: ISO
  datetime, state: "queued" | "sending" | "conflict" | "failed", detail?:
  { error: string, server?: ManejoSessionAnimal }, attempts: number }`.
- **Provisional records**: entries, treatments, weighings and breedings a
  local pass creates carry `localOpId`; the entry carries `pending: true`.
  Both fields live only in the store and the snapshot, never in a request.
  Reconciling an operation removes every record with its `localOpId` and
  merges the server response through the same functions the online actions
  use (`mergeCompleteResult`, `mergeSetAsideResult`, … extracted from the
  store's current actions so both paths share them).
- **Optimistic effects** come from `buildPassEffects(session, data)` plus the
  same herd effects the server applies (lot change, `active: false` on a sale
  or baixa, dose decrement on an inseminação), in `lib/offline/localApply.ts`.
  A fixture-driven test proves `localApply` and the server's use cases
  produce the same entry, treatment, weighing and animal patch for every
  kind.
- **Ids**: an offline start generates the session id (uuid v4). Provisional
  treatment/breeding ids are `local:<uuid>`; provisional weighing ids are
  negative numbers. The server keeps generating the real ones.
- **When to queue**: an action queues when `navigator.onLine` is false, when
  the last request failed for network reasons in the last 10 s, or when the
  session already has operations in the fila. Otherwise it goes straight to
  the API as today.
- **Snapshot**: written after every successful `load` and `reloadHerd`, and
  after every local apply and reconcile (so a reload offline shows the
  provisional records). Cleared on sign-out and when the active farm changes
  user. Boot order: try the API; on failure with a snapshot, boot from it
  with `offline: true` and `snapshotAt`; without one, the existing failure
  screen.
- **Service worker** (`public/sw.js`, registered by `AppShell` once, scope
  `/`, `updateViaCache: "none"`; `next.config.ts` adds the headers the Next
  guide lists for `/sw.js`): `/_next/static/*` cache-first; navigations and
  `_rsc` fetches network-first with a 3 s timeout, falling back to the cached
  copy of the same URL, then to the runner template, then to `/offline`;
  never caches `/api/*`. The **runner template** is the last document and
  `_rsc` payload fetched for any `/manejo/<id>` page: the runner reads its
  session id from the URL (`usePathname`), never from the route params, so
  the template serves every session. `/offline`, `/manejo` and `/dashboard`
  are cached on first visit. The worker is a plain script with its routing
  in one pure function.
- **Server**: `POST /manejo` accepts an optional `id` (uuid); an existing
  session with that id in the farm is returned as is (200), an id owned by
  another farm answers 409 `id_taken`. `complete`, `set-aside`, `skip` and
  `baixa` accept an optional `force: true`: when the entry is not pending,
  the reopen logic runs in the same transaction and the pass is applied;
  refused with 409 `session_closed` when the session is closed and with the
  reopen rules' own 409s (`has_diagnosis`). `close` stays idempotent.
- **Permissions**: the fila only ever holds what the user could do online;
  the server checks again on replay. A member whose Manejo access was
  removed meanwhile sees 403 → falha.
- **Auth**: the cookie lives 7 days; longer offline → 401 on the first
  replay → sync pauses until the user signs in again; the fila survives.
- **Money**: the snapshot is the user's own redacted payload; the sync sheet
  shows R$ only with Financeiro view, as the runner does.

## Code

- `lib/offline/db.ts` (IndexedDB wrapper + memory implementation),
  `lib/offline/outbox.ts` (enqueue, dequeue, resolve, list, per-session
  order), `lib/offline/localApply.ts`, `lib/offline/sync.ts` (the state
  machine: triggers, replay, conflict and failure handling, `force`),
  `lib/offline/snapshot.ts`, `lib/offline/useOffline.ts` (online flag,
  counts, sheet state).
- Store: `queueOrSend` decision inside the manejo actions; merge helpers
  extracted (`lib/store/manejoMerge.ts`); `offline`, `snapshotAt`,
  `outboxCount` slices.
- Server: `Start.useCase.ts` (optional id, idempotent), `_shared/session.ts`
  (`forceReopen` used by Complete, SetAside, Skip, Baixa), schemas, tests.
- UI: `components/offline/OfflinePill.tsx`, `OfflineBanner.tsx`,
  `QueuedPassesList.tsx` (in the runner), `SyncSheet.tsx`, `SyncBadge.tsx`
  (tab bar and sidebar), `InstallCard.tsx` (Painel), `app/offline/page.tsx`,
  `app/manifest.ts`, icons under `public/icons/`, `public/sw.js`,
  `components/layout/ServiceWorker.tsx` (registration).
- Runner: reads the id from the pathname; shows the pill, banner and list;
  Iniciar manejo dialog: offline note, Entrada disabled, "Começar no celular".

## Tests

Unit: outbox order and persistence (memory db); `localApply` parity with the
server use cases for every kind; sync state machine with a fake transport
(2xx, each 409, 401 pause, network retry and order, force resend, dependent
operations, discard); snapshot boot; the worker's routing function. Server
use-case tests: idempotent start, `id_taken`, `force` on the four pass
routes, `session_closed`. Smoke on a throwaway database with Playwright:
online start → `setOffline(true)` → three passes → reload the runner page
offline (served by the worker) → passes still there → online → server rows
match; a second context completes one of the same animals first → the
conflict appears → "Aplicar o meu" and "Manter do servidor" each once, and
the batch button once; start a manejo offline and sync it; the manifest and
`/sw.js` are served with the right headers; the install card shows on an
Android user agent and not on desktop.
