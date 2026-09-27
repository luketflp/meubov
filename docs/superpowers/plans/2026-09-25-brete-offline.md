# Brete offline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The brete keeps working without signal: passes and offline-started manejos queue on the phone, apply locally at once, sync in order when the signal returns, and conflicts are decided by the vaqueiro one by one or in batch; the app installs and opens offline on the last snapshot.

**Architecture:** An IndexedDB outbox and snapshot behind a five-function store wrapper; optimistic local effects through the server's own `buildPassEffects`; a single-flight sync engine with a fake-able transport; two server additions (idempotent start id, `force` on the four pass routes); a hand-written service worker for the shell with a runner "template" document, the runner reading its id from the URL; a Sincronização sheet, pill, badge and install card.

**Tech Stack:** Next.js 16.2.11 app router (Turbopack; `public/sw.js` + `app/manifest.ts` per `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`), Elysia + Eden, Drizzle/Postgres, zustand, IndexedDB, Tailwind, vitest, Playwright (headless, `context.setOffline`).

**Spec:** `docs/superpowers/specs/2026-09-25-brete-offline-design.md`. Canvas: https://claude.ai/artifact/2h55gyJAjK3bwrX5HRVu1h.

## Global Constraints

(see the contract's Global constraints; binding for every task)

## Review Focus

1. Two passes of the same session done offline must reach the server in the order they were done, even when the first one fails with a network error and retries — Task 8 tests the drain order with a flaky transport.
2. A pass queued, then undone offline, must leave no provisional record and send nothing — Task 9 tests `reopenManejoAnimal` on a queued op (remove + stripLocal, no transport call).
3. "Manter do servidor" on a conflito must remove the phone's provisional weighing/treatment from the store, not only the outbox row — Task 8 (`onDropped`) and Task 9 (`stripLocal` wiring) tests.
4. Opening `/manejo/<id-never-visited>` offline must render that session from the template document — Task 1's spike script is the test, run again in Task 11's smoke.
5. A phone that started a manejo offline and lost the auth cookie (401 on replay) must keep the fila after signing in again — Task 8 tests `paused_auth` keeps ops queued; Task 11 smoke signs out/in with a non-empty fila.

## Waves

| Wave | Tasks | Needs | Notes |
| --- | --- | --- | --- |
| 0 | 1 | — | spike + shell: sw.js, /offline, registration, runner id from pathname; the plan stops if the template trick fails |
| 1 | 2, 3, 5 | 1 | install; storage types/db/outbox; server id + force |
| 2 | 4, 6, 7 | 3 (4, 7) · — (6) | snapshot boot; merge helpers extraction; local apply |
| 3 | 8 | 3, 6, 7 | sync engine |
| 4 | 9 | 4, 5, 6, 7, 8 | store integration + transport + hooks |
| 5 | 10 | 9, 2 | UI |
| 6 | 11 | all | smoke (offline flows with Playwright), whole-branch review |

## Shared interfaces

(the contract, verbatim)


Repo: /home/luketa/meubov (Next.js 16.2.11 app router — read `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` before any PWA code; Elysia API mounted at `app/api/herd/[[...slugs]]/route.ts` → `lib/api/app.ts`; Drizzle/Postgres; zustand store `lib/store/useHerdStore.ts`; Better Auth cookies (7-day session); vitest; pnpm). Spec (binding): `docs/superpowers/specs/2026-09-25-brete-offline-design.md` — read it whole first. Canvas: https://claude.ai/artifact/2h55gyJAjK3bwrX5HRVu1h (`project/Main.dc.html` runner offline phone, `Runner-Desktop`, `Sync-Phone`, `Sync-Online`, `Install-Painel`, `Start-Offline`; read with the Artifact tool when a task needs exact copy or layout).

### Global constraints
- Copy pt-BR exactly as the spec/canvas write it: "Sem conexão", "Sincronizando", "N a enviar", "Guardados no celular", "Sincronização", "A enviar", "Conflitos", "Falhas", "Aplicar todos os meus", "Manter todos do servidor", "Aplicar o meu", "Manter do servidor", "Descartar", "Sincronizar agora", "Começar no celular", "precisa de sinal (cria animais novos)", "Instale o MeuBov no celular", "Instalar", "Agora não", "no celular", "Sem conexão · dados de dd/mm às HH:MM". Code, comments, commit messages in English; no attribution trailers.
- No new runtime dependency. IndexedDB through the repo's own five-function wrapper with an in-memory twin for tests. Icons PNGs are generated once by a script with the Playwright chromium already on this machine (no sharp).
- The online path stays byte-for-byte in behaviour: when online and the session has nothing waiting, actions call the API exactly as today and merge through the same helpers.
- Never invent server ids on the phone except the session id of an offline start (uuid v4) and provisional ids (`local:<uuid>` for treatments/breedings, negative integers for weighings). Provisional markers (`pending`, `localOpId`) never leave the phone: not in request bodies, not in the API schemas.
- Order: an operation of a session never reaches the server before an earlier operation of the same session.
- Every 409 the spec lists becomes a conflito, never a silent drop; 401 pauses; network/5xx retries 1 s, 5 s, 30 s, then every 30 s; other 4xx → falha.
- The service worker never caches `/api/*`; it is plain JS with its routing in one pure function; registered once with `{ scope: "/", updateViaCache: "none" }`; `next.config.ts` serves `/sw.js` with `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-cache, no-store, must-revalidate`.
- Money: the snapshot is the user's own redacted payload keyed by `userId:farmId`; cleared on sign-out.
- Vitest with explicit paths and `--exclude '**/worktrees/**'`; never `-u` except the two route snapshot tests (`lib/api/__tests__/routeRequirements.test.ts`, `routeTable.test.ts`) with explicit paths; `pnpm tsc --noEmit`; `pnpm exec eslint <paths>`. Commit per task by pathspec (`git add <files>; git commit -m "…" -- <files>`), `feat(offline): …` / `fix(offline): …`, no trailers.
- Touch targets ≥ 44 px on the phone; `aria-label` on icon-only buttons; `aria-pressed` groups with the PermissionsGrid segmented classes where a switch is needed.

### File ownership
- T1 shell: `public/sw.js`, `components/layout/ServiceWorker.tsx`, `components/layout/AppShell.tsx` (registration line + offline line), `app/offline/page.tsx`, `next.config.ts` (headers), `app/(app)/manejo/[id]/page.tsx` (id from pathname), `lib/offline/swRouting.ts` (the pure routing function, imported by nothing at runtime — `sw.js` inlines the same logic; the test imports `swRouting.ts`), `lib/offline/__tests__/swRouting.test.ts`, the spike script in the scratchpad.
- T2 install: `app/manifest.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`, `cli/renderIcons.mjs`, `components/offline/InstallCard.tsx`, `lib/offline/install.ts` (+ test), `app/(app)/dashboard/page.tsx` (one line: the card).
- T3 storage: `lib/offline/types.ts`, `lib/offline/db.ts`, `lib/offline/outbox.ts`, `lib/types.ts` (provisional fields), tests.
- T4 snapshot: `lib/offline/snapshot.ts` (+ test), `lib/repository/ApiHerdRepository.ts` (no change expected), `lib/store/useHerdStore.ts` ONLY the `load`/`reloadHerd` boot path and the `offline`/`snapshotAt` slices (coordinate: T6 and T9 also edit the store — T4 lands in wave 2 before T9; T6 in wave 2 touches only the manejo actions' merge bodies; keep hunks apart).
- T5 server: `lib/api/domains/manejo/schemas/manejo.schema.ts`, `lib/api/domains/manejo/manejo.controller.ts`, `lib/api/domains/manejo/useCases/{Start,CompleteAnimal,SetAsideAnimal,SkipAnimal,BaixaAnimal,ReopenAnimal}.useCase.ts`, `lib/api/domains/manejo/_shared/session.ts` (`forceReopen`), `lib/api/domains/manejo/_shared/revert.ts` (new: the entry-revert logic extracted from ReopenAnimal), tests under `useCases/__tests__/`, route snapshot tests only if a route changes (none should).
- T6 merge helpers: `lib/store/manejoMerge.ts` (+ test), `lib/store/useHerdStore.ts` manejo actions rewritten to call them (`completeManejoAnimal`, `skipManejoAnimal`, `setAsideManejoAnimal`, `baixaManejoAnimal`, `reopenManejoAnimal`, `setSaleCarcassYield`, `closeManejoSession`, `startManejoSession`).
- T7 local apply: `lib/offline/localApply.ts` (+ parity test using the manejo use-case fixtures).
- T8 sync: `lib/offline/sync.ts` (+ test with a fake transport).
- T9 store integration: `lib/offline/apiTransport.ts`, `lib/offline/useOffline.ts`, `lib/store/useHerdStore.ts` (`queueOrSend`, `sync` slice, triggers, sign-out clearing), `lib/store/offlineWiring.ts`.
- T10 UI: `components/offline/{OfflinePill,OfflineBanner,QueuedPassesList,SyncSheet,SyncBadge,OfflineDataLine}.tsx`, `components/manejo/session-runner.tsx` (pill, banner, list), `components/manejo/register-manejo-dialog.tsx` (offline mode), `components/manejo/open-sessions.tsx` ("no celular" pill), `components/layout/{MobileTabBar,Sidebar,PageHeader}.tsx` (badge / data line).
- T11 smoke + review: scratchpad scripts only; fixes as `fix(offline): …`.

### Types (T3 produces; everyone consumes)
```ts
// lib/offline/types.ts
export type OutboxKind = "start" | "complete" | "skip" | "set-aside" | "baixa" | "reopen" | "carcass-yield" | "close";
export type OutboxState = "queued" | "sending" | "conflict" | "failed";
export interface OutboxDetail { error: string; message?: string; server?: ManejoSessionAnimal; sessionClosed?: boolean }
export interface OutboxOp {
  id: string;            // uuid v4, also the localOpId of the records it created
  seq: number;           // monotonic per phone, assigned by enqueue
  userId: string; farmId: number; sessionId: string;
  kind: OutboxKind; earTag?: string;
  body: Record<string, unknown>;   // exactly the request body the online action would send (without force)
  createdAt: string;               // ISO datetime
  state: OutboxState; detail?: OutboxDetail; attempts: number;
}
// lib/types.ts additions (client-only markers; mappers never set them; schemas never accept them)
ManejoSessionAnimal.pending?: boolean; ManejoSessionAnimal.localOpId?: string;
Treatment.localOpId?: string; Weighing.localOpId?: string; Breeding.localOpId?: string;
ManejoSession.pending?: boolean;  // an offline-started session not yet on the server
```

### Storage (T3)
```ts
// lib/offline/db.ts
export interface KeyValueStore<T> { get(key: string): Promise<T | undefined>; put(key: string, value: T): Promise<void>; delete(key: string): Promise<void>; list(): Promise<T[]>; clear(): Promise<void> }
export type StoreName = "snapshot" | "outbox" | "meta";
export function openStore<T>(name: StoreName): KeyValueStore<T>;   // IndexedDB db "meubov" v1, one object store per name, keyPath none (explicit keys); lazy open; every method catches a missing indexedDB (SSR/tests) by throwing NoIndexedDb
export function memoryStore<T>(): KeyValueStore<T>;
// lib/offline/outbox.ts
export interface OutboxCounts { queued: number; conflict: number; failed: number }
export interface Outbox {
  enqueue(op: Omit<OutboxOp, "seq" | "state" | "attempts" | "createdAt"> & { createdAt?: string }): Promise<OutboxOp>;
  list(): Promise<OutboxOp[]>;                 // seq ascending
  get(id: string): Promise<OutboxOp | undefined>;
  update(id: string, patch: Partial<OutboxOp>): Promise<OutboxOp | undefined>;
  remove(id: string): Promise<void>;
  removeSession(sessionId: string): Promise<void>;
  hasPending(sessionId: string): Promise<boolean>;   // any op of that session in any state
  nextSendable(): Promise<OutboxOp | undefined>;     // lowest-seq "queued" op that is not blocked: blocked when an earlier op of the same session is in state conflict/failed AND (it is a "start" OR shares the earTag) — other animals of the session still flow
  counts(): Promise<OutboxCounts>;
}
export function createOutbox(store: KeyValueStore<OutboxOp>, meta: KeyValueStore<number>): Outbox;   // meta key "seq" holds the last seq
export function dependentOps(ops: OutboxOp[], op: OutboxOp): OutboxOp[];   // later ops (seq greater) of op.sessionId that share op.earTag, or every later op of the session when op.kind === "start"
```

### Snapshot (T4)
```ts
// lib/offline/snapshot.ts
export interface Snapshot { data: HerdData; farms: FarmSummary[]; activeFarmId: number; savedAt: string }   // FarmSummary = the store's farms element type (read lib/store/useHerdStore.ts)
export const snapshotKey = (userId: string, farmId: number) => `${userId}:${farmId}`;
export async function saveSnapshot(store: KeyValueStore<Snapshot>, key: string, snap: Snapshot): Promise<void>;
export async function loadSnapshot(store: KeyValueStore<Snapshot>, key: string): Promise<Snapshot | undefined>;
export async function clearUserSnapshots(store: KeyValueStore<Snapshot>, userId: string): Promise<void>;
// store slices (T4): offline: boolean; snapshotAt: string | null; load(): tries the API; on failure, with a snapshot → set({ ...snap.data, farms, activeFarmId, loaded: true, offline: true, snapshotAt }); saves the snapshot after every successful load/reloadHerd (userId from authClient session or the /farms payload — read how the store learns the user).
```

### Server (T5)
- `NewManejoSessionBody` gains `id: t.Optional(t.String({ format: "uuid" }))`. `StartSessionUseCase`: with an id, select the session by id; same farm → return it as is (no insert, 200); other farm → return `"id_taken"` → controller 409 `{ error: "id_taken" }`; else insert with that id.
- `ManejoPassBody`, `SetAsideBody`, `ManejoSkipBody` and the baixa body gain `force: t.Optional(t.Boolean())`. In Complete/SetAside/Skip/Baixa: when `entry.outcome !== "pending"`: without force → 409 `entry_not_actionable` as today; with force → if `session.status === "closed"` → 409 `{ error: "session_closed" }`; else `forceReopen(tx, { farmId, session, entry, animal })` (the revert logic of ReopenAnimal extracted to `_shared/revert.ts` as `revertEntry(tx, ctx): Promise<ReopenResult | "has_diagnosis">`; ReopenAnimal now calls it too), a `has_diagnosis` answer → 409 as Reopen answers today; then the normal pass continues in the same transaction.
- Responses unchanged otherwise. Route table unchanged (no snapshot update expected; if the snapshot tests still fail, run them with `-u` on explicit paths and say why).

### Merge helpers (T6)
```ts
// lib/store/manejoMerge.ts  — pure, over HerdSlices = Pick<HerdStore, "animals" | "treatments" | "manejoSessions" | "semenBulls">
export interface CompleteResult { entry: ManejoSessionAnimal; treatments: Treatment[]; weighing?: Weighing; animal?: { earTag: string; active: boolean; lotId: string }; breeding?: Breeding }
export function mergeCompleteResult(s: HerdSlices, sessionId: string, earTag: string, r: CompleteResult): HerdSlices;
export function mergeSkipResult(s, sessionId, earTag, entry: ManejoSessionAnimal): HerdSlices;
export function mergeSetAsideResult(s, sessionId, earTag, r: { entry: ManejoSessionAnimal; weighing?: Weighing }): HerdSlices;
export function mergeBaixaResult(s, sessionId, earTag, r: { entry: ManejoSessionAnimal; animal: Animal /* as the action types it today */ }): HerdSlices;
export function mergeReopenResult(s, sessionId, earTag, r: ReopenResult /* the action's current response type */): HerdSlices;
export function mergeCarcassYield(s, sessionId, r: { carcassYieldPct: number; amounts: { earTag: string; amountBrl: number }[] } /* read the action */): HerdSlices;
export function mergeClose(s, sessionId): HerdSlices;
export function mergeStart(s, session: ManejoSession): HerdSlices;
export function stripLocal(s: HerdSlices, localOpId: string): HerdSlices;   // removes every treatment/weighing/breeding with that localOpId, and resets the entry that carries it to outcome "pending" without pending/localOpId (or removes a pending session whose start op it was)
```
The store's actions call these with the same responses they receive today; behaviour identical (tests: each helper with a fixture; a store-level test is not required).

### Local apply (T7)
```ts
// lib/offline/localApply.ts
export interface LocalApplyResult extends CompleteResult {}
export function localApply(op: OutboxOp, ctx: { session: ManejoSession; animal: Animal; semenBulls: SemenBull[]; today: string }): LocalApplyResult | null;
// kinds: complete → buildPassEffects(session, op.body) + herd effects (transfer: lotId = destinationLotId; sale: active false + amountBrl per saleAmount when pricePerArroba; insemination: breeding with the picked bull, provisional id) with treatments ids `local:<uuid>`, weighing id negative (-(Date.now() % 1e9) - n), all carrying localOpId = op.id, entry { outcome: "done", weightKg, notes, pending: true, localOpId };
// skip → entry outcome "skipped"; set-aside → outcome op.body.list with weighing when weightKg; baixa → entry "skipped" with baixaPassNote + animal { active: false, inactiveReason, inactiveDate }; reopen/close/carcass-yield/start → null (handled by the store: reopen of a queued op = remove it + stripLocal; close = session.status "closed" locally with pending; carcass-yield = session field locally; start = localStartSession)
export function localStartSession(op: OutboxOp, ctx: { animals: Animal[] }): ManejoSession;   // id = op.sessionId, status "open", pending: true, animals = earTags → { earTag, outcome: "pending" }, name via sessionName()
```
Parity test: for each kind, the same fixture through `localApply` and through the server use case's pure parts (`buildPassEffects`, `saleAmount`, `baixaPassNote`) yields equal entry/treatment/weighing/animal fields except ids and the provisional markers.

### Sync (T8)
```ts
// lib/offline/sync.ts
export type SendResult = { ok: true; result: unknown } | { ok: false; status: number; error?: string; message?: string; server?: ManejoSessionAnimal; sessionClosed?: boolean };
export interface Transport { send(op: OutboxOp, opts: { force: boolean }): Promise<SendResult> }   // throws on network failure
export interface SyncStatus { online: boolean; phase: "offline" | "idle" | "sending" | "paused_auth"; sending?: { done: number; total: number }; lastSyncedAt?: string; offlineSince?: string; counts: OutboxCounts }
export type SyncKick = "online" | "visible" | "enqueue" | "manual" | "interval";
export interface SyncEngine { start(): void; stop(): void; kick(reason: SyncKick): Promise<void>; resolve(opId: string, choice: "server" | "mine"): Promise<void>; resolveAll(choice: "server" | "mine"): Promise<void>; discard(opId: string): Promise<void>; status(): SyncStatus; subscribe(fn: (s: SyncStatus) => void): () => void }
export interface SyncDeps { outbox: Outbox; transport: Transport; isOnline(): boolean; now(): string; timers?: { setTimeout; clearTimeout; setInterval; clearInterval }; onApplied(op: OutboxOp, result: unknown): void; onDropped(op: OutboxOp): void; onBatchResolved(): Promise<void> /* reloadHerd */; onAuthRequired(): void }
export function createSyncEngine(deps: SyncDeps): SyncEngine;
// rules: single-flight; kick() drains nextSendable() until none; per op: state "sending" → transport.send → ok: onApplied + remove; 409 with error in {entry_not_actionable, held_pending, out_of_stock, animal_inactive, has_diagnosis, session_closed, not_female, bull_not_found, id_taken} → state conflict with detail (sessionClosed when session_closed) and dependentOps → conflict {error:"dependent"}; 401 → phase paused_auth, op back to queued, stop draining, onAuthRequired; 403/404/422/other 4xx → failed with detail; thrown/5xx/429 → attempts++, back to queued, retry after 1s/5s/30s then every 30s; interval every 30 s while counts.queued > 0 and online. resolve(id,"server") → onDropped(op) + remove + also remove/onDropped dependents; resolve(id,"mine") → send with force:true; ok → onApplied; any 409 again → failed. resolveAll applies resolve to every conflict in seq order; after a batch (resolve or resolveAll finishing) → onBatchResolved(). discard → remove (+ dependents) + onDropped. status(): offline when !isOnline(), offlineSince set when it flips to offline; lastSyncedAt when a drain ends with counts.queued === 0.
```

### Store integration (T9)
- `lib/offline/apiTransport.ts`: `createApiTransport(api, animalIdByEarTag: (earTag) => string | undefined): Transport` mapping kinds to the Eden routes (`start` → `api.manejo.post({ ...body, id: op.sessionId })`, `complete` → `api.manejo({id}).animals({animalId}).complete.post({...body, force})`, `set-aside`, `skip`, `baixa`, `reopen`, `carcass-yield` → `api.manejo({id})["carcass-yield"].post`, `close`), turning Eden errors into `SendResult` (status 503/0 from a fetch failure → throw).
- Store: slices `sync: SyncStatus`, `outboxCount: number` (queued+conflict+failed); `queueOrSend` inside each manejo action: `const mustQueue = !navigator.onLine || recentNetworkFailure() || await outbox.hasPending(sessionId)`; when queuing: build the op (body = the exact online body), `outbox.enqueue`, apply locally (`localApply`/`localStartSession`/close/carcass-yield/reopen rules from the contract), save the snapshot, `sync.kick("enqueue")`; `reopenManejoAnimal` on an entry whose `localOpId` op is still queued → `outbox.remove` + `stripLocal` (no request). `onApplied` → `stripLocal(op.id)` then the matching `merge*` helper; `onDropped` → `stripLocal(op.id)`; `onBatchResolved` → `reloadHerd`. Triggers wired once in `lib/store/offlineWiring.ts` (window `online`/`offline`, `visibilitychange`, the engine's interval); sign-out clears the outbox and snapshots of the user. `lib/offline/useOffline.ts`: `useOffline(): { online: boolean; offline: boolean; snapshotAt: string | null; sync: SyncStatus; ops: OutboxOp[]; open: boolean; setOpen(v: boolean): void; resolve; resolveAll; discard; syncNow }` (ops kept in a small zustand slice refreshed after every outbox change).
- `registerEntryAnimal` never queues: offline → toast "Entrada precisa de sinal" and return false.

### UI (T10) — component contracts
- `OfflinePill()` → `<StatusPill>`-like pill: "Sem conexão" (attention, WifiOff) | "Sincronizando" (scheduled, RefreshCw) | "N a enviar" (brand, CloudUpload) | null when online and empty; clicking opens the SyncSheet.
- `OfflineBanner({ sessionId })` → attention-soft banner in the runner with the spec's sentence and a ghost "Ver fila".
- `QueuedPassesList({ sessionId })` → "Guardados no celular" list (hora · brinco · ação · valor · "a enviar" / "conflito" / "falha").
- `SyncSheet()` → bottom Dialog on phone / right-aligned Dialog on desktop, per the canvas: status line, A enviar, Conflitos with the batch buttons and per-item choices (disabled "Aplicar o meu" with "manejo já encerrado" when `detail.sessionClosed`, "vaca já tem diagnóstico" when `has_diagnosis`), Falhas with Descartar, footer "Sincronizar agora" (disabled offline with "sem conexão"; "Enviando…" while sending).
- `SyncBadge()` → the count bubble for the Manejo tab and sidebar row.
- `OfflineDataLine()` → "Sem conexão · dados de dd/mm às HH:MM" under PageHeader when `offline`.
- `InstallCard()` (T2) → Painel card per the canvas; `lib/offline/install.ts`: `shouldOfferInstall({ platform: "android" | "ios" | "other", installed: boolean, dismissedAt: string | null, today: string }): "prompt" | "ios-hint" | null` (30-day snooze), `detectPlatform(ua: string, standalone: boolean)`.
- Runner: id from `usePathname()` (T1); `register-manejo-dialog.tsx`: when offline → note under the title, Entrada option disabled with the helper, primary "Começar no celular"; `open-sessions.tsx`: "no celular" pill on `session.pending`.

### Reconciliation rulings (applied to the tasks below)

1. Ruling: `nextSendable` also blocks an op WITHOUT earTag (close, carcass-yield) while any earlier op of the same session is in conflict or failed; `dependentOps(op)` of a pass keeps the same-earTag rule, and a close/carcass-yield op becomes dependent when any earlier op of its session goes to conflict/failed. Update T3's outbox + test and T8's engine test accordingly.
2. T4: the store learns the user via `authClient.getSession()` in `load` and keeps it in `meta` under `LAST_USER_KEY` ("lastUser"); T9's sign-out clearing must use it. Snapshot farms use the store's `FarmOption` type (the contract's FarmSummary). "sending" ops count as queued.
3. T10 rulings: the server entry carries no author/time, so the "No servidor" box reads "Concluído · 299 kg" (spec's "por Ana às 14:15" deferred to a later server change); the banner shows only offline (the pill + list cover the online-with-fila state); the tab/sidebar badge only counts and navigation stays (the pill, the runner and the Manejo list open the sheet); Conflito pill in attention tone; T10's AppShell hunk anchors on `<PrintRoot />` and T1's on the registration line — verify they do not overlap.
4. T6/T7 accepted: `stripLocal` also restores the animal (lotId from `entry.previousLotId`, reactivates a locally sold animal; a baixa is not restored, as online); `localStartSession(op)` takes one argument (T9 must match); `LocalApplyResult.animal` widened with inactiveReason/inactiveDate/inactiveNotes; `compareByDate`/`withReproduction` live in `manejoMerge.ts` (one copy).
5. T5 accepted: `revertEntry` returns Reopen's real refusals; `forceReopen` lives in `_shared/revert.ts`; forcing an entrada pass is refused (`entry_not_actionable`); a forced pass on a closed session answers `session_closed` even when pending; a refusal after the undo throws so the transaction rolls back; baixa gets its own `ManejoBaixaBody`. T8 MUST add `session_not_open` to the conflict list (sessionClosed: true) and `lot_not_found` (404) stays a falha.
6. T1/T2 accepted: `proxy.ts` belongs to T1 (public paths "/" and "/offline"); `route(url, mode, method, headers?)` reads `RSC: 1` and bypasses prefetches; the worker registers only in production builds and unregisters in `next dev` (the spike and the Task 11 smoke run on `next build` + `next start`); if opening session B through a link fails, the pre-decided fix is `templateKey: null` for RSC; T1's AppShell hunk lands first, T10 re-anchors after it; icons come from `app/icon.svg`; `detectPlatform` returns `{ platform, installed }`.
7. Ruling (T3/T8/T9): the engine sends only ops whose `op.userId` equals the signed-in user (Task 4's `lastUser`); another user's ops stay in the store untouched and hidden (not counted, not listed) until that user signs in again. `Outbox.list/nextSendable/counts` take a `userId` filter (or the engine filters — pick one, apply consistently in T3, T8, T9 and the tests). The fila survives sign-out; only snapshots are cleared.
8. Ruling (T5 + T9): the 409 bodies for `entry_not_actionable`, `held_pending`, `session_closed` and `session_not_open` on the four pass routes include `entry` (the locked `ManejoSessionAnimal` mapped as the load does) so the sheet can show "No servidor: …" before the choice; the transport maps `value.entry` → `SendResult.server`. Update T5's controller + use-case returns and tests, T9's `apiTransport` and its test.
9. T9 accepted: `wireOffline` runs from the store's `load` (AppShell untouched by T9); each later `load` kicks manually (lifts a 401 pause); `lib/auth/navigation.ts` (`useSignOut`) belongs to T9; failed ops cascade to their dependents as falhas; an offline close keeps `pending: true` until reconciled; `stripLocal`'s `startedSessionId` applies to start ops only; `queueOrSend.test.ts` mocks the client (~20 lines).

---

### Task 1: Shell — service worker, /offline, registration, runner id from the URL, and the spike

**Files:**
- Modify: `app/(app)/manejo/[id]/page.tsx` (whole file, 18 lines; `useParams` at lines 8 and 12)
- Create: `lib/offline/swRouting.ts`
- Test: `lib/offline/__tests__/swRouting.test.ts`
- Create: `public/sw.js`
- Create: `components/layout/ServiceWorker.tsx`
- Modify: `components/layout/AppShell.tsx` (import after line 6 `import { MobileTabBar } …`; mount after line 72 `<PrintRoot />`)
- Create: `app/offline/page.tsx`
- Modify: `next.config.ts` (whole file; `output: "standalone"` line 4 and `redirects()` lines 5–26 stay byte-for-byte)
- Modify: `proxy.ts` (doc comment lines 17 and 21–23, new `PUBLIC_PATHS` after line 25, condition line 35) — **not in the contract's T1 file list; see the note in Step 7**
- Scratch (not committed): `<scratchpad>/spike-offline-template.mjs`

**Interfaces:**
- Consumes: nothing from other tasks (wave 0).
- Produces:
  - `lib/offline/swRouting.ts`: `export type SwStrategy = "static-cache-first" | "navigate-network-first" | "rsc-network-first" | "bypass"`; `export interface SwRoute { strategy: SwStrategy; cacheKey: string | null; templateKey: string | null }`; `export interface HeaderReader { get(name: string): string | null }`; `export function route(url: URL, mode: RequestMode | "navigate", method: string, headers?: HeaderReader): SwRoute`. The optional 4th argument is needed to see the `RSC: 1` header and to skip prefetches; `sw.js` passes `request.headers`.
  - Cache names `meubov-shell-v1` / `meubov-static-v1`; a cache key `k` lives at URL `/__sw/${encodeURIComponent(k)}` (Task 11's smoke reads them). Keys: document = its pathname (`/offline`, `/manejo`, `/manejo/<id>`), runner document template = `doc:/manejo/[id]`, RSC = `rsc:<pathname>`, RSC template = `rsc:/manejo/[id]`.
  - The runner page reads its session id from `usePathname()`.
  - `/offline` (public, no session) and `/sw.js` headers per the contract.

Facts checked in the code before writing this task:
- `proxy.ts` matcher `"/((?!api|_next/static|_next/image|.*\\..*).*)"` skips every path with a dot, so `/sw.js`, `/manifest.webmanifest` and `/icons/*.png` never meet the auth redirect. The proxy has no public-route list beyond `pathname !== "/"`, so `/offline` would be redirected to `/` for a visitor without the cookie; Step 5 adds it.
- Routes under `app/(app)/manejo/`: `page.tsx` (`/manejo`), `[id]/page.tsx`, `avulso/pesagem/[data]/page.tsx`, `avulso/tratamento/[id]/page.tsx`; `/manejo/venda/:id` is a redirect in `next.config.ts`. So only `/manejo/<one segment other than "avulso">` is a runner.
- `AppShell` renders its children only after `loaded` (the server render is the loading overlay), so the cached runner document holds no session data. Its flight data does carry `params.id` of the session it was rendered for, hence Step 1.
- Next's `fetchServerResponse` (`node_modules/next/dist/client/components/router-reducer/fetch-server-response.js` lines 128–133 and 193–199) falls back to a full document navigation when an RSC fetch throws or answers non-OK. That is why a 503 from the worker on an RSC miss still reaches the document fallback.
- The worker is registered only by production builds (see `ServiceWorker.tsx`), so the spike runs against `next build` + `next start`, not `next dev`.

- [ ] **Step 1: Runner id from the URL**

Replace the whole of `app/(app)/manejo/[id]/page.tsx` with:

```tsx
"use client";

/**
 * Manejo session route: the running curral session (digital chute line),
 * resumable at any time from /manejo or the dashboard, and the session's record
 * once it is closed.
 *
 * The id comes from the address, not from the route params: without signal the
 * service worker answers any /manejo/<id> with the last runner document it
 * kept (the "template"), and that document's flight data carries the params of
 * the session it was rendered for. Only the URL names this session.
 */
import { usePathname } from "next/navigation";
import { ManejoScreen } from "@/components/manejo/manejo-screen";

export default function ManejoSessionPage() {
  const pathname = usePathname();
  const sessionId = decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1));
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      <ManejoScreen sessionId={sessionId} />
    </div>
  );
}
```

- [ ] **Step 2: Write the routing test (fails: no module yet)**

Create `lib/offline/__tests__/swRouting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { route, type SwRoute } from "@/lib/offline/swRouting";

const BASE = "https://meubov.test";

type Row = [
  label: string,
  path: string,
  mode: RequestMode,
  method: string,
  headers: Record<string, string>,
  expected: SwRoute,
];

const bypass: SwRoute = { strategy: "bypass", cacheKey: null, templateKey: null };
const page = (cacheKey: string, templateKey: string | null = null): SwRoute => ({
  strategy: "navigate-network-first",
  cacheKey,
  templateKey,
});
const rsc = (cacheKey: string, templateKey: string | null = null): SwRoute => ({
  strategy: "rsc-network-first",
  cacheKey,
  templateKey,
});

const rows: Row[] = [
  ["a hashed chunk", "/_next/static/chunks/app-1a2b.js", "no-cors", "GET", {}, { strategy: "static-cache-first", cacheKey: null, templateKey: null }],
  ["a self-hosted font", "/_next/static/media/plex.woff2", "cors", "GET", {}, { strategy: "static-cache-first", cacheKey: null, templateKey: null }],
  ["the herd API", "/api/herd", "cors", "GET", {}, bypass],
  ["a pass", "/api/herd/manejo/abc/animals/1/complete", "cors", "POST", {}, bypass],
  ["auth", "/api/auth/get-session", "cors", "GET", {}, bypass],
  ["an optimized image", "/_next/image?url=%2Ffarms%2Fa.jpg&w=640&q=75", "no-cors", "GET", {}, bypass],
  ["a form post navigation", "/manejo/abc", "navigate", "POST", {}, bypass],
  ["the Painel", "/dashboard", "navigate", "GET", {}, page("/dashboard")],
  ["the Manejo list", "/manejo", "navigate", "GET", {}, page("/manejo")],
  ["a runner", "/manejo/7f3c2a90-1b2c-4d5e-8f90-123456789abc", "navigate", "GET", {}, page("/manejo/7f3c2a90-1b2c-4d5e-8f90-123456789abc", "doc:/manejo/[id]")],
  ["a runner with a query", "/manejo/abc?aba=pendentes", "navigate", "GET", {}, page("/manejo/abc", "doc:/manejo/[id]")],
  ["the avulso folder", "/manejo/avulso", "navigate", "GET", {}, page("/manejo/avulso")],
  ["a pesagem avulsa", "/manejo/avulso/pesagem/2026-09-01", "navigate", "GET", {}, page("/manejo/avulso/pesagem/2026-09-01")],
  ["a tratamento avulso", "/manejo/avulso/tratamento/abc", "navigate", "GET", {}, page("/manejo/avulso/tratamento/abc")],
  ["the old venda address", "/manejo/venda/abc", "navigate", "GET", {}, page("/manejo/venda/abc")],
  ["the offline page", "/offline", "navigate", "GET", {}, page("/offline")],
  ["a runner's RSC by header", "/manejo/abc", "cors", "GET", { rsc: "1" }, rsc("rsc:/manejo/abc", "rsc:/manejo/[id]")],
  ["a runner's RSC by query", "/manejo/abc?_rsc=1x2y3", "cors", "GET", {}, rsc("rsc:/manejo/abc", "rsc:/manejo/[id]")],
  ["the list's RSC", "/manejo?_rsc=9z", "cors", "GET", { rsc: "1" }, rsc("rsc:/manejo")],
  ["a prefetch", "/manejo/abc?_rsc=1x2y3", "cors", "GET", { rsc: "1", "next-router-prefetch": "1" }, bypass],
  ["a segment prefetch", "/manejo/abc?_rsc=1x2y3", "cors", "GET", { rsc: "1", "next-router-segment-prefetch": "/_tree" }, bypass],
  ["a public illustration", "/illustrations/sem-sinal.svg", "no-cors", "GET", {}, bypass],
  ["the manifest", "/manifest.webmanifest", "cors", "GET", {}, bypass],
];

describe("route", () => {
  it.each(rows)("%s", (_label, path, mode, method, headers, expected) => {
    expect(route(new URL(path, BASE), mode, method, new Headers(headers))).toEqual(expected);
  });

  it("reads no headers when none are given", () => {
    expect(route(new URL("/manejo/abc?_rsc=1", BASE), "cors", "GET")).toEqual(
      rsc("rsc:/manejo/abc", "rsc:/manejo/[id]")
    );
  });
});
```

Run: `pnpm exec vitest run lib/offline/__tests__/swRouting.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `Failed to resolve import "@/lib/offline/swRouting"`.

- [ ] **Step 3: The pure routing function**

Create `lib/offline/swRouting.ts`:

```ts
/**
 * The offline shell's routing, as a pure function: which strategy the service
 * worker uses for a request and under which cache keys it keeps the answer.
 *
 * public/sw.js carries an inline copy of this logic (a worker served from
 * /public cannot import app modules); this file is its tested twin. Change
 * both together. Nothing imports it at runtime.
 */
export type SwStrategy = "static-cache-first" | "navigate-network-first" | "rsc-network-first" | "bypass";

export interface SwRoute {
  strategy: SwStrategy;
  /** Where a good answer is kept: the page's path (documents) or `rsc:<path>`. */
  cacheKey: string | null;
  /** The runner template this answer also refreshes, for a /manejo/<id> page. */
  templateKey: string | null;
}

/** The part of `Headers` the routing reads. */
export interface HeaderReader {
  get(name: string): string | null;
}

const BYPASS: SwRoute = { strategy: "bypass", cacheKey: null, templateKey: null };

/** A session's runner page: /manejo/<id> — not the list, not /manejo/avulso/…. */
const RUNNER_PATH = /^\/manejo\/(?!avulso$)[^/]+$/;

export function route(
  url: URL,
  mode: RequestMode | "navigate",
  method: string,
  headers?: HeaderReader
): SwRoute {
  const path = url.pathname;
  if (method !== "GET") return BYPASS;
  if (path.startsWith("/_next/static/")) {
    return { strategy: "static-cache-first", cacheKey: null, templateKey: null };
  }
  if (path.startsWith("/api/") || path.startsWith("/_next/")) return BYPASS;

  const runner = RUNNER_PATH.test(path);
  if (mode === "navigate") {
    return {
      strategy: "navigate-network-first",
      cacheKey: path,
      templateKey: runner ? "doc:/manejo/[id]" : null,
    };
  }

  const rsc = headers?.get("rsc") === "1" || url.searchParams.has("_rsc");
  // A prefetch is a partial payload: keeping it would answer a navigation with half a page.
  const prefetch =
    headers?.get("next-router-prefetch") != null || headers?.get("next-router-segment-prefetch") != null;
  if (rsc && !prefetch) {
    return {
      strategy: "rsc-network-first",
      cacheKey: `rsc:${path}`,
      templateKey: runner ? "rsc:/manejo/[id]" : null,
    };
  }
  return BYPASS;
}
```

Run: `pnpm exec vitest run lib/offline/__tests__/swRouting.test.ts --exclude '**/worktrees/**'`
Expected: `Tests  24 passed (24)`.

- [ ] **Step 4: The worker**

Create `public/sw.js`. `route()` is a line-for-line copy of `swRouting.ts` without the types:

```js
/*
 * MeuBov offline shell: a plain service worker served as is from /public (no
 * build step, no imports). Registered by components/layout/ServiceWorker.tsx.
 *
 * route() below is an inline copy of lib/offline/swRouting.ts, its tested
 * twin. Change both together.
 *
 * - /_next/static/*: cache-first. The file names carry a content hash.
 * - Page documents and RSC fetches: network first with a 3 s timeout. A good
 *   answer is kept under its path and, for a /manejo/<id> page, also as the
 *   runner "template", which serves any session because the runner reads its
 *   id from the URL. Without signal: the same path, then the template, then
 *   /offline (documents) or a 503 (RSC; Next then retries as a document
 *   navigation, which lands on the document fallback).
 * - /api/*, /_next/image, prefetches, non-GET and every other file: not
 *   touched and never cached.
 */
const VERSION = "v1";
const SHELL_CACHE = `meubov-shell-${VERSION}`;
// ponytail: static grows by one set of chunks per deploy until VERSION changes; prune by age if phones fill up.
const STATIC_CACHE = `meubov-static-${VERSION}`;
const OFFLINE_PAGE = "/offline";
const NETWORK_TIMEOUT_MS = 3000;

const BYPASS = { strategy: "bypass", cacheKey: null, templateKey: null };

/** A session's runner page: /manejo/<id>, not the list, not /manejo/avulso/…. */
const RUNNER_PATH = /^\/manejo\/(?!avulso$)[^/]+$/;

function route(url, mode, method, headers) {
  const path = url.pathname;
  if (method !== "GET") return BYPASS;
  if (path.startsWith("/_next/static/")) {
    return { strategy: "static-cache-first", cacheKey: null, templateKey: null };
  }
  if (path.startsWith("/api/") || path.startsWith("/_next/")) return BYPASS;

  const runner = RUNNER_PATH.test(path);
  if (mode === "navigate") {
    return {
      strategy: "navigate-network-first",
      cacheKey: path,
      templateKey: runner ? "doc:/manejo/[id]" : null,
    };
  }

  const rsc = headers?.get("rsc") === "1" || url.searchParams.has("_rsc");
  // A prefetch is a partial payload: keeping it would answer a navigation with half a page.
  const prefetch =
    headers?.get("next-router-prefetch") != null || headers?.get("next-router-segment-prefetch") != null;
  if (rsc && !prefetch) {
    return {
      strategy: "rsc-network-first",
      cacheKey: `rsc:${path}`,
      templateKey: runner ? "rsc:/manejo/[id]" : null,
    };
  }
  return BYPASS;
}

/** Cache keys are names ("/manejo", "doc:/manejo/[id]"); the Cache API wants a same-origin URL. */
function keyUrl(key) {
  return new URL(`/__sw/${encodeURIComponent(key)}`, self.location.origin).href;
}

async function remember(cache, r, response) {
  const copy = r.templateKey ? response.clone() : null;
  await cache.put(keyUrl(r.cacheKey), response);
  if (copy) await cache.put(keyUrl(r.templateKey), copy);
}

async function recall(cache, key) {
  return key ? cache.match(keyUrl(key), { ignoreVary: true }) : undefined;
}

function isOwnStatic(value) {
  if (typeof value !== "string") return false;
  const url = new URL(value, self.location.origin);
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

async function warmStatic(urls) {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    urls.map(async (url) => {
      try {
        if (!(await cache.match(url))) await cache.add(url);
      } catch {
        // Best effort: the file is cached the next time a page asks for it.
      }
    })
  );
}

/** Keeps the document of a page the user reached by a link, so a reload without signal still opens it. */
async function warmDocument(path) {
  try {
    const url = new URL(path, self.location.origin);
    const r = route(url, "navigate", "GET", new Headers());
    if (r.strategy !== "navigate-network-first") return;
    const response = await fetch(url, { credentials: "same-origin" });
    if (response.ok && !response.redirected) await remember(await caches.open(SHELL_CACHE), r, response);
  } catch {
    // Best effort: the next visit tries again.
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function networkFirst(event, r, isDocument) {
  const cache = await caches.open(SHELL_CACHE);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(event.request, { signal: controller.signal });
    if (response.ok && response.type === "basic" && !response.redirected) {
      event.waitUntil(remember(cache, r, response.clone()).catch(() => {}));
      const path = new URL(event.request.url).pathname;
      if (!isDocument && RUNNER_PATH.test(path)) event.waitUntil(warmDocument(path));
    }
    return response;
  } catch {
    const hit = (await recall(cache, r.cacheKey)) ?? (await recall(cache, r.templateKey));
    if (hit) return hit;
    if (isDocument) {
      const offline = await recall(cache, OFFLINE_PAGE);
      if (offline) return offline;
    }
    return new Response(null, { status: 503, statusText: "Offline" });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(OFFLINE_PAGE, { credentials: "same-origin" });
      if (!response.ok || response.redirected) throw new Error(`${OFFLINE_PAGE} answered ${response.status}`);
      const html = await response.clone().text();
      await (await caches.open(SHELL_CACHE)).put(keyUrl(OFFLINE_PAGE), response);
      // Its stylesheet and scripts, so the page draws without signal.
      await warmStatic([...new Set(html.match(/\/_next\/static\/[^"'\s\\)&]+/g) ?? [])]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, STATIC_CACHE];
      for (const name of await caches.keys()) {
        if (name.startsWith("meubov-") && !keep.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

// The page that registered the worker loaded before the worker could see it:
// it sends its chunk URLs and its path here so they are kept too.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "warm") return;
  const jobs = [warmStatic((Array.isArray(data.urls) ? data.urls : []).filter(isOwnStatic))];
  if (typeof data.page === "string" && data.page.startsWith("/")) jobs.push(warmDocument(data.page));
  event.waitUntil(Promise.all(jobs));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const r = route(url, request.mode, request.method, request.headers);
  if (r.strategy === "static-cache-first") event.respondWith(cacheFirst(request));
  else if (r.strategy === "navigate-network-first") event.respondWith(networkFirst(event, r, true));
  else if (r.strategy === "rsc-network-first") event.respondWith(networkFirst(event, r, false));
});
```

Run: `node --check public/sw.js` → no output, exit 0.

- [ ] **Step 5: Registration, the /offline page, headers, the proxy**

Create `components/layout/ServiceWorker.tsx`:

```tsx
"use client";

/**
 * Registers the offline shell (public/sw.js) once the app has loaded, then
 * hands the worker what this page loaded before the worker could see it (its
 * chunks and its own document), so the shell opens without signal from the
 * first visit on.
 *
 * Only a production build registers it: `next dev` serves chunks under URLs
 * that keep their name while their code changes, and a cache-first worker
 * would keep running old code. In dev, a worker left on the same origin by a
 * production run is removed instead.
 */
import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    if (process.env.NODE_ENV !== "production") {
      void container
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {});
      return;
    }
    container
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => container.ready)
      .then((registration) => {
        const urls = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => new URL(url).pathname.startsWith("/_next/static/"));
        registration.active?.postMessage({ type: "warm", urls, page: window.location.pathname });
      })
      .catch(() => {
        // No worker (private window, storage blocked): the app works online as before.
      });
  }, []);

  return null;
}
```

Registering only in production is deliberate: in `next dev`, Turbopack serves chunks under stable URLs whose code changes on every edit, and the cache-first strategy would keep the old code. The dev branch unregisters instead, so a browser that ran `next start` on the same port is not left stuck. Every failure is swallowed because without a worker the app still works online, as it does today.

Modify `components/layout/AppShell.tsx`. Old line 6:

```tsx
import { MobileTabBar } from "@/components/layout/MobileTabBar";
```

New lines 6–7:

```tsx
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { ServiceWorker } from "@/components/layout/ServiceWorker";
```

Old line 72 (73 after the import):

```tsx
      <PrintRoot />
```

New:

```tsx
      <PrintRoot />
      <ServiceWorker />
```

Create `app/offline/page.tsx`. It uses no illustration: a `/illustrations/*.svg` is outside `/_next/static` and would not be there without signal.

```tsx
/**
 * What the service worker shows for a page it never kept, without signal.
 * Outside the (app) group: it needs no session, and the proxy lets it through
 * signed out so the worker can keep a copy when it installs.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { BrandBar } from "@/components/errors/BrandBar";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Sem conexão · MeuBov" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas px-4 py-5 md:px-20 md:py-10">
      <BrandBar />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
        <WifiOff aria-hidden className="size-10 text-ink-soft" />
        <h1 className="max-w-sm font-heading text-2xl leading-tight font-semibold text-ink">
          Sem conexão. Abra Manejo para continuar um brete.
        </h1>
        <Button asChild className="h-12 px-4 text-sm sm:h-10">
          <Link href="/manejo">Ir para Manejo</Link>
        </Button>
      </div>
    </main>
  );
}
```

Replace the whole of `next.config.ts` (adds `headers()`; `output` and `redirects()` unchanged):

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      // The offline shell's worker: always fetched fresh, so a deploy reaches the phones.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // The Coberturas screen was renamed Reprodução; old bookmarks still land.
      {
        source: "/nascimentos/coberturas",
        destination: "/reproducao",
        permanent: true,
      },
      // Reprodução left Nascimentos for a sidebar tab of its own.
      {
        source: "/nascimentos/reproducao/:path*",
        destination: "/reproducao/:path*",
        permanent: true,
      },
      // A venda's record moved to its session's own page with every other manejo.
      {
        source: "/manejo/venda/:id",
        destination: "/manejo/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
```

Modify `proxy.ts`. Old line 17:

```ts
 * - No session cookie + not on "/"     -> "/" (landing opens the auth modal).
```

New:

```ts
 * - No session cookie + not public     -> "/" (landing opens the auth modal).
```

Old lines 21–25:

```ts
 * "/" is the public landing page and the only public route: login/signup live
 * in its AuthDialog modal. The legacy /login and /signup URLs are kept as
 * redirects so old bookmarks don't 404.
 */
const LEGACY_AUTH_PATHS = new Set(["/login", "/signup"]);
```

New:

```ts
 * "/" is the public landing page: login/signup live in its AuthDialog modal.
 * "/offline" is public too: the service worker keeps a copy of it when it
 * installs, and a redirect would have it keep the landing page instead. The
 * legacy /login and /signup URLs are kept as redirects so old bookmarks don't
 * 404. Paths with a dot (/sw.js, /manifest.webmanifest, /icons/*.png) never
 * reach the proxy: the matcher below skips them.
 */
const LEGACY_AUTH_PATHS = new Set(["/login", "/signup"]);
const PUBLIC_PATHS = new Set(["/", "/offline"]);
```

Old line 35:

```ts
  if (!hasSession && pathname !== "/") {
```

New:

```ts
  if (!hasSession && !PUBLIC_PATHS.has(pathname)) {
```

- [ ] **Step 6: Static checks**

Run: `pnpm tsc --noEmit`
Expected: no output, exit 0.

Run: `pnpm exec eslint "app/(app)/manejo/[id]/page.tsx" lib/offline/swRouting.ts lib/offline/__tests__/swRouting.test.ts public/sw.js components/layout/ServiceWorker.tsx components/layout/AppShell.tsx app/offline/page.tsx next.config.ts proxy.ts`
Expected: no output, exit 0.

Run: `pnpm exec vitest run lib/offline/__tests__/swRouting.test.ts --exclude '**/worktrees/**'`
Expected: `Tests  24 passed (24)`.

- [ ] **Step 7: THE SPIKE — the runner template opens a session never opened online**

The whole offline design rests on this: a phone offline must open `/manejo/<B>` from the document kept for `/manejo/<A>`. **If check 1 fails, STOP the plan here and report the output to the user; do not start any other task.** Check 2 (a link click, the RSC path) has a remedy decided in advance, described after the expected output.

Before starting, see what is running (`docker ps --format '{{.Names}} {{.Ports}}'` and `ss -ltnp`); ports 5446 and 3016 must be free, otherwise pick the next free pair and change them everywhere below.

1. Throwaway database, migrated from zero:

```bash
docker run --rm -d --name meubov-offline-db -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov -p 127.0.0.1:5446:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
docker exec meubov-offline-db pg_isready -U meubov   # repeat until: accepting connections
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5446/meubov pnpm db:migrate
```

2. Production build and server (the worker registers only in production). Start the server as a background command:

```bash
pnpm build
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5446/meubov BETTER_AUTH_URL=http://localhost:3016 pnpm exec next start -p 3016
```

Check: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3016/api/auth/ok` → `200`.

3. Headers and the public `/offline`:

```bash
curl -sI http://localhost:3016/sw.js | grep -iE '^(content-type|cache-control)'
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3016/offline
```

Expected:

```
Content-Type: application/javascript; charset=utf-8
Cache-Control: no-cache, no-store, must-revalidate
200 
```

4. A throwaway user with a seeded farm:

```bash
curl -s -X POST http://localhost:3016/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:3016' -d '{"name":"Teste Offline","email":"teste.offline@meubov.local","password":"OfflineBrete2026!"}'
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5446/meubov pnpm db:seed --email teste.offline@meubov.local
```

(A 200 on sign-up proves nothing; the spike's own sign-in is the check.)

5. Write `<scratchpad>/spike-offline-template.mjs`:

```js
// Spike for the brete offline plan: does the runner "template" document open a
// session that was never opened online? Needs a production server (next start)
// and a seeded teste.* user. Usage:
//   BASE=http://localhost:3016 EMAIL=teste.offline@meubov.local PASSWORD='OfflineBrete2026!' \
//     node spike-offline-template.mjs
// Exit 0 when check 1 passes (the plan's gate); check 2 is reported for the RSC path.
import { createRequire } from "node:module";
import { homedir } from "node:os";

const require = createRequire("/home/luketa/.npm/_npx/705bc6b22212b352/node_modules/");
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3016";
const { EMAIL, PASSWORD } = process.env;
const SHELL_CACHE = "meubov-shell-v1";

const browser = await chromium.launch({
  executablePath: `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
});
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 } });
async function fail(message) {
  console.log(`SPIKE FAIL: ${message}`);
  await browser.close();
  process.exit(1);
}

// 1. Sign in and open two sessions with names that tell them apart.
const signIn = await context.request.post("/api/auth/sign-in/email", {
  data: { email: EMAIL, password: PASSWORD },
  headers: { origin: BASE },
});
if (!signIn.ok()) await fail(`sign-in answered ${signIn.status()}`);
const herd = await (await context.request.get("/api/herd")).json();
const busy = new Set(
  herd.manejoSessions.filter((s) => s.status === "open").flatMap((s) => s.animals.map((a) => a.earTag))
);
const tags = herd.animals.filter((a) => a.active && !busy.has(a.earTag)).map((a) => a.earTag);
if (tags.length < 2) await fail("the farm needs two active animals outside open sessions");
const stamp = Date.now();
const nameA = `Spike A ${stamp}`;
const nameB = `Spike B ${stamp}`;
const today = new Date().toISOString().slice(0, 10);
for (const [name, tag] of [
  [nameA, tags[0]],
  [nameB, tags[1]],
]) {
  const res = await context.request.post("/api/herd/manejo", {
    data: {
      date: today,
      kind: "health",
      earTags: [tag],
      weighing: false,
      treatment: { type: "vaccine", name, withdrawalDays: 0 },
    },
  });
  if (!res.ok()) await fail(`starting ${name} answered ${res.status()} ${await res.text()}`);
}
const sessions = (await (await context.request.get("/api/herd")).json()).manejoSessions;
const A = sessions.find((s) => s.name === nameA)?.id;
const B = sessions.find((s) => s.name === nameB)?.id;
if (!A || !B) await fail("the new sessions are not in GET /api/herd");
console.log(`sessions: A=${A} B=${B}`);

// 2. Online: /manejo installs the worker; A is reached by a link, as a user
//    would, so the worker keeps its RSC payload and warms its document.
const page = await context.newPage();
const recorded = new Map();
page.on("response", async (res) => {
  const url = new URL(res.url());
  if (!url.pathname.startsWith("/api/") || res.request().method() !== "GET" || !res.ok()) return;
  try {
    recorded.set(url.pathname, { body: await res.body(), contentType: res.headers()["content-type"] });
  } catch {
    // A body the page already dropped; the next load records it again.
  }
});
await page.goto("/manejo");
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
console.log("worker: controlling");
await page.locator(`a[href="/manejo/${A}"]`).first().click();
await page.locator("main h1", { hasText: nameA }).waitFor({ timeout: 20000 });
const cached = (key) =>
  page.waitForFunction(
    async ({ cacheName, url }) => Boolean(await (await caches.open(cacheName)).match(url, { ignoreVary: true })),
    { cacheName: SHELL_CACHE, url: `/__sw/${encodeURIComponent(key)}` },
    { timeout: 20000 }
  ).then(() => "yes", () => "no");
const docTemplate = await cached("doc:/manejo/[id]");
const rscTemplate = await cached("rsc:/manejo/[id]");
const listDoc = await cached("/manejo");
console.log(`template cached: doc ${docTemplate}, rsc ${rscTemplate}; /manejo document ${listDoc}`);
if (docTemplate !== "yes") await fail("the runner document template was never cached");

// 3. Offline. The farm data comes from what the API answered online (booting
//    from the snapshot is Task 4's); pages come only from the worker.
let stubbed = 0;
await context.route("**/api/**", async (route) => {
  const hit = recorded.get(new URL(route.request().url()).pathname);
  if (route.request().method() === "GET" && hit) {
    stubbed += 1;
    return route.fulfill({ status: 200, body: hit.body, contentType: hit.contentType });
  }
  return route.abort("internetdisconnected");
});
await context.setOffline(true);

async function heading() {
  return (await page.locator("main h1").first().textContent({ timeout: 5000 }).catch(() => null))?.trim();
}

// Check 1: a hard navigation to B, never opened online.
await page.goto(`/manejo/${B}`).catch((error) => console.log(`goto: ${error.message.split("\n")[0]}`));
const check1 = await page
  .locator("main h1", { hasText: nameB })
  .waitFor({ timeout: 15000 })
  .then(() => true, () => false);
console.log(
  `check 1 (reload-style navigation offline to B): ${check1 ? "PASS" : "FAIL"} h1="${await heading()}" url=${new URL(page.url()).pathname} api stubs used=${stubbed}`
);

// Check 2: from the Manejo list, a link to B (client navigation, RSC path).
await page.goto("/manejo").catch(() => {});
const link = page.locator(`a[href="/manejo/${B}"]`).first();
let check2 = false;
if (await link.isVisible({ timeout: 10000 }).catch(() => false)) {
  await link.click();
  check2 = await page
    .locator("main h1", { hasText: nameB })
    .waitFor({ timeout: 15000 })
    .then(() => true, () => false);
}
console.log(
  `check 2 (link from /manejo offline to B): ${check2 ? "PASS" : "FAIL"} h1="${await heading()}" url=${new URL(page.url()).pathname}`
);

await context.setOffline(false);
await browser.close();
if (!check1) {
  console.log("SPIKE FAIL: the template does not serve another session. STOP the plan and report.");
  process.exit(1);
}
console.log(check2 ? "SPIKE PASS" : "SPIKE PASS (check 1 only; apply the check-2 remedy in the plan)");
```

6. Run it:

```bash
BASE=http://localhost:3016 EMAIL=teste.offline@meubov.local PASSWORD='OfflineBrete2026!' node <scratchpad>/spike-offline-template.mjs
```

Expected (uuids and stamps vary):

```
sessions: A=<uuid> B=<uuid>
worker: controlling
template cached: doc yes, rsc yes; /manejo document yes
check 1 (reload-style navigation offline to B): PASS h1="Spike B 1790…" url=/manejo/<B> api stubs used=<3 or more>
check 2 (link from /manejo offline to B): PASS h1="Spike B 1790…" url=/manejo/<B>
SPIKE PASS
```

How to read a failure:
- `api stubs used=0` and an h1 of "Não deu para falar com a fazenda": Playwright's stub did not answer `/api/*`, and the page fell to the load-failure screen. That is the harness, not the template. Check that `sw.js` does not call `respondWith` for `/api/` (it returns early with `bypass`) and run again.
- `h1="Spike A …"`: the page took the id from the template's params. Step 1 is missing or another component reads `useParams`.
- `h1="Sem conexão. Abra Manejo…"`: no template was found. Check the `template cached` line.
- Check 1 FAIL for any other reason: **STOP and report** (paste the output).
- Check 2 FAIL with check 1 PASS: the cached RSC payload does not fit another session. Remedy, applied here and the spike rerun: in both `lib/offline/swRouting.ts` and `public/sw.js`, change the RSC branch to `templateKey: null`, and in the test change the two expectations `rsc("rsc:/manejo/abc", "rsc:/manejo/[id]")` to `rsc("rsc:/manejo/abc")`. A runner's RSC miss then answers 503, Next falls back to a document navigation, and that lands on the document template that check 1 proved. Document warming does not depend on the RSC template (`sw.js` tests `RUNNER_PATH` directly), and the `rsc yes` in the `template cached` line becomes `rsc no`.

7. Tear down: stop the `next start` process by its pid (from `ss -ltnp | grep 3016`, never `pkill -f` with the command text), then `docker rm -f meubov-offline-db`.

Note on `proxy.ts`: the contract's file ownership does not list it for T1, but without the change the worker's install-time copy of `/offline` would be the landing page for anyone without a cookie. It is a two-line change that no other task touches.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/manejo/[id]/page.tsx" lib/offline/swRouting.ts lib/offline/__tests__/swRouting.test.ts public/sw.js components/layout/ServiceWorker.tsx components/layout/AppShell.tsx app/offline/page.tsx next.config.ts proxy.ts
git commit -m "feat(offline): service worker shell with a runner template, /offline and registration" -- "app/(app)/manejo/[id]/page.tsx" lib/offline/swRouting.ts lib/offline/__tests__/swRouting.test.ts public/sw.js components/layout/ServiceWorker.tsx components/layout/AppShell.tsx app/offline/page.tsx next.config.ts proxy.ts
```

Expected: `9 files changed`. The message has no trailers.

---

### Task 2: Install — manifest, icons, InstallCard

**Files:**
- Create: `app/manifest.ts`
- Create: `cli/renderIcons.mjs`
- Create (generated by the script, committed): `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`
- Create: `lib/offline/install.ts`
- Test: `lib/offline/__tests__/install.test.ts`
- Create: `components/offline/InstallCard.tsx`
- Modify: `app/(app)/dashboard/page.tsx` (import after line 40 `import { FirstStepsBanner } …`; the card after line 179 `<FirstStepsBanner />`)

**Interfaces:**
- Consumes: `daysBetween(aIso, bIso)` and `todayISO()` from `lib/domain/dates.ts`; `Button` from `components/ui/button.tsx`. Nothing from other tasks. Task 1's worker leaves `/manifest.webmanifest` and `/icons/*` alone (`bypass`), and the proxy's matcher skips them (they contain a dot).
- Produces (the contract's T10 section binds `shouldOfferInstall`; `detectPlatform` returns the other half of its argument):
  ```ts
  export type InstallPlatform = "android" | "ios" | "other";
  export interface InstallDevice { platform: InstallPlatform; installed: boolean }
  export type InstallOffer = "prompt" | "ios-hint";
  export const INSTALL_SNOOZE_DAYS = 30;
  export function detectPlatform(ua: string, standalone: boolean): InstallDevice;
  export function shouldOfferInstall(input: InstallDevice & { dismissedAt: string | null; today: string }): InstallOffer | null;
  // components/offline/InstallCard.tsx
  export function InstallCard(): JSX.Element | null;   // localStorage key "meubov.installDismissedAt" = ISO date of "Agora não"
  ```
  - `/manifest.webmanifest` (Next adds the `<link rel="manifest">` by itself) and the three PNGs under `/icons/`.

- [ ] **Step 1: The manifest**

Create `app/manifest.ts` (per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`; `lang` and `purpose` are fields of `MetadataRoute.Manifest`):

```ts
import type { MetadataRoute } from "next";

/**
 * The web app manifest (/manifest.webmanifest): what a phone needs to install
 * MeuBov on its home screen. The icons are drawn by cli/renderIcons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MeuBov",
    short_name: "MeuBov",
    description: "Gestão de rebanho bovino de corte, também no curral sem sinal.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#3e7150",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 2: The icon renderer**

Create `cli/renderIcons.mjs`. It draws from `app/icon.svg`, which already is `NELORE_PATH` (the same path as `components/ui/nelore-mark.tsx`) with the head filled `#f4f1ea` and the brand ear tag. Drawing from that file keeps one source for the favicon and the install icons.

```js
// Renders the install icons (public/icons/*.png, listed in app/manifest.ts)
// from the app icon, app/icon.svg: the brand Nelore and its ear tag. Run once
// with `node cli/renderIcons.mjs` after the mark changes; the PNGs are
// committed. It draws with the Playwright chromium already on this machine,
// so the repo needs no image library.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/luketa/.npm/_npx/705bc6b22212b352/node_modules/");
const { chromium } = require("playwright");

const OUT = new URL("../public/icons/", import.meta.url);
const svg = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

// "any" icons are a rounded tile with transparent corners. The maskable one is
// a full-bleed tile with the mark inside the centre 60 % (20 % padding each
// side), which every launcher mask leaves visible.
const ICONS = [
  { file: "icon-192.png", size: 192, radius: "22%", art: 0.8 },
  { file: "icon-512.png", size: 512, radius: "22%", art: 0.8 },
  { file: "maskable-512.png", size: 512, radius: "0", art: 0.6 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
});
const page = await browser.newPage();
for (const { file, size, radius, art } of ICONS) {
  const side = Math.round(size * art);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0">
      <div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:${radius};background:#f4f1ea">
        <img src="${src}" width="${side}" height="${side}" alt="">
      </div>
    </body>`
  );
  await page.locator("img").evaluate((img) => img.decode());
  await page.screenshot({ path: fileURLToPath(new URL(file, OUT)), omitBackground: true });
  console.log(`${file} ${size}x${size}`);
}
await browser.close();
```

Run: `node cli/renderIcons.mjs && file public/icons/*.png`
Expected:

```
icon-192.png 192x192
icon-512.png 512x512
maskable-512.png 512x512
public/icons/icon-192.png:     PNG image data, 192 x 192, 8-bit/color RGBA, non-interlaced
public/icons/icon-512.png:     PNG image data, 512 x 512, 8-bit/color RGBA, non-interlaced
public/icons/maskable-512.png: PNG image data, 512 x 512, 8-bit/color RGB, non-interlaced
```

Open `public/icons/icon-512.png` and `maskable-512.png` with the Read tool. The first should show the Nelore head in ink on a cream tile with rounded, transparent corners and the green tag. The second should show the same art smaller, on a full cream square with a wide margin. The draft of this script was run against `app/icon.svg` in a scratch directory and gave exactly these files.

- [ ] **Step 3: The install rules — test first**

Create `lib/offline/__tests__/install.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectPlatform, shouldOfferInstall } from "@/lib/offline/install";

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

describe("detectPlatform", () => {
  it.each([
    ["Android Chrome", ANDROID_CHROME, "android"],
    ["iPhone Safari", IPHONE_SAFARI, "ios"],
    ["iPhone Chrome", IPHONE_CHROME, "ios"],
    ["desktop Chrome", DESKTOP_CHROME, "other"],
  ] as const)("%s", (_label, ua, platform) => {
    expect(detectPlatform(ua, false)).toEqual({ platform, installed: false });
  });

  it("marks the app opened from the home screen as installed", () => {
    expect(detectPlatform(ANDROID_CHROME, true)).toEqual({ platform: "android", installed: true });
  });
});

describe("shouldOfferInstall", () => {
  const today = "2026-09-25";

  it("offers Chrome's prompt on Android", () => {
    expect(shouldOfferInstall({ platform: "android", installed: false, dismissedAt: null, today })).toBe("prompt");
  });

  it("explains the share sheet on iOS", () => {
    expect(shouldOfferInstall({ platform: "ios", installed: false, dismissedAt: null, today })).toBe("ios-hint");
  });

  it("never offers on the desktop", () => {
    expect(shouldOfferInstall({ platform: "other", installed: false, dismissedAt: null, today })).toBeNull();
  });

  it("never offers once installed", () => {
    expect(shouldOfferInstall({ platform: "android", installed: true, dismissedAt: null, today })).toBeNull();
    expect(shouldOfferInstall({ platform: "ios", installed: true, dismissedAt: null, today })).toBeNull();
  });

  it("keeps quiet for 30 days after Agora não", () => {
    const offer = (dismissedAt: string) =>
      shouldOfferInstall({ platform: "android", installed: false, dismissedAt, today });
    expect(offer("2026-09-25")).toBeNull();
    expect(offer("2026-08-27")).toBeNull(); // 29 days
    expect(offer("2026-08-26")).toBe("prompt"); // 30 days
  });
});
```

Run: `pnpm exec vitest run lib/offline/__tests__/install.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `Failed to resolve import "@/lib/offline/install"`.

- [ ] **Step 4: The install rules**

Create `lib/offline/install.ts`:

```ts
/**
 * When the Painel invites the user to install MeuBov on the phone. Android
 * (Chrome) has its own install prompt; iOS has none, so the card only says
 * where Safari keeps it. The desktop never sees the card, an installed app
 * never again, and "Agora não" hides it for 30 days.
 */
import { daysBetween } from "@/lib/domain/dates";

export type InstallPlatform = "android" | "ios" | "other";

export interface InstallDevice {
  platform: InstallPlatform;
  /** Opened from the home screen (display-mode standalone, or iOS `navigator.standalone`). */
  installed: boolean;
}

export type InstallOffer = "prompt" | "ios-hint";

/** Days "Agora não" keeps the card away. */
export const INSTALL_SNOOZE_DAYS = 30;

export function detectPlatform(ua: string, standalone: boolean): InstallDevice {
  const platform: InstallPlatform = /iPhone|iPad|iPod/.test(ua)
    ? "ios"
    : /Android/i.test(ua)
      ? "android"
      : "other";
  return { platform, installed: standalone };
}

export function shouldOfferInstall({
  platform,
  installed,
  dismissedAt,
  today,
}: InstallDevice & { dismissedAt: string | null; today: string }): InstallOffer | null {
  if (installed || platform === "other") return null;
  if (dismissedAt !== null && daysBetween(dismissedAt, today) < INSTALL_SNOOZE_DAYS) return null;
  return platform === "android" ? "prompt" : "ios-hint";
}
```

Run: `pnpm exec vitest run lib/offline/__tests__/install.test.ts --exclude '**/worktrees/**'`
Expected: `Tests  10 passed (10)`.

- [ ] **Step 5: The card**

Create `components/offline/InstallCard.tsx`. The copy and layout follow the canvas `Install-Painel`: a panel card, a `Smartphone` icon on `bg-brand-soft`, the title, the sentence, a full-width primary "Instalar" with `Download`, and a full-width ghost "Agora não". On iOS there is no "Instalar", and a line gives the share-sheet path instead.

```tsx
"use client";

/**
 * The Painel's invitation to put MeuBov on the phone's home screen, so it
 * opens straight from there and works at the curral without signal. Android
 * (Chrome) announces its own install prompt with `beforeinstallprompt`; the
 * card keeps it and shows it on "Instalar". iOS has no prompt, so the card
 * says where Safari keeps it. "Agora não" hides it for 30 days; an installed
 * app and the desktop (md and up) never see it.
 *
 * The Painel renders only on the client (AppShell draws its children once the
 * store has loaded), so the first state can read `navigator` directly.
 */
import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/domain/dates";
import { detectPlatform, shouldOfferInstall, type InstallDevice } from "@/lib/offline/install";

const DISMISSED_KEY = "meubov.installDismissedAt";

/** Chrome's install prompt event, missing from the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function currentDevice(): InstallDevice {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return detectPlatform(navigator.userAgent, standalone);
}

function readDismissedAt(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function InstallCard() {
  const [device, setDevice] = useState(currentDevice);
  const [dismissedAt, setDismissedAt] = useState(readDismissedAt);
  // ponytail: a prompt Chrome fires while another page is open is missed; stash it in AppShell if installs lag.
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Keeps Chrome's own mini-infobar away: the card asks instead.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDevice((current) => ({ ...current, installed: true }));
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const offer = shouldOfferInstall({ ...device, dismissedAt, today: todayISO() });
  if (offer === null || (offer === "prompt" && promptEvent === null)) return null;

  async function install() {
    if (promptEvent === null) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // The event serves once; Chrome fires a new one if the app can still be installed.
    setPromptEvent(null);
    if (outcome === "accepted") setDevice((current) => ({ ...current, installed: true }));
  }

  function dismiss() {
    const today = todayISO();
    try {
      window.localStorage.setItem(DISMISSED_KEY, today);
    } catch {
      // Storage blocked: the card stays hidden until the next visit.
    }
    setDismissedAt(today);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-panel p-4 md:hidden">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft"
        >
          <Smartphone className="size-[18px] text-brand" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Instale o MeuBov no celular</p>
          <p className="mt-0.5 text-xs text-pretty text-ink-soft">
            Abre direto da tela inicial e funciona no curral sem sinal: os passes ficam guardados e
            são enviados depois.
          </p>
          {offer === "ios-hint" ? (
            <p className="mt-2 text-xs font-medium text-ink">
              No Safari, toque em Compartilhar → Adicionar à Tela de Início.
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {offer === "prompt" ? (
          <Button type="button" className="min-h-11 w-full" onClick={() => void install()}>
            <Download aria-hidden />
            Instalar
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="min-h-11 w-full" onClick={dismiss}>
          Agora não
        </Button>
      </div>
    </section>
  );
}
```

The lazy `useState` initialisers read `navigator`, `matchMedia` and `localStorage` directly. They never run on the server, because the Painel renders only after `AppShell`'s store load. They also keep clear of `react-hooks/set-state-in-effect`, the rule `components/team/TeamPage.tsx` works around.

- [ ] **Step 6: Mount it on the Painel**

Modify `app/(app)/dashboard/page.tsx`. Old line 40:

```tsx
import { FirstStepsBanner } from "@/components/dashboard/FirstStepsBanner";
```

New lines 40–41:

```tsx
import { FirstStepsBanner } from "@/components/dashboard/FirstStepsBanner";
import { InstallCard } from "@/components/offline/InstallCard";
```

Old line 179 (180 after the import):

```tsx
      <FirstStepsBanner />
```

New:

```tsx
      <FirstStepsBanner />

      <InstallCard />
```

- [ ] **Step 7: Checks**

Run: `pnpm tsc --noEmit`
Expected: no output, exit 0.

Run: `pnpm exec eslint app/manifest.ts cli/renderIcons.mjs lib/offline/install.ts lib/offline/__tests__/install.test.ts components/offline/InstallCard.tsx "app/(app)/dashboard/page.tsx"`
Expected: no output, exit 0.

Run: `pnpm exec vitest run lib/offline/__tests__/install.test.ts --exclude '**/worktrees/**'`
Expected: `Tests  10 passed (10)`.

(The served manifest, its headers and the card on an Android user agent versus the desktop are checked in Task 11's smoke.)

- [ ] **Step 8: Commit**

```bash
git add app/manifest.ts cli/renderIcons.mjs public/icons/icon-192.png public/icons/icon-512.png public/icons/maskable-512.png lib/offline/install.ts lib/offline/__tests__/install.test.ts components/offline/InstallCard.tsx "app/(app)/dashboard/page.tsx"
git commit -m "feat(offline): install MeuBov on the phone from the Painel" -- app/manifest.ts cli/renderIcons.mjs public/icons/icon-192.png public/icons/icon-512.png public/icons/maskable-512.png lib/offline/install.ts lib/offline/__tests__/install.test.ts components/offline/InstallCard.tsx "app/(app)/dashboard/page.tsx"
```

Expected: `9 files changed`. The message has no trailers.

---

### Task 3: Storage — types, IndexedDB wrapper, outbox

**Files:**
- Create: `lib/offline/types.ts`, `lib/offline/db.ts`, `lib/offline/outbox.ts`
- Modify: `lib/types.ts` — `Weighing` (lines 34-42, anchor `  weightKg: number;\n}` at 41-42), `Breeding` (anchor `  semenBullId?: string;\n}` at 51-52), `Treatment` (anchor `  batchId?: string;\n}` at 158-159), `ManejoSessionAnimal` (anchor `  breedingId?: string;\n}` at 211-212), `ManejoSession` (anchor `  valuesHidden?: boolean;\n}` at 275-276)
- Test: `lib/offline/__tests__/db.test.ts`, `lib/offline/__tests__/outbox.test.ts`

**Interfaces:**
- Consumes: `ManejoSessionAnimal` from `lib/types.ts`.
- Produces:
  - `lib/offline/types.ts`: `OutboxKind`, `OutboxState`, `OutboxDetail`, `OutboxOp` (exactly the contract).
  - `lib/types.ts`: `ManejoSessionAnimal.pending?: boolean`, `ManejoSessionAnimal.localOpId?: string`, `Treatment.localOpId?: string`, `Weighing.localOpId?: string`, `Breeding.localOpId?: string`, `ManejoSession.pending?: boolean`.
  - `lib/offline/db.ts`: `interface KeyValueStore<T> { get(key: string): Promise<T | undefined>; put(key: string, value: T): Promise<void>; delete(key: string): Promise<void>; list(): Promise<T[]>; clear(): Promise<void> }`, `type StoreName = "snapshot" | "outbox" | "meta"`, `class NoIndexedDb extends Error`, `openStore<T>(name: StoreName): KeyValueStore<T>`, `memoryStore<T>(): KeyValueStore<T>`.
  - `lib/offline/outbox.ts`: `interface OutboxCounts { queued: number; conflict: number; failed: number }`, `interface Outbox` (contract, plus merge-notes rulings: `list`/`nextSendable`/`counts` take an optional `userId` filter — ruling 7; a close/carcass-yield op is blocked by, and dependent on, any earlier conflito/falha of its session — ruling 1), `createOutbox(store: KeyValueStore<OutboxOp>, meta: KeyValueStore<number>): Outbox`, `dependentOps(ops: OutboxOp[], op: OutboxOp): OutboxOp[]`.

IndexedDB does not exist under vitest (node environment, `vitest.config.ts` sets no environment): `openStore` is exercised only by the Task 11 smoke; every unit test runs over `memoryStore`, which structured-clones on the way in and out like IndexedDB does.

- [ ] **Step 1: Add the client-only markers to `lib/types.ts`**

`Weighing` — old:
```ts
  date: string;
  weightKg: number;
}
```
new:
```ts
  date: string;
  weightKg: number;
  /**
   * Operation of the fila that created this weighing on the phone (its id is
   * then negative). Client-only: never leaves the phone.
   */
  localOpId?: string;
}
```

`Breeding` — old:
```ts
  /** Registered semen bull whose dose this cobertura used; absent for any other bull. */
  semenBullId?: string;
}
```
new:
```ts
  /** Registered semen bull whose dose this cobertura used; absent for any other bull. */
  semenBullId?: string;
  /**
   * Operation of the fila that created this cobertura on the phone (its id is
   * then `local:<uuid>`). Client-only: never leaves the phone.
   */
  localOpId?: string;
}
```

`Treatment` — old:
```ts
  /** Groups the treatments one scheduling action created for several animals. */
  batchId?: string;
}
```
new:
```ts
  /** Groups the treatments one scheduling action created for several animals. */
  batchId?: string;
  /**
   * Operation of the fila that created this treatment on the phone (its id is
   * then `local:<uuid>`). Client-only: never leaves the phone.
   */
  localOpId?: string;
}
```

`ManejoSessionAnimal` — old:
```ts
  /** Id of the cobertura an inseminação pass recorded (for undo and delete). */
  breedingId?: string;
}
```
new:
```ts
  /** Id of the cobertura an inseminação pass recorded (for undo and delete). */
  breedingId?: string;
  /**
   * True while this outcome was applied on the phone and the server has not
   * confirmed it yet. Client-only: never leaves the phone.
   */
  pending?: boolean;
  /** Operation of the fila that produced this outcome. Client-only: never leaves the phone. */
  localOpId?: string;
}
```

`ManejoSession` — old:
```ts
  valuesHidden?: boolean;
}
```
new:
```ts
  valuesHidden?: boolean;
  /**
   * True for a manejo started on the phone without signal that the server has
   * not created yet. Client-only: never leaves the phone.
   */
  pending?: boolean;
}
```

- [ ] **Step 2: Create `lib/offline/types.ts`**

```ts
/**
 * The fila (outbox): operations done on the phone that still have to reach the
 * server, in the order they were done.
 */
import type { ManejoSessionAnimal } from "@/lib/types";

export type OutboxKind =
  | "start"
  | "complete"
  | "skip"
  | "set-aside"
  | "baixa"
  | "reopen"
  | "carcass-yield"
  | "close";

export type OutboxState = "queued" | "sending" | "conflict" | "failed";

/** Why the server refused an operation (a conflito or a falha). */
export interface OutboxDetail {
  error: string;
  message?: string;
  /** The server's entry, when the refusal names one. */
  server?: ManejoSessionAnimal;
  /** The session was closed on the server: "Aplicar o meu" cannot work. */
  sessionClosed?: boolean;
}

export interface OutboxOp {
  /** uuid v4, also the `localOpId` of the records it created on the phone. */
  id: string;
  /** Monotonic per phone, assigned by `enqueue`. */
  seq: number;
  userId: string;
  farmId: number;
  sessionId: string;
  kind: OutboxKind;
  earTag?: string;
  /** Exactly the request body the online action would send (without force). */
  body: Record<string, unknown>;
  /** ISO datetime. */
  createdAt: string;
  state: OutboxState;
  detail?: OutboxDetail;
  attempts: number;
}
```

- [ ] **Step 3: Write the failing `lib/offline/__tests__/db.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { memoryStore } from "@/lib/offline/db";

describe("memoryStore", () => {
  it("puts, gets, lists and deletes by key", async () => {
    const store = memoryStore<{ n: number }>();
    await store.put("a", { n: 1 });
    await store.put("b", { n: 2 });
    await store.put("a", { n: 3 });

    expect(await store.get("a")).toEqual({ n: 3 });
    expect(await store.get("missing")).toBeUndefined();
    expect(await store.list()).toEqual([{ n: 3 }, { n: 2 }]);

    await store.delete("a");
    await store.delete("missing");
    expect(await store.list()).toEqual([{ n: 2 }]);
  });

  it("clears every key", async () => {
    const store = memoryStore<number>();
    await store.put("a", 1);
    await store.put("b", 2);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it("keeps copies, like IndexedDB, so callers cannot mutate what is stored", async () => {
    const store = memoryStore<{ n: number }>();
    const value = { n: 1 };
    await store.put("a", value);
    value.n = 2;
    const read = await store.get("a");
    read!.n = 3;
    expect(await store.get("a")).toEqual({ n: 1 });
  });
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `pnpm vitest run lib/offline/__tests__/db.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `Failed to resolve import "@/lib/offline/db"`.

- [ ] **Step 5: Create `lib/offline/db.ts`**

```ts
/**
 * Key-value storage on the phone: IndexedDB database "meubov" with one object
 * store per name, behind five functions, plus an in-memory twin for tests.
 *
 * Keys are explicit (no keyPath). The connection opens lazily on the first
 * call and is shared; each method runs in its own transaction and resolves
 * when that transaction completes, so a resolved `put` is on disk.
 */
export interface KeyValueStore<T> {
  get(key: string): Promise<T | undefined>;
  put(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<T[]>;
  clear(): Promise<void>;
}

export type StoreName = "snapshot" | "outbox" | "meta";

/** Thrown by every method where IndexedDB does not exist (server render, tests). */
export class NoIndexedDb extends Error {
  constructor() {
    super("IndexedDB is not available");
    this.name = "NoIndexedDb";
  }
}

const DB_NAME = "meubov";
const DB_VERSION = 1;
const STORE_NAMES: StoreName[] = ["snapshot", "outbox", "meta"];

let connection: Promise<IDBDatabase> | null = null;

/** The shared connection; a failed or closed one is reopened on the next call. */
function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new NoIndexedDb());
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          connection = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
    connection.catch(() => {
      connection = null;
    });
  }
  return connection;
}

/** Runs one request in its own transaction and resolves with its result once committed. */
async function run<R>(
  name: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<R>
): Promise<R> {
  const db = await database();
  return new Promise<R>((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const request = action(tx.objectStore(name));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openStore<T>(name: StoreName): KeyValueStore<T> {
  return {
    get: (key) => run(name, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
    put: async (key, value) => {
      await run(name, "readwrite", (s) => s.put(value, key));
    },
    delete: async (key) => {
      await run(name, "readwrite", (s) => s.delete(key));
    },
    list: () => run(name, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
    clear: async () => {
      await run(name, "readwrite", (s) => s.clear());
    },
  };
}

/** In-memory twin of `openStore`: copies values in and out as IndexedDB does. */
export function memoryStore<T>(): KeyValueStore<T> {
  const map = new Map<string, T>();
  return {
    get: async (key) => {
      const value = map.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    put: async (key, value) => {
      map.set(key, structuredClone(value));
    },
    delete: async (key) => {
      map.delete(key);
    },
    list: async () => [...map.values()].map((value) => structuredClone(value)),
    clear: async () => {
      map.clear();
    },
  };
}
```

- [ ] **Step 6: Run it and see it pass**

Run: `pnpm vitest run lib/offline/__tests__/db.test.ts --exclude '**/worktrees/**'`
Expected: `Test Files  1 passed (1)`, `Tests  3 passed (3)`.

- [ ] **Step 7: Write the failing `lib/offline/__tests__/outbox.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { memoryStore } from "@/lib/offline/db";
import { createOutbox, dependentOps, type Outbox } from "@/lib/offline/outbox";
import type { OutboxOp } from "@/lib/offline/types";

type NewOp = Parameters<Outbox["enqueue"]>[0];

let nextId = 0;
const newOp = (overrides: Partial<NewOp> = {}): NewOp => ({
  id: `op-${++nextId}`,
  userId: "user-1",
  farmId: 1,
  sessionId: "s1",
  kind: "complete",
  earTag: "BR-001",
  body: {},
  ...overrides,
});

const setup = () => {
  const store = memoryStore<OutboxOp>();
  const meta = memoryStore<number>();
  return { store, meta, outbox: createOutbox(store, meta) };
};

describe("createOutbox", () => {
  it("enqueues with a monotonic seq, queued state and no attempts", async () => {
    const { outbox } = setup();
    const a = await outbox.enqueue(newOp({ createdAt: "2026-09-25T10:00:00.000Z" }));
    const b = await outbox.enqueue(newOp());

    expect(a).toMatchObject({ seq: 1, state: "queued", attempts: 0, createdAt: "2026-09-25T10:00:00.000Z" });
    expect(b.seq).toBe(2);
    expect(Number.isNaN(Date.parse(b.createdAt))).toBe(false);
  });

  it("keeps seq monotonic across a restart, since meta persists", async () => {
    const { store, meta, outbox } = setup();
    await outbox.enqueue(newOp());
    await outbox.enqueue(newOp());

    const restarted = createOutbox(store, meta);
    expect((await restarted.enqueue(newOp())).seq).toBe(3);
    expect((await restarted.list()).map((op) => op.seq)).toEqual([1, 2, 3]);
  });

  it("gives concurrent enqueues distinct seqs", async () => {
    const { outbox } = setup();
    const ops = await Promise.all([outbox.enqueue(newOp()), outbox.enqueue(newOp()), outbox.enqueue(newOp())]);
    expect(ops.map((op) => op.seq).sort()).toEqual([1, 2, 3]);
  });

  it("lists by seq ascending whatever the storage order", async () => {
    const { store, outbox } = setup();
    const late = { ...newOp(), seq: 5, state: "queued", attempts: 0, createdAt: "2026-09-25T10:05:00.000Z" } as OutboxOp;
    const early = { ...newOp(), seq: 2, state: "queued", attempts: 0, createdAt: "2026-09-25T10:02:00.000Z" } as OutboxOp;
    await store.put(late.id, late);
    await store.put(early.id, early);

    expect((await outbox.list()).map((op) => op.seq)).toEqual([2, 5]);
  });

  it("gets, updates and removes one op", async () => {
    const { outbox } = setup();
    const op = await outbox.enqueue(newOp());

    const updated = await outbox.update(op.id, { state: "failed", detail: { error: "forbidden" } });
    expect(updated).toMatchObject({ id: op.id, seq: 1, state: "failed", detail: { error: "forbidden" } });
    expect(await outbox.get(op.id)).toEqual(updated);
    expect(await outbox.update("missing", { state: "queued" })).toBeUndefined();

    await outbox.remove(op.id);
    expect(await outbox.get(op.id)).toBeUndefined();
  });

  it("nextSendable returns the lowest-seq queued op", async () => {
    const { outbox } = setup();
    const a = await outbox.enqueue(newOp());
    await outbox.enqueue(newOp({ earTag: "BR-002" }));

    expect((await outbox.nextSendable())?.id).toBe(a.id);
    await outbox.update(a.id, { state: "sending" });
    expect((await outbox.nextSendable())?.earTag).toBe("BR-002");
  });

  it("nextSendable skips a pass blocked by an earlier conflict on the same animal, not another animal", async () => {
    const { outbox } = setup();
    const first = await outbox.enqueue(newOp({ earTag: "BR-001" }));
    await outbox.enqueue(newOp({ earTag: "BR-001", kind: "reopen" }));
    const other = await outbox.enqueue(newOp({ earTag: "BR-002" }));

    await outbox.update(first.id, { state: "conflict", detail: { error: "entry_not_actionable" } });

    expect((await outbox.nextSendable())?.id).toBe(other.id);
  });

  it("nextSendable skips every op of a session whose start conflicted or failed", async () => {
    const { outbox } = setup();
    const start = await outbox.enqueue(newOp({ sessionId: "s2", kind: "start", earTag: undefined }));
    await outbox.enqueue(newOp({ sessionId: "s2", earTag: "BR-003" }));
    await outbox.enqueue(newOp({ sessionId: "s2", kind: "close", earTag: undefined }));
    const elsewhere = await outbox.enqueue(newOp({ sessionId: "s1", earTag: "BR-001" }));

    await outbox.update(start.id, { state: "failed", detail: { error: "forbidden" } });
    expect((await outbox.nextSendable())?.id).toBe(elsewhere.id);

    await outbox.update(start.id, { state: "conflict", detail: { error: "id_taken" } });
    expect((await outbox.nextSendable())?.id).toBe(elsewhere.id);

    await outbox.remove(elsewhere.id);
    expect(await outbox.nextSendable()).toBeUndefined();
  });

  it("nextSendable holds a close back behind any earlier conflito of its session", async () => {
    const { outbox } = setup();
    const first = await outbox.enqueue(newOp({ earTag: "BR-001" }));
    const close = await outbox.enqueue(newOp({ kind: "close", earTag: undefined }));

    await outbox.update(first.id, { state: "conflict", detail: { error: "entry_not_actionable" } });
    expect(await outbox.nextSendable()).toBeUndefined();

    await outbox.remove(first.id);
    expect((await outbox.nextSendable())?.id).toBe(close.id);
  });

  it("list, nextSendable and counts see only the given user's ops", async () => {
    const { outbox } = setup();
    const other = await outbox.enqueue(newOp({ userId: "user-2" }));
    const mine = await outbox.enqueue(newOp({ earTag: "BR-002" }));

    expect((await outbox.list("user-1")).map((op) => op.id)).toEqual([mine.id]);
    expect((await outbox.nextSendable("user-1"))?.id).toBe(mine.id);
    expect((await outbox.nextSendable())?.id).toBe(other.id);
    expect(await outbox.counts("user-1")).toEqual({ queued: 1, conflict: 0, failed: 0 });
    expect(await outbox.counts()).toEqual({ queued: 2, conflict: 0, failed: 0 });
  });

  it("counts queued (sending included), conflicts and failures", async () => {
    const { outbox } = setup();
    const a = await outbox.enqueue(newOp());
    const b = await outbox.enqueue(newOp({ earTag: "BR-002" }));
    const c = await outbox.enqueue(newOp({ earTag: "BR-003" }));
    await outbox.enqueue(newOp({ earTag: "BR-004" }));
    await outbox.update(a.id, { state: "sending" });
    await outbox.update(b.id, { state: "conflict" });
    await outbox.update(c.id, { state: "failed" });

    expect(await outbox.counts()).toEqual({ queued: 2, conflict: 1, failed: 1 });
  });

  it("removeSession drops every op of that session only; hasPending sees any state", async () => {
    const { outbox } = setup();
    const a = await outbox.enqueue(newOp({ sessionId: "s1" }));
    await outbox.enqueue(newOp({ sessionId: "s1", earTag: "BR-002" }));
    await outbox.enqueue(newOp({ sessionId: "s2" }));

    await outbox.update(a.id, { state: "failed" });
    expect(await outbox.hasPending("s1")).toBe(true);
    expect(await outbox.hasPending("s3")).toBe(false);

    await outbox.removeSession("s1");
    expect(await outbox.hasPending("s1")).toBe(false);
    expect((await outbox.list()).map((op) => op.sessionId)).toEqual(["s2"]);
  });
});

describe("dependentOps", () => {
  it("returns the later ops of the same session and animal for a pass", async () => {
    const { outbox } = setup();
    await outbox.enqueue(newOp({ earTag: "BR-001", kind: "skip" }));
    const pass = await outbox.enqueue(newOp({ earTag: "BR-001" }));
    await outbox.enqueue(newOp({ earTag: "BR-002" }));
    const reopen = await outbox.enqueue(newOp({ earTag: "BR-001", kind: "reopen" }));
    await outbox.enqueue(newOp({ sessionId: "s2", earTag: "BR-001" }));
    await outbox.enqueue(newOp({ kind: "close", earTag: undefined }));

    const close = (await outbox.list()).at(-1)!;
    expect(dependentOps(await outbox.list(), pass).map((op) => op.id)).toEqual([reopen.id, close.id]);
  });

  it("returns every later op of the session for a start", async () => {
    const { outbox } = setup();
    const start = await outbox.enqueue(newOp({ sessionId: "s2", kind: "start", earTag: undefined }));
    const pass = await outbox.enqueue(newOp({ sessionId: "s2", earTag: "BR-003" }));
    await outbox.enqueue(newOp({ sessionId: "s1", earTag: "BR-001" }));
    const close = await outbox.enqueue(newOp({ sessionId: "s2", kind: "close", earTag: undefined }));

    expect(dependentOps(await outbox.list(), start).map((op) => op.id)).toEqual([pass.id, close.id]);
  });
});
```

- [ ] **Step 8: Run it and see it fail**

Run: `pnpm vitest run lib/offline/__tests__/outbox.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `Failed to resolve import "@/lib/offline/outbox"`.

- [ ] **Step 9: Create `lib/offline/outbox.ts`**

```ts
/**
 * The fila: operations waiting for the server, ordered by `seq`.
 *
 * `seq` is the last value kept under meta key "seq", so it keeps growing after
 * the app restarts. An operation of a session never goes before an earlier one
 * of the same session: `nextSendable` takes the lowest queued seq, and holds
 * back what depends on an earlier conflito or falha (the same animal, or
 * everything after a start that did not go through).
 */
import type { KeyValueStore } from "@/lib/offline/db";
import type { OutboxOp } from "@/lib/offline/types";

export interface OutboxCounts {
  /** Waiting to be sent, including the one being sent. */
  queued: number;
  conflict: number;
  failed: number;
}

export interface Outbox {
  enqueue(
    op: Omit<OutboxOp, "seq" | "state" | "attempts" | "createdAt"> & { createdAt?: string }
  ): Promise<OutboxOp>;
  /** Seq ascending; only `userId`'s ops when given (merge-notes ruling 7). */
  list(userId?: string): Promise<OutboxOp[]>;
  get(id: string): Promise<OutboxOp | undefined>;
  update(id: string, patch: Partial<OutboxOp>): Promise<OutboxOp | undefined>;
  remove(id: string): Promise<void>;
  removeSession(sessionId: string): Promise<void>;
  /** Any op of that session, in any state. */
  hasPending(sessionId: string): Promise<boolean>;
  /** The lowest-seq queued op (of `userId` when given) that no earlier conflito or falha holds back. */
  nextSendable(userId?: string): Promise<OutboxOp | undefined>;
  /** Only `userId`'s ops when given. */
  counts(userId?: string): Promise<OutboxCounts>;
}

const SEQ_KEY = "seq";

/**
 * True when `earlier` holds `op` back: same session, stuck, and a start, the
 * same animal, or `op` has no animal (a close or carcass-yield waits for the
 * whole session).
 */
function blocks(earlier: OutboxOp, op: OutboxOp): boolean {
  return (
    earlier.sessionId === op.sessionId &&
    earlier.seq < op.seq &&
    (earlier.state === "conflict" || earlier.state === "failed") &&
    (earlier.kind === "start" ||
      op.earTag === undefined ||
      (earlier.earTag !== undefined && earlier.earTag === op.earTag))
  );
}

/**
 * Later ops of op's session on the same animal plus the later ops without an
 * animal (close, carcass-yield), or every later op of the session after a start.
 */
export function dependentOps(ops: OutboxOp[], op: OutboxOp): OutboxOp[] {
  return ops.filter(
    (other) =>
      other.sessionId === op.sessionId &&
      other.seq > op.seq &&
      (op.kind === "start" ||
        other.earTag === undefined ||
        (op.earTag !== undefined && other.earTag === op.earTag))
  );
}

export function createOutbox(store: KeyValueStore<OutboxOp>, meta: KeyValueStore<number>): Outbox {
  // Enqueues run one after another so two taps never read the same seq.
  // ponytail: per-tab chain; two tabs enqueuing at once could share a seq — one brete tab is the use.
  let chain: Promise<unknown> = Promise.resolve();

  const list = async (userId?: string) =>
    (await store.list())
      .filter((op) => userId === undefined || op.userId === userId)
      .sort((a, b) => a.seq - b.seq);

  return {
    enqueue(input) {
      const next = chain.then(async () => {
        const seq = ((await meta.get(SEQ_KEY)) ?? 0) + 1;
        await meta.put(SEQ_KEY, seq);
        const op: OutboxOp = {
          ...input,
          createdAt: input.createdAt ?? new Date().toISOString(),
          seq,
          state: "queued",
          attempts: 0,
        };
        await store.put(op.id, op);
        return op;
      });
      chain = next.catch(() => {});
      return next;
    },

    list,

    get: (id) => store.get(id),

    async update(id, patch) {
      const op = await store.get(id);
      if (!op) return undefined;
      const updated = { ...op, ...patch };
      await store.put(id, updated);
      return updated;
    },

    remove: (id) => store.delete(id),

    async removeSession(sessionId) {
      for (const op of await store.list()) {
        if (op.sessionId === sessionId) await store.delete(op.id);
      }
    },

    async hasPending(sessionId) {
      return (await store.list()).some((op) => op.sessionId === sessionId);
    },

    async nextSendable(userId) {
      const ops = await list(userId);
      return ops.find((op) => op.state === "queued" && !ops.some((earlier) => blocks(earlier, op)));
    },

    async counts(userId) {
      const counts: OutboxCounts = { queued: 0, conflict: 0, failed: 0 };
      for (const op of await list(userId)) {
        if (op.state === "queued" || op.state === "sending") counts.queued++;
        else counts[op.state]++;
      }
      return counts;
    },
  };
}
```

- [ ] **Step 10: Run the tests and see them pass**

Run: `pnpm vitest run lib/offline/__tests__/outbox.test.ts lib/offline/__tests__/db.test.ts --exclude '**/worktrees/**'`
Expected: `Test Files  2 passed (2)`, `Tests  17 passed (17)`.

- [ ] **Step 11: Type-check and lint**

Run: `pnpm tsc --noEmit`
Expected: no output, exit 0.

Run: `pnpm exec eslint lib/offline lib/types.ts`
Expected: no output, exit 0.

- [ ] **Step 12: Commit**

```bash
git add lib/offline/types.ts lib/offline/db.ts lib/offline/outbox.ts lib/offline/__tests__/db.test.ts lib/offline/__tests__/outbox.test.ts lib/types.ts
git commit -m "feat(offline): keep a fila of manejo operations on the phone" -- lib/offline/types.ts lib/offline/db.ts lib/offline/outbox.ts lib/offline/__tests__/db.test.ts lib/offline/__tests__/outbox.test.ts lib/types.ts
```

---

### Task 4: Snapshot and offline boot

**Files:**
- Create: `lib/offline/snapshot.ts`
- Modify: `lib/store/useHerdStore.ts` — imports (anchor line 39 `import { clearActiveFarmId, getActiveFarmId, setActiveFarmId } from "@/lib/api/activeFarm";`), state type (anchor lines 233-234 `export interface HerdStore extends HerdData {\n  loaded: boolean;`), `reloadHerd` (lines 486-499, followed by new module helpers), initial state (anchor lines 590-592 `  loaded: false,\n  farms: [],\n  activeFarmId: null,`), `load` (lines 595-617). `lib/repository/ApiHerdRepository.ts`: no change (it throws on every error; a fetch that fails without signal rejects before it).
- Test: `lib/offline/__tests__/snapshot.test.ts`

**Interfaces:**
- Consumes (Task 3): `KeyValueStore<T>`, `openStore<T>(name: StoreName)` from `lib/offline/db.ts`. Existing: `authClient` (`lib/auth/client.ts`), `getActiveFarmId()` (`lib/api/activeFarm.ts`), `HerdData` (`lib/types.ts`), `FarmOption` (the store's `farms` element type — the contract's `FarmSummary`).
- Produces:
  - `lib/offline/snapshot.ts`: `interface Snapshot { data: HerdData; farms: FarmOption[]; activeFarmId: number; savedAt: string }`, `snapshotKey(userId: string, farmId: number): string`, `LAST_USER_KEY = "lastUser"` (meta key holding the last signed-in user id, a string), `saveSnapshot(store: KeyValueStore<Snapshot>, key: string, snap: Snapshot): Promise<void>`, `loadSnapshot(store: KeyValueStore<Snapshot>, key: string): Promise<Snapshot | undefined>`, `clearUserSnapshots(store: KeyValueStore<Snapshot>, userId: string): Promise<void>`.
  - `lib/store/useHerdStore.ts`: `HerdStore.offline: boolean` (default `false`), `HerdStore.snapshotAt: string | null` (default `null`), `export async function persistSnapshot(get: () => HerdStore): Promise<void>` (never throws; Task 9 calls it after every local apply and reconcile).

**How the store knows the user.** The store never knew it: `/farms` does not carry the user id. After a successful online `load` the store asks `authClient.getSession()` once (in the background, never delaying the boot) and writes the id to the `meta` store under `LAST_USER_KEY`; `persistSnapshot` reads it from there. An offline boot has no session to ask, so it opens `snapshotKey(lastUser, getActiveFarmId())` — `load` always pins `meubov.activeFarmId` online, so the pair exists on any phone that loaded once. When the session read fails nothing is saved, so a stale `lastUser` never receives another user's herd. `KeyValueStore.list()` returns values, not keys, so `clearUserSnapshots` deletes `userId:<farmId>` for every farm id that appears in any snapshot — exactly the keys that user can own.

- [ ] **Step 1: Write the failing `lib/offline/__tests__/snapshot.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { memoryStore } from "@/lib/offline/db";
import {
  clearUserSnapshots,
  loadSnapshot,
  saveSnapshot,
  snapshotKey,
  type Snapshot,
} from "@/lib/offline/snapshot";
import type { HerdData } from "@/lib/types";

const herd = (name: string): HerdData => ({
  animals: [],
  treatments: [],
  lots: [],
  invernadas: [],
  lotPlacements: [],
  movements: [],
  breeds: [],
  protocols: [],
  manejoSessions: [],
  expenses: [],
  accounts: [],
  customCategories: [],
  semenBulls: [],
  farm: { name, municipality: "Campo Grande", stateRegistration: "", manager: "" },
});

const snapshot = (farmId: number, name = `Fazenda ${farmId}`): Snapshot => ({
  data: herd(name),
  farms: [],
  activeFarmId: farmId,
  savedAt: "2026-09-24T14:07:00.000Z",
});

describe("snapshot", () => {
  it("keys by user and farm", () => {
    expect(snapshotKey("user-1", 7)).toBe("user-1:7");
  });

  it("round-trips a snapshot and misses an unknown key", async () => {
    const store = memoryStore<Snapshot>();
    await saveSnapshot(store, snapshotKey("user-1", 1), snapshot(1, "Santa Rita"));

    expect(await loadSnapshot(store, snapshotKey("user-1", 1))).toEqual(snapshot(1, "Santa Rita"));
    expect(await loadSnapshot(store, snapshotKey("user-2", 1))).toBeUndefined();
  });

  it("a newer save replaces the older one", async () => {
    const store = memoryStore<Snapshot>();
    await saveSnapshot(store, snapshotKey("user-1", 1), snapshot(1, "Antes"));
    await saveSnapshot(store, snapshotKey("user-1", 1), snapshot(1, "Depois"));

    expect((await loadSnapshot(store, snapshotKey("user-1", 1)))?.data.farm.name).toBe("Depois");
  });

  it("clears every farm of one user and leaves the other users", async () => {
    const store = memoryStore<Snapshot>();
    await saveSnapshot(store, snapshotKey("user-1", 1), snapshot(1));
    await saveSnapshot(store, snapshotKey("user-1", 2), snapshot(2));
    await saveSnapshot(store, snapshotKey("user-2", 1), snapshot(1));
    await saveSnapshot(store, snapshotKey("user-2", 3), snapshot(3));

    await clearUserSnapshots(store, "user-1");

    expect(await loadSnapshot(store, snapshotKey("user-1", 1))).toBeUndefined();
    expect(await loadSnapshot(store, snapshotKey("user-1", 2))).toBeUndefined();
    expect(await loadSnapshot(store, snapshotKey("user-2", 1))).toEqual(snapshot(1));
    expect(await loadSnapshot(store, snapshotKey("user-2", 3))).toEqual(snapshot(3));
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm vitest run lib/offline/__tests__/snapshot.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `Failed to resolve import "@/lib/offline/snapshot"`.

- [ ] **Step 3: Create `lib/offline/snapshot.ts`**

```ts
/**
 * The farm as the phone last saw it: the user's own GET /api/herd payload
 * (money already redacted by the server), the farm list and the active farm,
 * keyed by `userId:farmId` so users never share one. The app boots from it
 * when the API is unreachable.
 */
import type { KeyValueStore } from "@/lib/offline/db";
import type { FarmOption } from "@/lib/store/useHerdStore";
import type { HerdData } from "@/lib/types";

export interface Snapshot {
  data: HerdData;
  farms: FarmOption[];
  activeFarmId: number;
  /** ISO datetime of the data: "Sem conexão · dados de dd/mm às HH:MM". */
  savedAt: string;
}

/** Meta key of the last signed-in user id: an offline boot has no session to ask. */
export const LAST_USER_KEY = "lastUser";

export const snapshotKey = (userId: string, farmId: number) => `${userId}:${farmId}`;

export async function saveSnapshot(
  store: KeyValueStore<Snapshot>,
  key: string,
  snap: Snapshot
): Promise<void> {
  await store.put(key, snap);
}

export async function loadSnapshot(
  store: KeyValueStore<Snapshot>,
  key: string
): Promise<Snapshot | undefined> {
  return store.get(key);
}

/** Deletes every snapshot of one user (sign-out); other users' stay. */
export async function clearUserSnapshots(
  store: KeyValueStore<Snapshot>,
  userId: string
): Promise<void> {
  // The store lists values, not keys: the user's keys are userId:<farm> for
  // any farm some snapshot names, and deleting a missing key is a no-op.
  const farmIds = new Set((await store.list()).map((snap) => snap.activeFarmId));
  for (const farmId of farmIds) await store.delete(snapshotKey(userId, farmId));
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm vitest run lib/offline/__tests__/snapshot.test.ts --exclude '**/worktrees/**'`
Expected: `Test Files  1 passed (1)`, `Tests  4 passed (4)`.

- [ ] **Step 5: Import the snapshot pieces in `lib/store/useHerdStore.ts`**

Old (line 39):
```ts
import { clearActiveFarmId, getActiveFarmId, setActiveFarmId } from "@/lib/api/activeFarm";
```
New:
```ts
import { clearActiveFarmId, getActiveFarmId, setActiveFarmId } from "@/lib/api/activeFarm";
import { authClient } from "@/lib/auth/client";
import { openStore } from "@/lib/offline/db";
import {
  LAST_USER_KEY,
  loadSnapshot,
  saveSnapshot,
  snapshotKey,
  type Snapshot,
} from "@/lib/offline/snapshot";
```

- [ ] **Step 6: Add the `offline` and `snapshotAt` slices to the state type**

Old (lines 233-234):
```ts
export interface HerdStore extends HerdData {
  loaded: boolean;
```
New:
```ts
export interface HerdStore extends HerdData {
  loaded: boolean;
  /** True when the API was unreachable at boot and the store came from the phone's snapshot. */
  offline: boolean;
  /** When that snapshot's data was saved (ISO); null when the store booted online. */
  snapshotAt: string | null;
```

- [ ] **Step 7: Save the snapshot from `reloadHerd` and add the snapshot helpers**

Old (lines 486-499):
```ts
/**
 * Re-fetches the whole herd after a write the server already settled — an
 * import, or a refusal that proves the store's copy stale (a bull's doses).
 * Best-effort: a failed refresh never masks the write's own outcome, and the
 * store refreshes on the next successful load.
 */
async function reloadHerd(set: StoreApi<HerdStore>["setState"]): Promise<void> {
  try {
    const fresh = await repository.load();
    set({ ...fresh, loaded: true });
  } catch {
    // best-effort: keep what the store has
  }
}
```
New:
```ts
/**
 * Re-fetches the whole herd after a write the server already settled — an
 * import, or a refusal that proves the store's copy stale (a bull's doses).
 * Best-effort: a failed refresh never masks the write's own outcome, and the
 * store refreshes on the next successful load. A success means the API is
 * back: the store leaves offline mode and the phone keeps the fresh snapshot.
 */
async function reloadHerd(set: StoreApi<HerdStore>["setState"]): Promise<void> {
  try {
    const fresh = await repository.load();
    set({ ...fresh, loaded: true, offline: false });
  } catch {
    // best-effort: keep what the store has
    return;
  }
  await persistSnapshot(useHerdStore.getState);
}

const snapshotStore = () => openStore<Snapshot>("snapshot");
const metaStore = () => openStore<string>("meta");

/** The herd part of the store, shaped as GET /api/herd returns it. */
function herdDataOf(s: HerdStore): HerdData {
  return {
    animals: s.animals,
    treatments: s.treatments,
    lots: s.lots,
    invernadas: s.invernadas,
    removedInvernadas: s.removedInvernadas,
    lotPlacements: s.lotPlacements,
    movements: s.movements,
    breeds: s.breeds,
    protocols: s.protocols,
    manejoSessions: s.manejoSessions,
    expenses: s.expenses,
    accounts: s.accounts,
    customCategories: s.customCategories,
    semenBulls: s.semenBulls,
    farm: s.farm,
  };
}

/** Asks who is signed in and remembers it for an offline boot; null when unknown. */
async function rememberUser(): Promise<string | null> {
  const { data } = await authClient.getSession();
  const userId = data?.user.id ?? null;
  if (userId) await metaStore().put(LAST_USER_KEY, userId);
  return userId;
}

/** The last signed-in user's snapshot of the stored active farm, if the phone has one. */
async function bootSnapshot(): Promise<Snapshot | undefined> {
  try {
    const userId = await metaStore().get(LAST_USER_KEY);
    const farmId = getActiveFarmId();
    if (!userId || farmId === null) return undefined;
    return await loadSnapshot(snapshotStore(), snapshotKey(userId, farmId));
  } catch {
    return undefined; // no IndexedDB (private mode, blocked storage): no snapshot
  }
}

/**
 * Saves what the store holds now — provisional records included — as the
 * phone's snapshot of the active farm. Offline, the data keeps its original
 * time. Never throws: a storage failure only means no snapshot.
 */
export async function persistSnapshot(get: () => HerdStore): Promise<void> {
  try {
    const s = get();
    const userId = await metaStore().get(LAST_USER_KEY);
    if (!userId || s.activeFarmId === null) return;
    await saveSnapshot(snapshotStore(), snapshotKey(userId, s.activeFarmId), {
      data: herdDataOf(s),
      farms: s.farms,
      activeFarmId: s.activeFarmId,
      savedAt: s.offline && s.snapshotAt ? s.snapshotAt : new Date().toISOString(),
    });
  } catch {
    // best-effort: the app runs without a snapshot
  }
}
```

- [ ] **Step 8: Add the initial values**

Old (lines 590-592):
```ts
  loaded: false,
  farms: [],
  activeFarmId: null,
```
New:
```ts
  loaded: false,
  offline: false,
  snapshotAt: null,
  farms: [],
  activeFarmId: null,
```

- [ ] **Step 9: Boot from the snapshot when the first load fails, and save it when it succeeds**

Old (lines 595-617):
```ts
  load: async () => {
    if (get().loaded) return;
    const [data, farmsRes, invitesRes] = await Promise.all([
      // AppShell shows its own screen when this first load fails.
      repository.load({ quiet: true }),
      api.farms.get(),
      api.invites.get(),
    ]);
    const activeFarmId = farmsRes.data?.activeFarmId;
    // A member who never switched farms has no stored choice, so nothing sends
    // x-farm-id and every request keeps resolving to whatever farm the server
    // falls back to. Pinning what it resolved here means a farm that gets
    // deleted or a membership that gets removed answers 403 not_a_member on the
    // next request, instead of silently landing on the next live farm.
    if (getActiveFarmId() === null && activeFarmId != null) setActiveFarmId(activeFarmId);
    set({
      ...data,
      farms: farmsRes.data?.farms ?? [],
      activeFarmId: activeFarmId ?? null,
      pendingInvites: invitesRes.data?.invites ?? [],
      loaded: true,
    });
  },
```
New:
```ts
  load: async () => {
    if (get().loaded) return;
    const results = await Promise.all([
      // AppShell shows its own screen when this first load fails and the
      // phone has no snapshot to boot from.
      repository.load({ quiet: true }),
      api.farms.get(),
      api.invites.get(),
    ]).catch(async (error: unknown) => {
      const snap = await bootSnapshot();
      if (!snap) throw error;
      set({
        ...snap.data,
        farms: snap.farms,
        activeFarmId: snap.activeFarmId,
        loaded: true,
        offline: true,
        snapshotAt: snap.savedAt,
      });
      return null;
    });
    if (!results) return;
    const [data, farmsRes, invitesRes] = results;
    const activeFarmId = farmsRes.data?.activeFarmId;
    // A member who never switched farms has no stored choice, so nothing sends
    // x-farm-id and every request keeps resolving to whatever farm the server
    // falls back to. Pinning what it resolved here means a farm that gets
    // deleted or a membership that gets removed answers 403 not_a_member on the
    // next request, instead of silently landing on the next live farm.
    if (getActiveFarmId() === null && activeFarmId != null) setActiveFarmId(activeFarmId);
    set({
      ...data,
      farms: farmsRes.data?.farms ?? [],
      activeFarmId: activeFarmId ?? null,
      pendingInvites: invitesRes.data?.invites ?? [],
      loaded: true,
    });
    // In the background: the boot never waits on the session read or IndexedDB.
    void rememberUser()
      .then((userId) => (userId ? persistSnapshot(get) : undefined))
      .catch(() => {});
  },
```

- [ ] **Step 10: Run the offline tests, type-check and lint**

Run: `pnpm vitest run lib/offline/__tests__/snapshot.test.ts lib/offline/__tests__/outbox.test.ts lib/offline/__tests__/db.test.ts --exclude '**/worktrees/**'`
Expected: `Test Files  3 passed (3)`, `Tests  21 passed (21)`.

Run: `pnpm tsc --noEmit`
Expected: no output, exit 0.

Run: `pnpm exec eslint lib/offline/snapshot.ts lib/offline/__tests__/snapshot.test.ts lib/store/useHerdStore.ts`
Expected: no output, exit 0.

- [ ] **Step 11: Check the boot by hand**

Run `pnpm dev`, sign in, open `/dashboard` (DevTools → Application → IndexedDB → `meubov` → `snapshot` holds `<userId>:<farmId>`, `meta` holds `lastUser`). DevTools → Network → Offline, reload with the service worker bypassed off (Task 1 serves the shell): the Painel renders the farm with no failure screen and `useHerdStore.getState().offline === true`. Clear site data, stay offline, reload: the existing "Sem conexão" failure screen shows.

- [ ] **Step 12: Commit**

```bash
git add lib/offline/snapshot.ts lib/offline/__tests__/snapshot.test.ts lib/store/useHerdStore.ts
git commit -m "feat(offline): boot from the phone's last snapshot when the API is unreachable" -- lib/offline/snapshot.ts lib/offline/__tests__/snapshot.test.ts lib/store/useHerdStore.ts
```

---

### Task 5: Server: idempotent start id, `force` on the pass routes

**Files:**
- Create: `lib/api/domains/manejo/_shared/revert.ts` (the undo logic moved out of `ReopenAnimal.useCase.ts`: `revertEntry`, `forceReopen`, `Refused`, `answerRefusal`)
- Create: `lib/api/domains/manejo/useCases/__tests__/revert.test.ts`, `lib/api/domains/manejo/useCases/__tests__/SkipAnimal.test.ts`
- Modify: `lib/api/domains/manejo/schemas/manejo.schema.ts` (`NewManejoSessionBody` ~L44, `ManejoPassBody` ~L88, `SetAsideBody` ~L102, `ManejoSkipBody` ~L109, new `ManejoBaixaBody`)
- Modify: `lib/api/domains/manejo/_shared/session.ts` (`ManejoConflict` ~L33–41: add `"session_closed"`; `conflict(code, entry?)` returns the new `PassConflict` — merge-notes ruling 8)
- Modify: `lib/api/domains/manejo/manejo.controller.ts` (import L14, POST `/` L66–70, skip L127–134, set-aside L112–119, baixa L144–154)
- Modify (full rewrite): `lib/api/domains/manejo/useCases/{ReopenAnimal,CompleteAnimal,SetAsideAnimal,SkipAnimal,BaixaAnimal}.useCase.ts`
- Modify: `lib/api/domains/manejo/useCases/Start.useCase.ts` (import L2, props L30–40, doc L44–56, run L65–99)
- Test: `useCases/__tests__/{Start,CompleteAnimal,SetAsideAnimal,BaixaAnimal}.test.ts` (extend), `__tests__/manejo.controller.test.ts` (extend). Route snapshots: no change.

**Interfaces:**
- Consumes: `lockEntry`, `lockDiagnosedBreedings`, `conflict`, `ANIMAL_PATCH_COLUMNS` (`_shared/session.ts`), `ValidateLotAssignmentUseCase`, `lockBullStock`.
- Produces:
  - `POST /manejo` body gains `id?: string (format uuid)`. Same farm's session with that id → 200 with the session as it is now (no insert). Another farm's id (or a discarded session's) → 409 `{ error: "id_taken" }`. No session with that id → inserted with it.
  - `POST /manejo/:id/animals/:animalId/{complete,set-aside,skip,baixa}` bodies gain `force?: boolean`. Without force, a non-pending entry → 409 `{ error: "entry_not_actionable" }` (as today). With force: closed session → 409 `{ error: "session_closed" }`. Otherwise the entry is undone in the same transaction, with the undo's own refusals: 409 `{ error: "has_diagnosis" }`, 409 `{ error: "animal_inactive" }`, 404 `{ error: "lot_not_found" }`. Then the pass is applied. A refusal after the undo (out_of_stock, bull_not_found, animal_inactive, lot_not_found) rolls the undo back. The 409s `entry_not_actionable`, `session_not_open` and `session_closed` of these four routes carry `entry` (the server's locked `ManejoSessionAnimal`, `amountBrl` hidden without Financeiro view) — merge-notes ruling 8. Responses are unchanged otherwise.
  - `revertEntry(tx, ctx: RevertContext): Promise<ReopenResult | RevertRefusal>` where `RevertRefusal = { conflict: ManejoConflict } | DiagnosedBreedingConflict | LotAssignmentError`. This is the contract's `ReopenResult | "has_diagnosis"` widened to Reopen's real refusals, so `breedingId` and the lot 404 survive. `forceReopen(tx, ctx)` = the same, except it refuses to force an entrada pass (`createdAnimal`, whose undo deletes the animal). It lives in `revert.ts`, not `session.ts`, because `revert.ts` imports `session.ts` and a re-export would create an import cycle.

- [ ] **Step 1: Schemas.** In `lib/api/domains/manejo/schemas/manejo.schema.ts`, Elysia's `t` registers the `uuid` format (`node_modules/elysia/dist/type-system/format.mjs`), so `format: "uuid"` works as is.

Old (imports):
```ts
import { t } from "elysia";

import {
  DateString,
```
New:
```ts
import { t } from "elysia";

import { DeactivateAnimalBody } from "@/lib/api/domains/animals/schemas/animal.schema";
import {
  DateString,
```
Old:
```ts
export const NewManejoSessionBody = t.Object({
  date: DateString,
```
New:
```ts
export const NewManejoSessionBody = t.Object({
  /**
   * Id a phone made up for a manejo started offline: replaying that start
   * returns the same session instead of opening a second one.
   */
  id: t.Optional(t.String({ format: "uuid" })),
  date: DateString,
```
Old:
```ts
  /** Rendimento (%) of this boiada, set at the brete of a venda per arroba. */
  carcassYieldPct: t.Optional(t.Number({ exclusiveMinimum: 0, maximum: 100 })),
});
```
New:
```ts
  /** Rendimento (%) of this boiada, set at the brete of a venda per arroba. */
  carcassYieldPct: t.Optional(t.Number({ exclusiveMinimum: 0, maximum: 100 })),
  /**
   * A pass the phone kept offline, sent over one another device already wrote:
   * that one is undone and this one applied, in one transaction.
   */
  force: t.Optional(t.Boolean()),
});
```
Old:
```ts
export const SetAsideBody = t.Object({
  list: t.Union([t.Literal("rejected"), t.Literal("held")]),
  weightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  notes: t.Optional(t.String()),
});

/** Body of POST /manejo/:id/animals/:animalId/skip. */
export const ManejoSkipBody = t.Object({
  notes: t.Optional(t.String()),
});
```
New:
```ts
export const SetAsideBody = t.Object({
  list: t.Union([t.Literal("rejected"), t.Literal("held")]),
  weightKg: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  notes: t.Optional(t.String()),
  /** Same as ManejoPassBody.force. */
  force: t.Optional(t.Boolean()),
});

/** Body of POST /manejo/:id/animals/:animalId/skip. */
export const ManejoSkipBody = t.Object({
  notes: t.Optional(t.String()),
  /** Same as ManejoPassBody.force. */
  force: t.Optional(t.Boolean()),
});

/**
 * Body of POST /manejo/:id/animals/:animalId/baixa: the animal page's baixa
 * (DeactivateAnimalBody, which stays as it is), plus `force` as in ManejoPassBody.
 */
export const ManejoBaixaBody = t.Object({
  ...DeactivateAnimalBody.properties,
  force: t.Optional(t.Boolean()),
});
```

- [ ] **Step 2: Add the conflict code.** In `lib/api/domains/manejo/_shared/session.ts`:

Old:
```ts
  /** A venda still has a dúvida to decide: it cannot close yet. */
  | "held_pending";
```
New:
```ts
  /** A venda still has a dúvida to decide: it cannot close yet. */
  | "held_pending"
  /** A forced pass reached a session that was closed meanwhile. */
  | "session_closed";
```
Old:
```ts
export const conflict = (code: ManejoConflict): { conflict: ManejoConflict } => ({
  conflict: code,
});
```
New:
```ts
/**
 * A refusal. On a pass route, `entry` is the server's locked entry when the
 * refusal is about it (another device passed the animal, the session closed),
 * so a phone replaying its fila can show "No servidor: …" before the choice.
 */
export interface PassConflict {
  conflict: ManejoConflict;
  entry?: ManejoSessionAnimal;
}

export const conflict = (code: ManejoConflict, entry?: ManejoSessionAnimal): PassConflict =>
  entry ? { conflict: code, entry } : { conflict: code };
```
Old:
```ts
import type { Tx } from "@/lib/api/@types/repoTypes";
```
New:
```ts
import type { Tx } from "@/lib/api/@types/repoTypes";
import type { ManejoSessionAnimal } from "@/lib/types";
```

- [ ] **Step 3: Create `lib/api/domains/manejo/_shared/revert.ts`.** The body of `revertEntry` is `ReopenAnimal.useCase.ts` lines 90–202 moved verbatim, with `animalId` replaced by `animal.id`.
```ts
/**
 * Undoing a pass: what `reopen` does, and what a forced pass does first when
 * another device already passed the animal. Call inside a transaction, after
 * `lockEntry`, with the session open and the entry not pending.
 */
import { and, eq, inArray } from "drizzle-orm";

import {
  animals,
  breedings,
  manejoSessionAnimals,
  manejoSessions,
  treatments,
  weighings,
} from "@/lib/db/schema";
import { toManejoSessionAnimal } from "@/lib/api/mappers";
import {
  ValidateLotAssignmentUseCase,
  type LotAssignmentError,
} from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import {
  ANIMAL_PATCH_COLUMNS,
  conflict,
  lockDiagnosedBreedings,
  type AnimalPatch,
  type ManejoConflict,
} from "./session";

import type { Tx } from "@/lib/api/@types/repoTypes";
import type { ManejoSessionAnimal, Weighing } from "@/lib/types";

/** Result of undoing one pass. */
export interface ReopenResult {
  entry: ManejoSessionAnimal;
  removedTreatmentIds: string[];
  removedWeighing?: Weighing;
  /** Present when the undo put the animal back in its lot or in the herd. */
  animal?: AnimalPatch;
  /** Ear tag of the animal deleted by undoing an entry pass. */
  removedEarTag?: string;
  /** Cobertura deleted by undoing an inseminação pass; its dose is back in stock. */
  removedBreedingId?: string;
}

/**
 * The pass's cobertura was already diagnosed; `breedingId` names it so the
 * client can offer to clear that diagnosis first.
 */
export interface DiagnosedBreedingConflict {
  conflict: "has_diagnosis";
  breedingId: string;
}

/** Why an undo stops before its first write. */
export type RevertRefusal =
  | { conflict: ManejoConflict }
  | DiagnosedBreedingConflict
  | LotAssignmentError;

/** The rows `lockEntry` locked for the pass. */
export interface RevertContext {
  farmId: number;
  session: typeof manejoSessions.$inferSelect;
  entry: typeof manejoSessionAnimals.$inferSelect;
  animal: { id: string; earTag: string; lotId: string; active: boolean };
}

/** Reverts one animal to pending, deleting the effects its pass created. */
export async function revertEntry(
  tx: Tx,
  { farmId, session, entry, animal }: RevertContext
): Promise<ReopenResult | RevertRefusal> {
  // An animal that had a baixa stays out of the queue: there is nothing left
  // to apply to it, and in a venda the undo would even put it back in the
  // herd. Only a sold pass, whose own sale took it out, may be undone — and
  // a dúvida, which must be cleared for the venda to close: that undo only
  // resets the entry (and drops its weighing), never touching the animal.
  const soldHere = session.kind === "sale" && entry.outcome === "done";
  if (!animal.active && !soldHere && entry.outcome !== "held") {
    return conflict("animal_inactive");
  }
  const leftHerdHeld = !animal.active && entry.outcome === "held";
  const restoreLot = entry.previousLotId !== null && !leftHerdHeld;
  const earTag = animal.earTag;

  if (restoreLot && entry.previousLotId !== null) {
    const lotError = await new ValidateLotAssignmentUseCase(tx).run({ farmId, lotId: entry.previousLotId });
    if (lotError) return lotError;
  }

  // An inseminação pass whose cobertura was already diagnosed stays: undoing
  // it would take the ultrassom result down with it.
  if (entry.breedingId !== null) {
    const diagnosed = await lockDiagnosedBreedings(tx, [entry.breedingId]);
    if (diagnosed.has(entry.breedingId)) {
      return { conflict: "has_diagnosis", breedingId: entry.breedingId };
    }
  }

  // An entry pass CREATED the animal, so undoing it removes the registration
  // altogether (weighings and the chute entry cascade with it).
  if (entry.createdAnimal) {
    await tx.delete(manejoSessionAnimals).where(
      and(
        eq(manejoSessionAnimals.sessionId, session.id),
        eq(manejoSessionAnimals.animalId, animal.id)
      )
    );
    await tx.delete(animals).where(eq(animals.id, animal.id));
    return {
      entry: toManejoSessionAnimal(entry, earTag),
      removedTreatmentIds: [],
      removedEarTag: earTag,
    };
  }

  let removedWeighing: Weighing | undefined;
  if (entry.weighingId !== null) {
    // Soft delete: the reading leaves the herd but stays on record, the same
    // trail a whole-session delete leaves (lib/domain/manejoRevert.ts).
    const [removed] = await tx
      .update(weighings)
      .set({ deletedAt: new Date() })
      .where(eq(weighings.id, entry.weighingId))
      .returning();
    if (removed) {
      removedWeighing = { date: removed.date, weightKg: removed.weightKg };
    }
  }

  // Clear the refs BEFORE deleting the treatments and the cobertura (the FKs
  // are set-null and would race the update otherwise), then delete them.
  const removedTreatmentIds = [entry.treatmentId, entry.boosterId].filter(
    (id): id is string => id !== null
  );
  // Put the animal back where the pass found it: in its old lot after a
  // transferência, and back in the active herd after a boiada. A refugo
  // or a dúvida never left it.
  let patch: AnimalPatch | undefined;
  if (restoreLot || soldHere) {
    const [row] = await tx
      .update(animals)
      .set({
        ...(restoreLot && entry.previousLotId !== null ? { lotId: entry.previousLotId } : {}),
        ...(soldHere ? { active: true, inactiveReason: null, inactiveDate: null } : {}),
      })
      .where(eq(animals.id, animal.id))
      .returning(ANIMAL_PATCH_COLUMNS);
    patch = row;
  }

  const [updated] = await tx
    .update(manejoSessionAnimals)
    .set({
      outcome: "pending",
      weightKg: null,
      notes: null,
      amountBrl: null,
      previousLotId: null,
      treatmentId: null,
      boosterId: null,
      weighingId: null,
      breedingId: null,
      carcassYieldPct: null,
    })
    .where(
      and(
        eq(manejoSessionAnimals.sessionId, session.id),
        eq(manejoSessionAnimals.animalId, animal.id)
      )
    )
    .returning();
  if (removedTreatmentIds.length > 0) {
    await tx.delete(treatments).where(inArray(treatments.id, removedTreatmentIds));
  }
  if (entry.breedingId !== null) {
    await tx.delete(breedings).where(eq(breedings.id, entry.breedingId));
  }

  return {
    entry: toManejoSessionAnimal(updated, earTag),
    removedTreatmentIds,
    removedWeighing,
    animal: patch,
    removedBreedingId: entry.breedingId ?? undefined,
  };
}

/**
 * The undo a forced pass runs before applying the phone's pass over one
 * another device wrote. An entrada's pass is never forced: undoing it
 * deletes the animal the pass would then be applied to.
 */
export async function forceReopen(
  tx: Tx,
  ctx: RevertContext
): Promise<ReopenResult | RevertRefusal> {
  if (ctx.entry.createdAnimal) return conflict("entry_not_actionable");
  return revertEntry(tx, ctx);
}

/**
 * A refusal thrown out of a pass's transaction instead of returned, so the
 * transaction rolls back (taking a forced undo with it) while
 * `answerRefusal` still answers it.
 */
export class Refused extends Error {
  readonly answer: unknown;

  constructor(answer: unknown) {
    super("pass refused");
    this.answer = answer;
  }
}

/** Runs a pass's transaction; a `Refused` thrown inside becomes the answer. */
export async function answerRefusal<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Refused) return error.answer as T;
    throw error;
  }
}
```

- [ ] **Step 4: Rewrite `lib/api/domains/manejo/useCases/ReopenAnimal.useCase.ts`** to call `revertEntry`. The response shape stays the same.
```ts
import { db } from "@/lib/db";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";

import { revertEntry, type ReopenResult, type RevertRefusal } from "../_shared/revert";
import { conflict, lockEntry } from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";

export type { DiagnosedBreedingConflict, ReopenResult } from "../_shared/revert";

interface ReopenAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
}

type ReopenAnimalUseCaseResponse = ReopenResult | RevertRefusal | null;

type CurrUseCase = _UseCase<ReopenAnimalUseCaseProps, ReopenAnimalUseCaseResponse>;

/** Undo: reverts one animal to pending, deleting the effects its pass created. */
export class ReopenAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("ReopenAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, animalId }) => {
    return this.repository.transaction(async (tx) => {
      const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
      if (!session || !entry || !animal) return null;
      if (session.status !== "open") return conflict("session_not_open");
      if (entry.outcome === "pending") return conflict("entry_not_actionable");
      return revertEntry(tx, { farmId, session, entry, animal });
    });
  };
}
```
Run: `pnpm vitest run lib/api/domains/manejo/useCases/__tests__/ReopenAnimal.test.ts lib/api/domains/manejo/useCases/__tests__/discardedSession.test.ts --exclude '**/worktrees/**'`. Expected: all pass, unchanged.

- [ ] **Step 5: Create `lib/api/domains/manejo/useCases/__tests__/revert.test.ts`.**
```ts
/**
 * The undo shared by `reopen` and a forced pass. Reopen's own tests keep
 * covering the undo branch by branch; this file pins what moved with it: the
 * lot put back after a transferência, the refusal before the first write,
 * the entrada pass a force never undoes, and the refusal that rolls a forced
 * undo back.
 *
 * The transaction is a hand-made chainable stub: selects answer from a queued
 * list of rows, and every write lands in one log, in call order, with its table.
 */
import { getTableName, type Table } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { answerRefusal, forceReopen, Refused, revertEntry } from "../../_shared/revert";

function stubTx(selectResults: Record<string, unknown>[][]) {
  const writes: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const select = () => {
    const rows = selectResults.shift() ?? [];
    const builder = {
      from: () => builder,
      where: () => builder,
      for: () => builder,
      limit: () => builder,
      then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
    };
    return builder;
  };
  const tx = {
    select,
    update: (table: Table) => {
      writes.push(`update ${getTableName(table)}`);
      let columns: Record<string, unknown> = {};
      const builder = {
        set(set: Record<string, unknown>) {
          columns = set;
          updates.push(set);
          return builder;
        },
        where: () => builder,
        returning: () => Promise.resolve([{ ...columns }]),
      };
      return builder;
    },
    delete: (table: Table) => ({
      where: () => {
        writes.push(`delete ${getTableName(table)}`);
        return Promise.resolve(undefined);
      },
    }),
  };
  return { tx: tx as never, writes, updates };
}

const SESSION = { id: "s-1", farmId: 7, kind: "transfer", status: "open" };
const DONE_ENTRY = {
  sessionId: "s-1",
  animalId: "a-1",
  outcome: "done",
  previousLotId: "lot-0",
  createdAnimal: false,
  treatmentId: "t-1",
  boosterId: null,
  weighingId: null,
  breedingId: null,
};
const ANIMAL = { id: "a-1", earTag: "V-01", lotId: "lot-2", active: true };
const ctx = (entry: Record<string, unknown> = DONE_ENTRY) =>
  ({ farmId: 7, session: SESSION, entry, animal: ANIMAL }) as never;

describe("revertEntry", () => {
  it("undoes a transferência: the treatment goes, the animal goes back to its old lot", async () => {
    // The old lot's lock and its open placement.
    const { tx, writes, updates } = stubTx([[{ id: "lot-0" }], [{ id: "pl-1" }]]);

    const result = await revertEntry(tx, ctx());

    expect(writes).toEqual(["update animals", "update manejo_session_animals", "delete treatments"]);
    expect(updates[0]).toEqual({ lotId: "lot-0" });
    expect(result).toMatchObject({
      entry: { earTag: "V-01", outcome: "pending" },
      removedTreatmentIds: ["t-1"],
      animal: { lotId: "lot-0" },
    });
  });

  it("answers lot_not_found and writes nothing when the old lot is gone", async () => {
    const { tx, writes } = stubTx([[]]);

    expect(await revertEntry(tx, ctx())).toBe("lot_not_found");
    expect(writes).toEqual([]);
  });
});

describe("forceReopen", () => {
  it("never forces an entrada's pass, whose undo would delete the animal", async () => {
    const { tx, writes } = stubTx([]);

    const result = await forceReopen(tx, ctx({ ...DONE_ENTRY, createdAnimal: true }));

    expect(result).toEqual({ conflict: "entry_not_actionable" });
    expect(writes).toEqual([]);
  });
});

describe("answerRefusal", () => {
  it("answers a refusal thrown out of the transaction", async () => {
    const answer = await answerRefusal(async () => {
      throw new Refused({ conflict: "out_of_stock" });
    });

    expect(answer).toEqual({ conflict: "out_of_stock" });
  });

  it("lets any other error through", async () => {
    await expect(
      answerRefusal(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });
});
```
Run: `pnpm vitest run lib/api/domains/manejo/useCases/__tests__/revert.test.ts --exclude '**/worktrees/**'`. Expected: 5 passed.

- [ ] **Step 6: Start with an id.** In `lib/api/domains/manejo/useCases/Start.useCase.ts`:

Old: `import { and, eq, inArray } from "drizzle-orm";`
New: `import { and, asc, eq, inArray } from "drizzle-orm";`

Old:
```ts
interface StartSessionUseCaseProps {
  farmId: number;
  input: NewManejoSession;
}

type StartSessionUseCaseResponse =
  | ManejoSession
  | LotAssignmentError
  | "bull_not_found"
  | "not_female"
  | null;
```
New:
```ts
interface StartSessionUseCaseProps {
  farmId: number;
  /** `id`: made up by a phone that started the manejo offline. */
  input: NewManejoSession & { id?: string };
}

type StartSessionUseCaseResponse =
  | ManejoSession
  | LotAssignmentError
  | "bull_not_found"
  | "not_female"
  | "id_taken"
  | null;
```
Old (end of the class doc comment):
```ts
 * along. Their stock is not checked here: each pass takes its own dose at the
 * chute.
 */
```
New:
```ts
 * along. Their stock is not checked here: each pass takes its own dose at the
 * chute.
 *
 * A manejo started offline comes with the id the phone gave it. Replaying
 * that start (the first answer was lost on the way back) returns the session
 * as it is now and writes nothing. An id already used by another farm, or by a
 * discarded session, is `id_taken`.
 */
```
Old:
```ts
    return this.repository.transaction(async (tx) => {
      const herd =
```
New:
```ts
    return this.repository.transaction(async (tx) => {
      if (input.id !== undefined) {
        const [existing] = await tx
          .select()
          .from(manejoSessions)
          .where(eq(manejoSessions.id, input.id))
          .limit(1);
        if (existing) {
          if (existing.farmId !== farmId || existing.deletedAt !== null) return "id_taken";
          const entries = await tx
            .select({ row: manejoSessionAnimals, earTag: animals.earTag })
            .from(manejoSessionAnimals)
            .innerJoin(animals, eq(manejoSessionAnimals.animalId, animals.id))
            .where(eq(manejoSessionAnimals.sessionId, existing.id))
            .orderBy(asc(manejoSessionAnimals.position));
          return toManejoSession(
            existing,
            entries.map(({ row, earTag }) => toManejoSessionAnimal(row, earTag))
          );
        }
      }

      const herd =
```
Old:
```ts
        .values({
          id: randomUUID(),
          farmId,
```
New:
```ts
        .values({
          id: input.id ?? randomUUID(),
          farmId,
```
Two phones replaying the same id at the same instant: the second insert fails on the primary key (500) and its retry takes the "same farm" branch. No extra lock is needed.

- [ ] **Step 7: Start tests.** In `lib/api/domains/manejo/useCases/__tests__/Start.test.ts`, the stub learns joins:

Old:
```ts
    where: () => builder,
    for: () => builder,
    limit: () => builder,
```
New:
```ts
    where: () => builder,
    innerJoin: () => builder,
    orderBy: () => builder,
    for: () => builder,
    limit: () => builder,
```
Append at the end of the file:
```ts
describe("startSession — an id the phone made up offline", () => {
  const ID = "0b7f2c1e-8a4d-4c3b-9f1e-2d5a6b7c8d9e";
  const WEIGHING = { date: "2026-09-25", kind: "weighing" as const, earTags: ["V-01"], weighing: true };
  const EXISTING = {
    id: ID,
    farmId: 7,
    name: "Pesagem",
    date: "2026-09-25",
    status: "open",
    kind: "weighing",
    weighing: true,
    destinationLotId: null,
    counterparty: null,
    pricePerArroba: null,
    carcassYieldPct: null,
    totalAmountBrl: null,
    semenBullIds: null,
    notes: null,
    planType: null,
    planName: null,
    planWithdrawalDays: null,
    planDose: null,
    planResponsible: null,
    planCostBrl: null,
    planNextDate: null,
    planNotes: null,
    deletedAt: null,
  };
  const DONE_ROW = {
    sessionId: ID,
    animalId: "a-1",
    position: 0,
    outcome: "done",
    weightKg: 310,
    notes: null,
    amountBrl: null,
    carcassYieldPct: null,
    previousLotId: null,
    createdAnimal: false,
    treatmentId: null,
    boosterId: null,
    weighingId: 5,
    breedingId: null,
  };

  it("returns the existing session when the id is already the farm's (no insert)", async () => {
    state.selectResults = [[EXISTING], [{ row: DONE_ROW, earTag: "V-01" }]];

    const result = await new StartSessionUseCase().run({ farmId: 7, input: { ...WEIGHING, id: ID } });

    expect(state.inserts).toEqual([]);
    expect(result).toMatchObject({
      id: ID,
      kind: "weighing",
      animals: [{ earTag: "V-01", outcome: "done", weightKg: 310 }],
    });
  });

  it("answers id_taken for another farm's id", async () => {
    state.selectResults = [[{ ...EXISTING, farmId: 9 }]];

    const result = await new StartSessionUseCase().run({ farmId: 7, input: { ...WEIGHING, id: ID } });

    expect(result).toBe("id_taken");
    expect(state.selects).toBe(1);
    expect(state.inserts).toEqual([]);
  });

  it("answers id_taken for a discarded session's id", async () => {
    state.selectResults = [[{ ...EXISTING, deletedAt: new Date() }]];

    expect(
      await new StartSessionUseCase().run({ farmId: 7, input: { ...WEIGHING, id: ID } })
    ).toBe("id_taken");
    expect(state.inserts).toEqual([]);
  });

  it("inserts with the given id", async () => {
    // The id lookup finds nothing; then the herd.
    state.selectResults = [[], [{ id: "a-1", earTag: "V-01", sex: "male" }]];

    const result = await new StartSessionUseCase().run({ farmId: 7, input: { ...WEIGHING, id: ID } });

    expect(state.inserts[0][0]).toMatchObject({ id: ID, kind: "weighing" });
    expect(state.inserts[1][0]).toMatchObject({ sessionId: ID, animalId: "a-1" });
    expect(result).toMatchObject({ id: ID, animals: [{ earTag: "V-01", outcome: "pending" }] });
  });
});
```
Run: `pnpm vitest run lib/api/domains/manejo/useCases/__tests__/Start.test.ts --exclude '**/worktrees/**'`. Expected: all pass (6 old + 4 new).

- [ ] **Step 8: Rewrite `lib/api/domains/manejo/useCases/CompleteAnimal.useCase.ts`.** Every refusal after the pending check is now thrown as `Refused`, so it rolls a forced undo back. For a non-forced pass nothing was written yet, so the answer is the same as before.
```ts
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  animals,
  breedings,
  manejoSessionAnimals,
  treatments,
  weighings,
} from "@/lib/db/schema";
import { buildPassEffects } from "@/lib/domain/manejo";
import {
  toBreeding,
  toManejoPlan,
  toManejoSessionAnimal,
  toTreatment,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import {
  ValidateLotAssignmentUseCase,
  type LotAssignmentError,
} from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";
import { bullEarTagOf, lockBullStock } from "@/lib/api/domains/semen/_shared/stock";

import { answerRefusal, forceReopen, Refused } from "../_shared/revert";
import {
  ANIMAL_PATCH_COLUMNS,
  conflict,
  lockEntry,
  type AnimalPatch,
  type PassConflict,
} from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  Breeding,
  ManejoSessionAnimal,
  Treatment,
  Weighing,
} from "@/lib/types";
import type { ManejoPassData } from "@/lib/store/useHerdStore";

/** Result of one completed pass (for the client-side merge). */
export interface CompleteResult {
  entry: ManejoSessionAnimal;
  treatments: Treatment[];
  weighing?: Weighing;
  /** Present when the pass moved or sold the animal. */
  animal?: AnimalPatch;
  /** The IATF cobertura an inseminação pass recorded on the cow. */
  breeding?: Breeding;
}

interface CompleteAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
  data: ManejoPassData;
  /** The phone's pass wins over one another device already wrote. */
  force?: boolean;
}

type CompleteAnimalUseCaseResponse =
  | CompleteResult
  | PassConflict
  | LotAssignmentError
  | "bull_not_found"
  | null;

type CurrUseCase = _UseCase<CompleteAnimalUseCaseProps, CompleteAnimalUseCaseResponse>;

/**
 * Applies the session's effects to one animal and marks it done.
 *
 * An inseminação pass takes one dose: the bull row stays locked until the
 * transaction ends, so two cows passing at once cannot both take the last one.
 * The stock is checked before anything is written.
 *
 * With `force`, a pass another device already wrote is undone first (with the
 * undo's own refusals) and this one applied in the same transaction; a closed
 * session answers `session_closed`. Every refusal after that point is thrown
 * as `Refused`, so it takes the undo back with it.
 */
export class CompleteAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("CompleteAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, sessionId, animalId, data, force }) =>
    answerRefusal<CompleteAnimalUseCaseResponse>(() =>
      this.repository.transaction(async (tx) => {
        const locked = await lockEntry(tx, farmId, sessionId, animalId);
        const { session, entry } = locked;
        let { animal } = locked;
        if (!session || !entry || !animal) return null;
        if (session.status !== "open") {
          return conflict(
            force ? "session_closed" : "session_not_open",
            toManejoSessionAnimal(entry, animal.earTag)
          );
        }
        if (entry.outcome !== "pending") {
          if (!force) return conflict("entry_not_actionable", toManejoSessionAnimal(entry, animal.earTag));
          const undone = await forceReopen(tx, { farmId, session, entry, animal });
          if (typeof undone === "string" || "conflict" in undone) return undone;
          if (undone.animal) animal = { ...animal, ...undone.animal };
        }
        // A baixa given while the session was open: the animal left the herd, so
        // it takes no treatment, weight, sale or cobertura — it can only be skipped.
        if (!animal.active) throw new Refused(conflict("animal_inactive"));
        const earTag = animal.earTag;

        const effects = buildPassEffects(
          {
            date: session.date,
            kind: session.kind,
            weighing: session.weighing,
            treatment: toManejoPlan(session),
            destinationLotId: session.destinationLotId ?? undefined,
            pricePerArroba: session.pricePerArroba ?? undefined,
            carcassYieldPct: session.carcassYieldPct ?? undefined,
            semenBullIds: session.semenBullIds ?? undefined,
          },
          data
        );

        if (effects.lotId !== undefined) {
          const lotError = await new ValidateLotAssignmentUseCase(tx).run({ farmId, lotId: effects.lotId });
          if (lotError) throw new Refused(lotError);
        }

        const stock = effects.breeding
          ? await lockBullStock(tx, farmId, effects.breeding.semenBullId)
          : undefined;
        if (stock === null) throw new Refused("bull_not_found");
        if (stock && stock.left <= 0) throw new Refused(conflict("out_of_stock"));

        const createdTreatments: Treatment[] = [];
        let treatmentId: string | undefined;
        let boosterId: string | undefined;
        if (effects.treatment) {
          const [row] = await tx
            .insert(treatments)
            .values({ id: randomUUID(), animalId, ...effects.treatment })
            .returning();
          treatmentId = row.id;
          createdTreatments.push(toTreatment(row, earTag));
        }
        if (effects.booster) {
          const [row] = await tx
            .insert(treatments)
            .values({ id: randomUUID(), animalId, ...effects.booster })
            .returning();
          boosterId = row.id;
          createdTreatments.push(toTreatment(row, earTag));
        }

        // The cobertura names its bull the way a single IATF does: by the code,
        // or by the name when the bull has none.
        let breeding: Breeding | undefined;
        if (effects.breeding && stock) {
          const [row] = await tx
            .insert(breedings)
            .values({
              id: randomUUID(),
              animalId,
              ...effects.breeding,
              bullEarTag: bullEarTagOf(stock.bull),
            })
            .returning();
          breeding = toBreeding(row);
        }

        let weighingId: number | undefined;
        if (effects.weighing) {
          const [row] = await tx
            .insert(weighings)
            .values({ animalId, ...effects.weighing })
            .returning();
          weighingId = row.id;
        }

        // A transferência lands the animal in the destination lot and a venda takes
        // it out of the herd; the lot it came from is kept on the entry so undoing
        // the pass can put it back exactly where it was.
        let patch: AnimalPatch | undefined;
        const moves = effects.lotId !== undefined || effects.sold === true;
        if (moves) {
          const [row] = await tx
            .update(animals)
            .set({
              ...(effects.lotId !== undefined ? { lotId: effects.lotId } : {}),
              ...(effects.sold === true
                ? {
                    active: false,
                    inactiveReason: "sale" as const,
                    inactiveDate: session.date,
                  }
                : {}),
            })
            .where(eq(animals.id, animalId))
            .returning(ANIMAL_PATCH_COLUMNS);
          patch = row;
        }

        const notes = data.notes?.trim();
        const [updated] = await tx
          .update(manejoSessionAnimals)
          .set({
            outcome: "done",
            weightKg: effects.weighing?.weightKg ?? null,
            notes: notes ? notes : null,
            amountBrl: effects.amountBrl ?? null,
            previousLotId: moves ? animal.lotId : null,
            treatmentId: treatmentId ?? null,
            boosterId: boosterId ?? null,
            weighingId: weighingId ?? null,
            breedingId: breeding?.id ?? null,
            carcassYieldPct: effects.carcassYieldPct ?? null,
          })
          .where(
            and(
              eq(manejoSessionAnimals.sessionId, session.id),
              eq(manejoSessionAnimals.animalId, animalId)
            )
          )
          .returning();

        return {
          entry: toManejoSessionAnimal(updated, earTag),
          treatments: createdTreatments,
          weighing: effects.weighing,
          animal: patch,
          breeding,
        };
      })
    );
}
```
After a forced undo, `animal` carries the undo's patch (restored lot, back in the herd), so `previousLotId: animal.lotId` and the `active` check see the rows as they are now.

- [ ] **Step 9: Rewrite `lib/api/domains/manejo/useCases/SetAsideAnimal.useCase.ts`.**
```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { manejoSessionAnimals, weighings } from "@/lib/db/schema";
import { toManejoSessionAnimal } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import type { LotAssignmentError } from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import { answerRefusal, forceReopen, Refused } from "../_shared/revert";
import { conflict, lockEntry, type PassConflict } from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { ManejoSessionAnimal, Weighing } from "@/lib/types";

/** Refugo (stays on the farm) or dúvida (decided before the venda closes). */
export type SetAsideList = "rejected" | "held";

export interface SetAsideResult {
  entry: ManejoSessionAnimal;
  /** The scale reading the pass kept, when the venda weighs. */
  weighing?: Weighing;
}

interface SetAsideAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
  input: { list: SetAsideList; weightKg?: number; notes?: string };
  /** The phone's pass wins over one another device already wrote. */
  force?: boolean;
}

type SetAsideAnimalUseCaseResponse =
  | SetAsideResult
  | PassConflict
  | LotAssignmentError
  | null;

type CurrUseCase = _UseCase<SetAsideAnimalUseCaseProps, SetAsideAnimalUseCaseResponse>;

/**
 * Sets a venda's animal apart at the brete: it passed the scale but is not
 * sold. The weight read is kept as a pesagem; the animal stays in the herd.
 *
 * With `force`, a pass another device already wrote is undone first, as in
 * CompleteAnimalUseCase; a refusal after the undo takes it back.
 */
export class SetAsideAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SetAsideAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, sessionId, animalId, input, force }) =>
    answerRefusal<SetAsideAnimalUseCaseResponse>(() =>
      this.repository.transaction(async (tx) => {
        const locked = await lockEntry(tx, farmId, sessionId, animalId);
        const { session, entry } = locked;
        let { animal } = locked;
        if (!session || !entry || !animal) return null;
        if (session.status !== "open") {
          return conflict(
            force ? "session_closed" : "session_not_open",
            toManejoSessionAnimal(entry, animal.earTag)
          );
        }
        if (session.kind !== "sale") return conflict("entry_not_actionable");
        if (entry.outcome !== "pending") {
          if (!force) return conflict("entry_not_actionable", toManejoSessionAnimal(entry, animal.earTag));
          const undone = await forceReopen(tx, { farmId, session, entry, animal });
          if (typeof undone === "string" || "conflict" in undone) return undone;
          if (undone.animal) animal = { ...animal, ...undone.animal };
        }
        if (!animal.active) throw new Refused(conflict("animal_inactive"));

        let weighing: Weighing | undefined;
        let weighingId: number | null = null;
        if (session.weighing && input.weightKg !== undefined) {
          weighing = { date: session.date, weightKg: input.weightKg };
          const [row] = await tx
            .insert(weighings)
            .values({ animalId, ...weighing })
            .returning();
          weighingId = row.id;
        }

        const notes = input.notes?.trim();
        const [updated] = await tx
          .update(manejoSessionAnimals)
          .set({
            outcome: input.list,
            weightKg: weighing?.weightKg ?? null,
            weighingId,
            notes: notes ? notes : null,
          })
          .where(
            and(
              eq(manejoSessionAnimals.sessionId, session.id),
              eq(manejoSessionAnimals.animalId, animalId)
            )
          )
          .returning();
        return { entry: toManejoSessionAnimal(updated, animal.earTag), weighing };
      })
    );
}
```

- [ ] **Step 10: Rewrite `lib/api/domains/manejo/useCases/SkipAnimal.useCase.ts`.** Nothing can refuse after the undo here, so it does not need `answerRefusal`.
```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  manejoSessionAnimals,
} from "@/lib/db/schema";
import {
  toManejoSessionAnimal,
} from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import type { LotAssignmentError } from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import { forceReopen } from "../_shared/revert";
import {
  conflict,
  lockEntry,
  type PassConflict,
} from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type {
  ManejoSessionAnimal,
} from "@/lib/types";

interface SkipAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
  notes: string | undefined;
  /** The phone's skip wins over a pass another device already wrote. */
  force?: boolean;
}

type SkipAnimalUseCaseResponse =
  | ManejoSessionAnimal
  | PassConflict
  | LotAssignmentError
  | null;

type CurrUseCase = _UseCase<SkipAnimalUseCaseProps, SkipAnimalUseCaseResponse>;

/**
 * Marks one animal as skipped (did not pass the chute). With `force`, a pass
 * another device already wrote is undone first, in the same transaction.
 */
export class SkipAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("SkipAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = async ({ farmId, sessionId, animalId, notes, force }) => {
    return this.repository.transaction(async (tx) => {
      const { session, entry, animal } = await lockEntry(tx, farmId, sessionId, animalId);
      if (!session || !entry || !animal) return null;
      if (session.status !== "open") {
        return conflict(
          force ? "session_closed" : "session_not_open",
          toManejoSessionAnimal(entry, animal.earTag)
        );
      }
      if (entry.outcome !== "pending") {
        if (!force) return conflict("entry_not_actionable", toManejoSessionAnimal(entry, animal.earTag));
        const undone = await forceReopen(tx, { farmId, session, entry, animal });
        if (typeof undone === "string" || "conflict" in undone) return undone;
      }

      const trimmed = notes?.trim();
      const [updated] = await tx
        .update(manejoSessionAnimals)
        .set({ outcome: "skipped", notes: trimmed ? trimmed : null })
        .where(
          and(
            eq(manejoSessionAnimals.sessionId, session.id),
            eq(manejoSessionAnimals.animalId, animal.id)
          )
        )
        .returning();
      return toManejoSessionAnimal(updated, animal.earTag);
    });
  };
}
```

- [ ] **Step 11: Rewrite `lib/api/domains/manejo/useCases/BaixaAnimal.useCase.ts`.**
```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { manejoSessionAnimals } from "@/lib/db/schema";
import { baixaPassNote } from "@/lib/domain/manejo";
import { toManejoSessionAnimal } from "@/lib/api/mappers";
import { __throwOnBrowser } from "@/lib/api/utils/throwOnBrowser";
import { DeactivateAnimalUseCase } from "@/lib/api/domains/animals/useCases/Deactivate.useCase";
import type { LotAssignmentError } from "@/lib/api/domains/animals/useCases/ValidateLotAssignment.useCase";

import { answerRefusal, forceReopen, Refused } from "../_shared/revert";
import { conflict, lockEntry, type PassConflict } from "../_shared/session";

import type { RepositoryType } from "@/lib/api/@types/repoTypes";
import type { Animal, ManejoSessionAnimal } from "@/lib/types";
import type { NewBaixa } from "@/lib/store/useHerdStore";

/** Result of a baixa at the brete (for the client-side merge). */
export interface BaixaResult {
  entry: ManejoSessionAnimal;
  animal: Pick<
    Animal,
    "earTag" | "active" | "inactiveReason" | "inactiveDate" | "inactiveNotes"
  >;
}

interface BaixaAnimalUseCaseProps {
  farmId: number;
  sessionId: string;
  animalId: string;
  input: NewBaixa;
  /** The phone's baixa wins over a pass another device already wrote. */
  force?: boolean;
}

type BaixaAnimalUseCaseResponse =
  | BaixaResult
  | PassConflict
  | LotAssignmentError
  | null;

type CurrUseCase = _UseCase<BaixaAnimalUseCaseProps, BaixaAnimalUseCaseResponse>;

/**
 * A baixa given at the brete: the animal leaves the herd (morte, perda, outro)
 * and its pass is skipped, with a note naming the baixa, in one transaction —
 * the queue never holds an animal that is gone, and a failed write leaves both
 * as they were.
 *
 * With `force`, a pass another device already wrote is undone first, as in
 * CompleteAnimalUseCase; a refusal after the undo takes it back.
 */
export class BaixaAnimalUseCase implements CurrUseCase {
  private repository: RepositoryType;

  constructor(repo: RepositoryType = db) {
    __throwOnBrowser("BaixaAnimalUseCase.constructor");
    this.repository = repo;
  }

  public run: CurrUseCase["run"] = ({ farmId, sessionId, animalId, input, force }) =>
    answerRefusal<BaixaAnimalUseCaseResponse>(() =>
      this.repository.transaction(async (tx) => {
        const locked = await lockEntry(tx, farmId, sessionId, animalId);
        const { session, entry } = locked;
        let { animal } = locked;
        if (!session || !entry || !animal) return null;
        if (session.status !== "open") {
          return conflict(
            force ? "session_closed" : "session_not_open",
            toManejoSessionAnimal(entry, animal.earTag)
          );
        }
        if (entry.outcome !== "pending") {
          if (!force) return conflict("entry_not_actionable", toManejoSessionAnimal(entry, animal.earTag));
          const undone = await forceReopen(tx, { farmId, session, entry, animal });
          if (typeof undone === "string" || "conflict" in undone) return undone;
          if (undone.animal) animal = { ...animal, ...undone.animal };
        }
        if (!animal.active) throw new Refused(conflict("animal_inactive"));

        await new DeactivateAnimalUseCase(tx).run({ farmId, animalId, input });
        const [updated] = await tx
          .update(manejoSessionAnimals)
          .set({ outcome: "skipped", notes: baixaPassNote(input.reason, input.notes) })
          .where(
            and(
              eq(manejoSessionAnimals.sessionId, session.id),
              eq(manejoSessionAnimals.animalId, animal.id)
            )
          )
          .returning();

        const notes = input.notes?.trim();
        return {
          entry: toManejoSessionAnimal(updated, animal.earTag),
          animal: {
            earTag: animal.earTag,
            active: false,
            inactiveReason: input.reason,
            inactiveDate: input.date,
            inactiveNotes: notes ? notes : undefined,
          },
        };
      })
    );
}
```

- [ ] **Step 12: Controller.** In `lib/api/domains/manejo/manejo.controller.ts`. The four pass routes answer a 409 through `passConflict`: `{ error }` plus the server's `entry` when the use case sent one (merge-notes ruling 8), its `amountBrl` hidden without Financeiro view as the complete route already hides it. The skip, set-aside and baixa routes now also need the undo's `lot_not_found` 404, both for TypeScript (`in` on a string) and at runtime.

Old (L14): `import { DeactivateAnimalBody } from "@/lib/api/domains/animals/schemas/animal.schema";` → delete the line.

Old:
```ts
export const manejoController = new Elysia({ prefix: "/manejo" })
```
New:
```ts
/**
 * A pass route's 409: `{ error }`, plus the server's entry when the refusal
 * names one, without money for a caller without Financeiro view.
 */
function passConflict(result: PassConflict, showMoney: boolean) {
  const { entry } = result;
  if (!entry) return { error: result.conflict };
  return {
    error: result.conflict,
    entry: showMoney ? entry : redactPass({ entry, treatments: [] }).entry,
  };
}

export const manejoController = new Elysia({ prefix: "/manejo" })
```
Old:
```ts
import { StartSessionUseCase } from "./useCases/Start.useCase";
```
New:
```ts
import { StartSessionUseCase } from "./useCases/Start.useCase";
import type { PassConflict } from "./_shared/session";
```
Old:
```ts
  EntryAnimalBody,
  ManejoPassBody,
```
New:
```ts
  EntryAnimalBody,
  ManejoBaixaBody,
  ManejoPassBody,
```
Old:
```ts
      const session = await new StartSessionUseCase().run({ farmId, input: body });
      if (session === "lot_not_found") return status(404, { error: session });
```
New:
```ts
      const session = await new StartSessionUseCase().run({ farmId, input: body });
      // A phone's offline id that another farm (or a discarded manejo) holds.
      if (session === "id_taken") return status(409, { error: session });
      if (session === "lot_not_found") return status(404, { error: session });
```
Old:
```ts
        // The rendimento reprices money: only Financeiro edit may set it.
        data: can(permissions, "finance", "edit") ? body : { ...body, carcassYieldPct: undefined },
      });
```
New:
```ts
        // The rendimento reprices money: only Financeiro edit may set it.
        data: can(permissions, "finance", "edit") ? body : { ...body, carcassYieldPct: undefined },
        force: body.force,
      });
```
Old:
```ts
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return can(permissions, "finance", "view") ? result : redactPass(result);
```
New:
```ts
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) {
        return status(409, passConflict(result, can(permissions, "finance", "view")));
      }
      return can(permissions, "finance", "view") ? result : redactPass(result);
```
Old (the set-aside, skip and baixa handlers learn the caller's permissions, for `passConflict`):
```ts
    "/:id/animals/:animalId/set-aside",
    async ({ farmId, params, body, status }) => {
```
New:
```ts
    "/:id/animals/:animalId/set-aside",
    async ({ farmId, permissions, params, body, status }) => {
```
Old:
```ts
    "/:id/animals/:animalId/skip",
    async ({ farmId, params, body, status }) => {
```
New:
```ts
    "/:id/animals/:animalId/skip",
    async ({ farmId, permissions, params, body, status }) => {
```
Old:
```ts
    "/:id/animals/:animalId/baixa",
    async ({ farmId, params, body, status }) => {
```
New:
```ts
    "/:id/animals/:animalId/baixa",
    async ({ farmId, permissions, params, body, status }) => {
```
Old (set-aside):
```ts
        animalId: params.animalId,
        input: body,
      });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: SetAsideBody }
```
New:
```ts
        animalId: params.animalId,
        input: body,
        force: body.force,
      });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) {
        return status(409, passConflict(result, can(permissions, "finance", "view")));
      }
      return result;
    },
    { farm: true, body: SetAsideBody }
```
Old (skip):
```ts
        notes: body.notes,
      });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
```
New:
```ts
        notes: body.notes,
        force: body.force,
      });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) {
        return status(409, passConflict(result, can(permissions, "finance", "view")));
      }
```
Old (baixa):
```ts
        animalId: params.animalId,
        input: body,
      });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) return status(409, { error: result.conflict });
      return result;
    },
    { farm: true, body: DeactivateAnimalBody }
```
New:
```ts
        animalId: params.animalId,
        input: body,
        force: body.force,
      });
      if (result === "lot_not_found") return status(404, { error: result });
      if (result === null) return status(404, { error: "not_found" });
      if ("conflict" in result) {
        return status(409, passConflict(result, can(permissions, "finance", "view")));
      }
      return result;
    },
    { farm: true, body: ManejoBaixaBody }
```

- [ ] **Step 13: CompleteAnimal tests.** In `lib/api/domains/manejo/useCases/__tests__/CompleteAnimal.test.ts`:

Old:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, lockBullStock } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Values of every `insert().values()` call. */
    inserts: [] as Record<string, unknown>[],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
```
New:
```ts
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, lockBullStock } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Values of every `insert().values()` call. */
    inserts: [] as Record<string, unknown>[],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
    /** Table of every `delete()`, in call order. */
    deletes: [] as string[],
    /** Whether the transaction ended by a throw (Postgres would roll it back). */
    rolledBack: false,
  },
```
Old:
```ts
              where: () => builder,
              returning: () => Promise.resolve([{ ...ENTRY_ROW, ...columns }]),
            };
            return builder;
          },
        })
      ),
  },
}));
```
New:
```ts
              where: () => builder,
              returning: () => Promise.resolve([{ ...ENTRY_ROW, ...columns }]),
            };
            return builder;
          },
          delete: (table: Table) => ({
            where: () => {
              state.deletes.push(getTableName(table));
              return Promise.resolve(undefined);
            },
          }),
        })
      ).catch((error: unknown) => {
        state.rolledBack = true;
        throw error;
      }),
  },
}));
```
Old:
```ts
  state.updates = [];
  lockBullStock.mockReset();
```
New:
```ts
  state.updates = [];
  state.deletes = [];
  state.rolledBack = false;
  lockBullStock.mockReset();
```
Append:
```ts
describe("completeAnimal — force over another device's pass", () => {
  const ANIMAL = { id: "a-1", earTag: "V-01", lotId: "lot-1", active: true };
  /** Another phone inseminated this cow first, with its own cobertura. */
  const DONE = { ...ENTRY_ROW, outcome: "done", notes: "outro celular", breedingId: "br-0" };
  const run = (force?: boolean) =>
    new CompleteAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      data: { semenBullId: "bull-1" },
      force,
    });

  it("without force a done entry → entry_not_actionable", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], [DONE]];

    expect(await run()).toEqual({
      conflict: "entry_not_actionable",
      entry: expect.objectContaining({ earTag: "V-01", outcome: "done", notes: "outro celular" }),
    });
    expect(state.updates).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("force on a closed session → session_closed", async () => {
    state.selectResults = [[{ ...SESSION_ROW, status: "closed" }], [ANIMAL], [DONE]];

    expect(await run(true)).toEqual({
      conflict: "session_closed",
      entry: expect.objectContaining({ earTag: "V-01", outcome: "done" }),
    });
    expect(lockBullStock).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });

  it("force on a done entry reverts then applies", async () => {
    // lockEntry's three reads, then the undo's cobertura lock and its diagnoses.
    state.selectResults = [[SESSION_ROW], [ANIMAL], [DONE], [{ id: "br-0" }], []];
    lockBullStock.mockResolvedValue({ bull: BULL_ROW, bought: 10, used: 9, left: 1 });

    const result = await run(true);

    expect(state.updates[0]).toMatchObject({ outcome: "pending", breedingId: null, notes: null });
    expect(state.deletes).toEqual(["breedings"]);
    expect(state.inserts[0]).toMatchObject({ animalId: "a-1", semenBullId: "bull-1" });
    expect(state.updates.at(-1)).toMatchObject({ outcome: "done", breedingId: state.inserts[0].id });
    expect(result).toMatchObject({ entry: { earTag: "V-01", outcome: "done" } });
    expect(state.rolledBack).toBe(false);
  });

  it("force answers has_diagnosis and writes nothing when the other cobertura was diagnosed", async () => {
    state.selectResults = [
      [SESSION_ROW],
      [ANIMAL],
      [DONE],
      [{ id: "br-0" }],
      [{ breedingId: "br-0", result: "pregnant" }],
    ];

    expect(await run(true)).toEqual({ conflict: "has_diagnosis", breedingId: "br-0" });
    expect(state.updates).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("rolls the undo back when the forced pass is then refused", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], [DONE], [{ id: "br-0" }], []];
    lockBullStock.mockResolvedValue({ bull: BULL_ROW, bought: 10, used: 10, left: 0 });

    expect(await run(true)).toEqual({ conflict: "out_of_stock" });
    expect(state.rolledBack).toBe(true);
  });
});
```

- [ ] **Step 14: SetAsideAnimal tests.** In `lib/api/domains/manejo/useCases/__tests__/SetAsideAnimal.test.ts`:

Old:
```ts
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
}));
```
New:
```ts
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
    /** Whether the transaction ended by a throw (Postgres would roll it back). */
    rolledBack: false,
  },
}));
```
Old:
```ts
              returning: () => Promise.resolve([{ ...PENDING_ENTRY, ...columns }]),
            };
            return builder;
          },
        })
      ),
  },
}));
```
New:
```ts
              returning: () => Promise.resolve([{ ...PENDING_ENTRY, ...columns }]),
            };
            return builder;
          },
        })
      ).catch((error: unknown) => {
        state.rolledBack = true;
        throw error;
      }),
  },
}));
```
Old:
```ts
beforeEach(() => {
  state.selectResults = [];
  state.writes = [];
  state.updates = [];
});
```
New:
```ts
beforeEach(() => {
  state.selectResults = [];
  state.writes = [];
  state.updates = [];
  state.rolledBack = false;
});
```
Old (the existing no-force case now carries the server's entry):
```ts
  it("refuses an entry already completed", async () => {
    state.selectResults = passRows(SESSION_ROW, ACTIVE_ANIMAL, { ...PENDING_ENTRY, outcome: "done" });

    const result = await new SetAsideAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      input: { list: "held" },
    });

    expect(result).toEqual({ conflict: "entry_not_actionable" });
```
New:
```ts
  it("refuses an entry already completed", async () => {
    state.selectResults = passRows(SESSION_ROW, ACTIVE_ANIMAL, { ...PENDING_ENTRY, outcome: "done" });

    const result = await new SetAsideAnimalUseCase().run({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      input: { list: "held" },
    });

    expect(result).toEqual({
      conflict: "entry_not_actionable",
      entry: expect.objectContaining({ earTag: "V-01", outcome: "done" }),
    });
```
Append (the no-force case is the existing "refuses an entry already completed"):
```ts
describe("setAsideAnimal — force over another device's pass", () => {
  /** Another phone sold this animal first: pesagem kept, animal out of the herd. */
  const SOLD_ENTRY = { ...PENDING_ENTRY, outcome: "done", weighingId: 5, amountBrl: 4200 };
  const SOLD_ANIMAL = { ...ACTIVE_ANIMAL, active: false };
  const run = (input: { list: "rejected" | "held" }) =>
    new SetAsideAnimalUseCase().run({ farmId: 7, sessionId: "s-1", animalId: "a-1", input, force: true });

  it("force on a done entry reverts then applies", async () => {
    state.selectResults = passRows(SESSION_ROW, SOLD_ANIMAL, SOLD_ENTRY);

    const result = await run({ list: "held" });

    // The undo drops the other pass's pesagem, puts the animal back in the
    // herd and resets the entry; then the dúvida is written.
    expect(state.writes).toEqual([
      "update weighings",
      "update animals",
      "update manejo_session_animals",
      "update manejo_session_animals",
    ]);
    expect(state.updates[1]).toMatchObject({ active: true });
    expect(state.updates.at(-1)).toMatchObject({ outcome: "held" });
    expect(result).toMatchObject({ entry: { earTag: "V-01", outcome: "held" } });
  });

  it("force on a closed session → session_closed", async () => {
    state.selectResults = passRows({ ...SESSION_ROW, status: "closed" }, ACTIVE_ANIMAL, SOLD_ENTRY);

    expect(await run({ list: "held" })).toEqual({
      conflict: "session_closed",
      entry: expect.objectContaining({ earTag: "V-01", outcome: "done", amountBrl: 4200 }),
    });
    expect(state.writes).toEqual([]);
  });

  it("rolls the undo back when a dúvida's animal had a baixa elsewhere", async () => {
    state.selectResults = passRows(SESSION_ROW, SOLD_ANIMAL, { ...PENDING_ENTRY, outcome: "held" });

    expect(await run({ list: "rejected" })).toEqual({ conflict: "animal_inactive" });
    expect(state.rolledBack).toBe(true);
  });
});
```

- [ ] **Step 15: Create `lib/api/domains/manejo/useCases/__tests__/SkipAnimal.test.ts`.**
```ts
/**
 * skipAnimal: the animal did not pass the chute. With `force`, a pass another
 * device already wrote is undone first, in the same transaction, and the skip
 * is written over it.
 *
 * Same chainable db stub as ReopenAnimal.test.ts: selects answer from a queued
 * list of rows, and every write lands in one log, in call order, with its table.
 */
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rows each `select()` resolves to, in call order. */
    selectResults: [] as Record<string, unknown>[][],
    /** Every write issued: `update <table>` or `delete <table>`, in call order. */
    writes: [] as string[],
    /** Columns of every `update().set()` call. */
    updates: [] as Record<string, unknown>[],
  },
}));

function selectBuilder() {
  const rows = state.selectResults.shift() ?? [];
  const builder = {
    from: () => builder,
    where: () => builder,
    for: () => builder,
    limit: () => builder,
    then: (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows),
  };
  return builder;
}

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (run: (tx: unknown) => unknown) =>
      Promise.resolve(
        run({
          select: selectBuilder,
          update: (table: Table) => {
            state.writes.push(`update ${getTableName(table)}`);
            let columns: Record<string, unknown> = {};
            const builder = {
              set(set: Record<string, unknown>) {
                columns = set;
                state.updates.push(set);
                return builder;
              },
              where: () => builder,
              returning: () => Promise.resolve([{ ...PENDING_ENTRY, ...columns }]),
            };
            return builder;
          },
          delete: (table: Table) => ({
            where: () => {
              state.writes.push(`delete ${getTableName(table)}`);
              return Promise.resolve(undefined);
            },
          }),
        })
      ),
  },
}));

import { SkipAnimalUseCase } from "../SkipAnimal.useCase";

const SESSION_ROW = { id: "s-1", farmId: 7, date: "2026-09-25", status: "open", kind: "health", weighing: false };

const PENDING_ENTRY = {
  sessionId: "s-1",
  animalId: "a-1",
  position: 0,
  outcome: "pending",
  weightKg: null,
  notes: null,
  amountBrl: null,
  carcassYieldPct: null,
  previousLotId: null,
  createdAnimal: false,
  treatmentId: null,
  boosterId: null,
  weighingId: null,
  breedingId: null,
};

/** Another phone vaccinated this animal first. */
const DONE_ENTRY = { ...PENDING_ENTRY, outcome: "done", treatmentId: "t-1" };

const ANIMAL = { id: "a-1", earTag: "V-01", lotId: "lot-1", active: true };

const run = (force?: boolean) =>
  new SkipAnimalUseCase().run({ farmId: 7, sessionId: "s-1", animalId: "a-1", notes: " mancando ", force });

beforeEach(() => {
  state.selectResults = [];
  state.writes = [];
  state.updates = [];
});

describe("skipAnimal", () => {
  it("skips a pending animal with its note", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], [PENDING_ENTRY]];

    const result = await run();

    expect(state.writes).toEqual(["update manejo_session_animals"]);
    expect(state.updates[0]).toEqual({ outcome: "skipped", notes: "mancando" });
    expect(result).toMatchObject({ earTag: "V-01", outcome: "skipped", notes: "mancando" });
  });

  it("without force a done entry → entry_not_actionable", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], [DONE_ENTRY]];

    expect(await run()).toEqual({
      conflict: "entry_not_actionable",
      entry: expect.objectContaining({ earTag: "V-01", outcome: "done", treatmentId: "t-1" }),
    });
    expect(state.writes).toEqual([]);
  });

  it("force on a done entry reverts then applies", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], [DONE_ENTRY]];

    const result = await run(true);

    expect(state.writes).toEqual([
      "update manejo_session_animals",
      "delete treatments",
      "update manejo_session_animals",
    ]);
    expect(state.updates[0]).toMatchObject({ outcome: "pending", treatmentId: null });
    expect(state.updates[1]).toEqual({ outcome: "skipped", notes: "mancando" });
    expect(result).toMatchObject({ earTag: "V-01", outcome: "skipped" });
  });

  it("force on a closed session → session_closed", async () => {
    state.selectResults = [[{ ...SESSION_ROW, status: "closed" }], [ANIMAL], [DONE_ENTRY]];

    expect(await run(true)).toEqual({
      conflict: "session_closed",
      entry: expect.objectContaining({ earTag: "V-01", outcome: "done" }),
    });
    expect(state.writes).toEqual([]);
  });

  it("force keeps a diagnosed cobertura: has_diagnosis, nothing written", async () => {
    state.selectResults = [
      [{ ...SESSION_ROW, kind: "insemination" }],
      [ANIMAL],
      [{ ...DONE_ENTRY, treatmentId: null, breedingId: "br-1" }],
      [{ id: "br-1" }],
      [{ breedingId: "br-1", result: "open" }],
    ];

    expect(await run(true)).toEqual({ conflict: "has_diagnosis", breedingId: "br-1" });
    expect(state.writes).toEqual([]);
  });
});
```

- [ ] **Step 16: BaixaAnimal tests.** In `lib/api/domains/manejo/useCases/__tests__/BaixaAnimal.test.ts` (the no-force case is the existing "refuses a pass that already left the queue"; it and "refuses a closed session" now carry the server's entry):

Old:
```ts
    expect(await run()).toEqual({ conflict: "entry_not_actionable" });
```
New:
```ts
    expect(await run()).toEqual({
      conflict: "entry_not_actionable",
      entry: expect.objectContaining({ earTag: "1244", outcome: "done" }),
    });
```
Old:
```ts
    expect(await run()).toEqual({ conflict: "session_not_open" });
```
New:
```ts
    expect(await run()).toEqual({
      conflict: "session_not_open",
      entry: expect.objectContaining({ earTag: "1244", outcome: "pending" }),
    });
```

Old:
```ts
const run = () =>
  new BaixaAnimalUseCase().run({ farmId: 7, sessionId: "s-1", animalId: "a-1", input: BAIXA });
```
New:
```ts
const run = () =>
  new BaixaAnimalUseCase().run({ farmId: 7, sessionId: "s-1", animalId: "a-1", input: BAIXA });

const runForced = () =>
  new BaixaAnimalUseCase().run({ farmId: 7, sessionId: "s-1", animalId: "a-1", input: BAIXA, force: true });
```
Append:
```ts
describe("baixaAnimal — force over another device's pass", () => {
  /** Another phone weighed this animal first. */
  const DONE_ENTRY = { ...PENDING_ENTRY, outcome: "done", weightKg: 300, weighingId: 5 };

  it("force on a done entry reverts then applies", async () => {
    state.selectResults = [[SESSION_ROW], [ANIMAL], [DONE_ENTRY]];

    const result = await runForced();

    expect(state.writes).toEqual([
      "update weighings",
      "update manejo_session_animals",
      "update animals",
      "update manejo_session_animals",
    ]);
    expect(state.updates[1]).toMatchObject({ outcome: "pending", weighingId: null });
    expect(state.updates.at(-1)).toEqual({
      outcome: "skipped",
      notes: "Baixa · Morte · quebrou a perna no brete",
    });
    expect(result).toMatchObject({ animal: { earTag: "1244", active: false, inactiveReason: "death" } });
  });

  it("force on a closed session → session_closed", async () => {
    state.selectResults = [[{ ...SESSION_ROW, status: "closed" }], [ANIMAL], [DONE_ENTRY]];

    expect(await runForced()).toEqual({
      conflict: "session_closed",
      entry: expect.objectContaining({ earTag: "1244", outcome: "done", weightKg: 300 }),
    });
    expect(state.writes).toEqual([]);
  });

  it("keeps animal_inactive over another device's baixa, even with force", async () => {
    state.selectResults = [
      [SESSION_ROW],
      [{ ...ANIMAL, active: false }],
      [{ ...PENDING_ENTRY, outcome: "skipped", notes: "Baixa · Perda" }],
    ];

    expect(await runForced()).toEqual({ conflict: "animal_inactive" });
    expect(state.writes).toEqual([]);
  });
});
```

- [ ] **Step 17: Controller tests.** In `lib/api/domains/manejo/__tests__/manejo.controller.test.ts`:

Old:
```ts
const { reopen, remove, complete, setAside, close } = vi.hoisted(() => ({
  reopen: vi.fn(),
  remove: vi.fn(),
  complete: vi.fn(),
  setAside: vi.fn(),
  close: vi.fn(),
}));
```
New:
```ts
const { reopen, remove, complete, setAside, close, start, skip } = vi.hoisted(() => ({
  reopen: vi.fn(),
  remove: vi.fn(),
  complete: vi.fn(),
  setAside: vi.fn(),
  close: vi.fn(),
  start: vi.fn(),
  skip: vi.fn(),
}));
```
Old:
```ts
vi.mock("../useCases/Close.useCase", () => ({
  CloseSessionUseCase: class {
    run = close;
  },
}));
```
New:
```ts
vi.mock("../useCases/Close.useCase", () => ({
  CloseSessionUseCase: class {
    run = close;
  },
}));
vi.mock("../useCases/Start.useCase", () => ({
  StartSessionUseCase: class {
    run = start;
  },
}));
vi.mock("../useCases/SkipAnimal.useCase", () => ({
  SkipAnimalUseCase: class {
    run = skip;
  },
}));
```
Old:
```ts
  close.mockReset();
  permState.current = undefined;
```
New:
```ts
  close.mockReset();
  start.mockReset();
  skip.mockReset();
  permState.current = undefined;
```
Append:
```ts
describe("POST /manejo with the id a phone made up offline", () => {
  const BODY = {
    id: "0b7f2c1e-8a4d-4c3b-9f1e-2d5a6b7c8d9e",
    date: "2026-09-25",
    kind: "weighing",
    earTags: ["V-01"],
    weighing: true,
  };

  it("answers 409 id_taken when another farm holds the id", async () => {
    start.mockResolvedValue("id_taken");

    expect(await call("POST", "/manejo", BODY)).toEqual({ status: 409, body: { error: "id_taken" } });
    expect(start).toHaveBeenCalledWith({ farmId: 7, input: BODY });
  });

  it("refuses an id that is not a uuid before the use case runs", async () => {
    const response = await manejoController.handle(
      new Request("http://localhost/manejo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...BODY, id: "s-1" }),
      })
    );

    expect(response.status).toBe(422);
    expect(start).not.toHaveBeenCalled();
  });
});

describe("a forced pass", () => {
  it("forwards force on complete and answers 409 session_closed", async () => {
    complete.mockResolvedValue({ conflict: "session_closed" });

    expect(
      await call("POST", "/manejo/s-1/animals/a-1/complete", { weightKg: 500, force: true })
    ).toEqual({ status: 409, body: { error: "session_closed" } });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
  });

  it("forwards force on skip and answers 409 session_closed", async () => {
    skip.mockResolvedValue({ conflict: "session_closed" });

    expect(await call("POST", "/manejo/s-1/animals/a-1/skip", { force: true })).toEqual({
      status: 409,
      body: { error: "session_closed" },
    });
    expect(skip).toHaveBeenCalledWith({
      farmId: 7,
      sessionId: "s-1",
      animalId: "a-1",
      notes: undefined,
      force: true,
    });
  });

  it("answers 409 with the server's entry, its valor hidden without Financeiro", async () => {
    const { PRESETS } = await import("@/lib/domain/permissions");
    permState.current = PRESETS.vaqueiro;
    const entry = { earTag: "V-01", outcome: "done", weightKg: 299, amountBrl: 4200 };
    setAside.mockResolvedValue({ conflict: "entry_not_actionable", entry });

    expect(await call("POST", "/manejo/s-1/animals/a-1/set-aside", { list: "held" })).toEqual({
      status: 409,
      body: { error: "entry_not_actionable", entry: { earTag: "V-01", outcome: "done", weightKg: 299 } },
    });
  });

  it("answers 404 on set-aside when the undo finds the old lot gone", async () => {
    setAside.mockResolvedValue("lot_not_found");

    expect(
      await call("POST", "/manejo/s-1/animals/a-1/set-aside", { list: "held", force: true })
    ).toEqual({ status: 404, body: { error: "lot_not_found" } });
  });
});
```

- [ ] **Step 18: Run the manejo suite and the route snapshots.**
Run: `pnpm vitest run lib/api/domains/manejo --exclude '**/worktrees/**'`
Expected: every file passes, including the unchanged `ReopenAnimal.test.ts`, `discardedSession.test.ts`, `Delete.test.ts`, `Close.test.ts` and `SetCarcassYield.test.ts`.
Run: `pnpm vitest run lib/api/__tests__/routeRequirements.test.ts lib/api/__tests__/routeTable.test.ts --exclude '**/worktrees/**'`
Expected: both pass with no snapshot written (no route added or renamed). Do not pass `-u`.

- [ ] **Step 19: Types and lint.**
Run: `pnpm tsc --noEmit`. Expected: no errors. If Eden call sites in `lib/store/useHerdStore.ts` complain about the new 404 on skip/set-aside/baixa, they already treat any `error` generically. Report it instead of editing the store (T6/T9 own it).
Run: `pnpm exec eslint lib/api/domains/manejo`. Expected: no problems.

- [ ] **Step 20: Commit by pathspec (no trailers).**
```bash
cd /home/luketa/meubov
FILES="lib/api/domains/manejo/schemas/manejo.schema.ts lib/api/domains/manejo/manejo.controller.ts lib/api/domains/manejo/_shared/session.ts lib/api/domains/manejo/_shared/revert.ts lib/api/domains/manejo/useCases/Start.useCase.ts lib/api/domains/manejo/useCases/CompleteAnimal.useCase.ts lib/api/domains/manejo/useCases/SetAsideAnimal.useCase.ts lib/api/domains/manejo/useCases/SkipAnimal.useCase.ts lib/api/domains/manejo/useCases/BaixaAnimal.useCase.ts lib/api/domains/manejo/useCases/ReopenAnimal.useCase.ts lib/api/domains/manejo/__tests__/manejo.controller.test.ts lib/api/domains/manejo/useCases/__tests__/Start.test.ts lib/api/domains/manejo/useCases/__tests__/CompleteAnimal.test.ts lib/api/domains/manejo/useCases/__tests__/SetAsideAnimal.test.ts lib/api/domains/manejo/useCases/__tests__/SkipAnimal.test.ts lib/api/domains/manejo/useCases/__tests__/BaixaAnimal.test.ts lib/api/domains/manejo/useCases/__tests__/revert.test.ts"
git add $FILES
git commit -m "feat(offline): accept a phone-generated manejo id and force a pass over another device's" -- $FILES
git show --stat HEAD | tail -20
```
Expected: one commit with the 17 files above. The message has no `Co-Authored-By` or other trailer.

**Notes for the sync task (T8):** without `force`, a pass on a session that another device closed still answers 409 `session_not_open`, as it does online today. That code is not in the contract's conflict list, so T8 should add `session_not_open` to its conflict set with `sessionClosed: true`. Otherwise the replay turns it into a falha. A forced pass that undoes a sale or transfer returns only its own response. The undo's animal patch is folded into `animal` for complete, but skip's entry-only response does not carry it, so the `reloadHerd` after the batch covers it.

---

### Task 6: Merge helpers extracted from the store

**Files:**
- Create: `lib/store/manejoMerge.ts`
- Modify: `lib/store/useHerdStore.ts`: the type import (`ReproductionRecord` at line 26), `PassAnimalPatch` (lines 95-100), `compareByDate` (lines 501-502), `EMPTY_REPRODUCTION` / `withReproduction` / `withSessionAnimal` (lines 540-571), and the `set(...)` bodies of `startManejoSession` (801), `completeManejoAnimal` (809), `skipManejoAnimal` (874), `setAsideManejoAnimal` (887), `baixaManejoAnimal` (922), `reopenManejoAnimal` (960), `setSaleCarcassYield` (1075), `closeManejoSession` (1101). Line numbers are from commit `2502844`. Task 4 edits `load`/`reloadHerd` in the same file, so match the hunks by text, not by line.
- Test: `lib/store/__tests__/manejoMerge.test.ts`

**Interfaces:**
- Consumes: `lib/types.ts` with Task 3's markers (`ManejoSessionAnimal.pending?`, `ManejoSessionAnimal.localOpId?`, `Treatment.localOpId?`, `Weighing.localOpId?`, `Breeding.localOpId?`, `ManejoSession.pending?`).
- Produces (`lib/store/manejoMerge.ts`):
```ts
export type HerdSlices = Pick<HerdData, "animals" | "treatments" | "manejoSessions" | "semenBulls">;
export interface PassAnimalPatch { earTag: string; active: boolean; lotId: string }
export interface CompleteResult { entry: ManejoSessionAnimal; treatments: Treatment[]; weighing?: Weighing; animal?: PassAnimalPatch; breeding?: Breeding }
export interface SetAsideResult { entry: ManejoSessionAnimal; weighing?: Weighing }
export type BaixaAnimalPatch = Pick<Animal, "active" | "inactiveReason" | "inactiveDate" | "inactiveNotes">;
export interface ReopenResult { entry: ManejoSessionAnimal; removedTreatmentIds: string[]; removedWeighing?: Weighing; animal?: PassAnimalPatch; removedEarTag?: string; removedBreedingId?: string }
export interface CarcassYieldResult { carcassYieldPct: number; amounts: { earTag: string; amountBrl: number }[] }
export const compareByDate: (a: { date: string }, b: { date: string }) => number;
export function withReproduction(animals: Animal[], earTag: string, update: (record: ReproductionRecord) => ReproductionRecord): Animal[];
export function mergeCompleteResult(s: HerdSlices, sessionId: string, earTag: string, r: CompleteResult): HerdSlices;
export function mergeSkipResult(s: HerdSlices, sessionId: string, earTag: string, entry: ManejoSessionAnimal): HerdSlices;
export function mergeSetAsideResult(s: HerdSlices, sessionId: string, earTag: string, r: SetAsideResult): HerdSlices;
export function mergeBaixaResult(s: HerdSlices, sessionId: string, earTag: string, r: { entry: ManejoSessionAnimal; animal: BaixaAnimalPatch }): HerdSlices;
export function mergeReopenResult(s: HerdSlices, sessionId: string, earTag: string, r: ReopenResult): HerdSlices;
export function mergeCarcassYield(s: HerdSlices, sessionId: string, r: CarcassYieldResult): HerdSlices;
export function mergeClose(s: HerdSlices, sessionId: string): HerdSlices;
export function mergeStart(s: HerdSlices, session: ManejoSession): HerdSlices;
export function stripLocal(s: HerdSlices, localOpId: string, opts?: { startedSessionId?: string }): HerdSlices;
```
Every helper returns `{ ...s, <changed slices> }`, so `set((s) => mergeX(s, …))` in the store merges exactly what the old inline body returned. `withSessionAnimal` and `EMPTY_REPRODUCTION` move here and stay private. `withReproduction` and `compareByDate` move here and are exported, because the store still uses them in other actions. Only one copy of each remains. This module imports types only from `lib/types.ts`, never from the store, so there is no import cycle.

`stripLocal` does more than the contract's one-liner, on purpose. When the stripped entry is a local transfer or sale pass, it also puts the animal back the way the server's `ReopenAnimal` does: `lotId` goes back to `entry.previousLotId`, and a sale that was `done` gets `active: true` again with `inactiveReason`/`inactiveDate` cleared. Without this, undoing a queued transfer offline would leave the animal in the new lot. A local baixa is not restored, which matches online, where a baixa cannot be undone either.

- [ ] **Step 1: Write the failing test**

`lib/store/__tests__/manejoMerge.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  mergeBaixaResult,
  mergeCarcassYield,
  mergeClose,
  mergeCompleteResult,
  mergeReopenResult,
  mergeSetAsideResult,
  mergeSkipResult,
  mergeStart,
  stripLocal,
  type HerdSlices,
} from "@/lib/store/manejoMerge";
import type { Animal, ManejoSession, Treatment } from "@/lib/types";

const cow = (earTag: string, over: Partial<Animal> = {}): Animal => ({
  id: `id-${earTag}`,
  earTag,
  category: "cow",
  breed: "Nelore",
  sex: "female",
  birthDate: "2022-01-01",
  lotId: "lot-a",
  active: true,
  weighings: [
    { id: 1, date: "2026-01-10", weightKg: 400 },
    { id: 2, date: "2026-09-01", weightKg: 430 },
  ],
  ...over,
});

const session = (over: Partial<ManejoSession> = {}): ManejoSession => ({
  id: "s1",
  name: "Vacina aftosa",
  date: "2026-05-02",
  status: "open",
  kind: "health",
  weighing: true,
  animals: [
    { earTag: "101", outcome: "pending" },
    { earTag: "102", outcome: "pending" },
  ],
  ...over,
});

const treatment = (id: string, over: Partial<Treatment> = {}): Treatment => ({
  id,
  animalEarTag: "101",
  type: "vaccine",
  name: "Vacina aftosa",
  date: "2026-05-02",
  status: "done",
  withdrawalDays: 0,
  ...over,
});

const slices = (over: Partial<HerdSlices> = {}): HerdSlices => ({
  animals: [cow("101"), cow("102")],
  treatments: [treatment("t0", { animalEarTag: "102" })],
  manejoSessions: [session()],
  semenBulls: [],
  ...over,
});

const entryOf = (s: HerdSlices, earTag: string) =>
  s.manejoSessions[0].animals.find((a) => a.earTag === earTag);
const animalOf = (s: HerdSlices, earTag: string) => s.animals.find((a) => a.earTag === earTag)!;

describe("mergeCompleteResult", () => {
  it("replaces the entry, appends treatments, sorts the weighing in, patches the animal and appends the breeding", () => {
    const before = slices();
    const after = mergeCompleteResult(before, "s1", "101", {
      entry: { earTag: "101", outcome: "done", weightKg: 415 },
      treatments: [treatment("t1")],
      weighing: { id: 3, date: "2026-05-02", weightKg: 415 },
      animal: { earTag: "101", active: true, lotId: "lot-b" },
      breeding: { id: "b1", date: "2026-05-02", type: "timedAI", bullEarTag: "NEL-1", semenBullId: "bull-1" },
    });
    expect(entryOf(after, "101")).toEqual({ earTag: "101", outcome: "done", weightKg: 415 });
    expect(entryOf(after, "102")).toEqual({ earTag: "102", outcome: "pending" });
    expect(after.treatments.map((t) => t.id)).toEqual(["t0", "t1"]);
    const a = animalOf(after, "101");
    expect(a.weighings.map((w) => w.date)).toEqual(["2026-01-10", "2026-05-02", "2026-09-01"]);
    expect(a.lotId).toBe("lot-b");
    expect(a.reproduction?.breedings.map((b) => b.id)).toEqual(["b1"]);
    expect(animalOf(after, "102")).toBe(before.animals[1]);
  });
});

describe("mergeSkipResult", () => {
  it("replaces only the entry", () => {
    const before = slices();
    const after = mergeSkipResult(before, "s1", "102", { earTag: "102", outcome: "skipped", notes: "mancando" });
    expect(entryOf(after, "102")).toEqual({ earTag: "102", outcome: "skipped", notes: "mancando" });
    expect(after.animals).toBe(before.animals);
    expect(after.treatments).toBe(before.treatments);
  });
});

describe("mergeSetAsideResult", () => {
  it("replaces the entry and sorts the weighing in", () => {
    const after = mergeSetAsideResult(slices(), "s1", "101", {
      entry: { earTag: "101", outcome: "rejected", weightKg: 380 },
      weighing: { id: 9, date: "2026-05-02", weightKg: 380 },
    });
    expect(entryOf(after, "101")?.outcome).toBe("rejected");
    expect(animalOf(after, "101").weighings.map((w) => w.id)).toEqual([1, 9, 2]);
  });
});

describe("mergeBaixaResult", () => {
  it("takes the animal out of the herd and replaces the entry", () => {
    const after = mergeBaixaResult(slices(), "s1", "101", {
      entry: { earTag: "101", outcome: "skipped", notes: "Baixa · Morte" },
      animal: { active: false, inactiveReason: "death", inactiveDate: "2026-05-02" },
    });
    expect(animalOf(after, "101")).toMatchObject({ active: false, inactiveReason: "death", inactiveDate: "2026-05-02" });
    expect(entryOf(after, "101")?.notes).toBe("Baixa · Morte");
  });
});

describe("mergeReopenResult", () => {
  it("removes what the server lists and puts the animal back", () => {
    const before = slices({
      animals: [
        cow("101", {
          lotId: "lot-b",
          weighings: [
            { id: 1, date: "2026-01-10", weightKg: 400 },
            { id: 3, date: "2026-05-02", weightKg: 415 },
          ],
          reproduction: {
            breedings: [{ id: "b1", date: "2026-05-02", type: "timedAI", bullEarTag: "NEL-1" }],
            diagnoses: [],
            calvings: [],
          },
        }),
        cow("102"),
      ],
      treatments: [treatment("t0", { animalEarTag: "102" }), treatment("t1")],
      manejoSessions: [session({ animals: [{ earTag: "101", outcome: "done" }, { earTag: "102", outcome: "pending" }] })],
    });
    const after = mergeReopenResult(before, "s1", "101", {
      entry: { earTag: "101", outcome: "pending" },
      removedTreatmentIds: ["t1"],
      removedWeighing: { date: "2026-05-02", weightKg: 415 },
      animal: { earTag: "101", active: true, lotId: "lot-a" },
      removedBreedingId: "b1",
    });
    expect(after.treatments.map((t) => t.id)).toEqual(["t0"]);
    const a = animalOf(after, "101");
    expect(a.weighings.map((w) => w.id)).toEqual([1]);
    expect(a.reproduction?.breedings).toEqual([]);
    expect(a.lotId).toBe("lot-a");
    expect(entryOf(after, "101")).toEqual({ earTag: "101", outcome: "pending" });
  });

  it("unregisters the animal an entry pass created", () => {
    const after = mergeReopenResult(slices(), "s1", "102", {
      entry: { earTag: "102", outcome: "pending" },
      removedTreatmentIds: [],
      removedEarTag: "102",
    });
    expect(after.animals.map((a) => a.earTag)).toEqual(["101"]);
    expect(after.manejoSessions[0].animals.map((a) => a.earTag)).toEqual(["101"]);
  });
});

describe("mergeCarcassYield", () => {
  it("sets the yield and the amounts it listed", () => {
    const after = mergeCarcassYield(
      slices({ manejoSessions: [session({ kind: "sale", animals: [{ earTag: "101", outcome: "done", amountBrl: 1 }, { earTag: "102", outcome: "pending" }] })] }),
      "s1",
      { carcassYieldPct: 52, amounts: [{ earTag: "101", amountBrl: 3000 }] }
    );
    expect(after.manejoSessions[0].carcassYieldPct).toBe(52);
    expect(entryOf(after, "101")?.amountBrl).toBe(3000);
    expect(entryOf(after, "102")?.amountBrl).toBeUndefined();
  });
});

describe("mergeClose", () => {
  it("flips the session to closed", () => {
    expect(mergeClose(slices(), "s1").manejoSessions[0].status).toBe("closed");
  });
});

describe("mergeStart", () => {
  it("appends the session", () => {
    const after = mergeStart(slices(), session({ id: "s2" }));
    expect(after.manejoSessions.map((m) => m.id)).toEqual(["s1", "s2"]);
  });
});

describe("stripLocal", () => {
  const op = "op-1";
  const marked = (): HerdSlices =>
    slices({
      animals: [
        cow("101", {
          lotId: "lot-b",
          weighings: [
            { id: 1, date: "2026-01-10", weightKg: 400 },
            { id: -5, date: "2026-05-02", weightKg: 415, localOpId: op },
          ],
          reproduction: {
            breedings: [
              { id: "b0", date: "2025-11-02", type: "timedAI", bullEarTag: "NEL-1" },
              { id: "local:x", date: "2026-05-02", type: "timedAI", bullEarTag: "NEL-1", localOpId: op },
            ],
            diagnoses: [],
            calvings: [],
          },
        }),
        cow("102"),
      ],
      treatments: [treatment("t0", { animalEarTag: "102" }), treatment("local:y", { localOpId: op }), treatment("local:z", { localOpId: "op-2" })],
      manejoSessions: [
        session({
          kind: "transfer",
          animals: [
            { earTag: "101", outcome: "done", weightKg: 415, previousLotId: "lot-a", pending: true, localOpId: op },
            { earTag: "102", outcome: "skipped", pending: true, localOpId: "op-2" },
          ],
        }),
      ],
    });

  it("removes the records with the marker, resets its entry, puts the animal back, and leaves the rest", () => {
    const after = stripLocal(marked(), op);
    expect(after.treatments.map((t) => t.id)).toEqual(["t0", "local:z"]);
    const a = animalOf(after, "101");
    expect(a.weighings.map((w) => w.id)).toEqual([1]);
    expect(a.reproduction?.breedings.map((b) => b.id)).toEqual(["b0"]);
    expect(a.lotId).toBe("lot-a");
    expect(entryOf(after, "101")).toEqual({ earTag: "101", outcome: "pending" });
    expect(entryOf(after, "102")).toEqual({ earTag: "102", outcome: "skipped", pending: true, localOpId: "op-2" });
  });

  it("puts a sold animal back in the herd", () => {
    const s = slices({
      animals: [cow("101", { active: false }), cow("102")],
      manejoSessions: [session({ kind: "sale", animals: [{ earTag: "101", outcome: "done", pending: true, localOpId: op }] })],
    });
    expect(animalOf(stripLocal(s, op), "101").active).toBe(true);
  });

  it("removes the pending session its start op created", () => {
    const s = slices({ manejoSessions: [session(), session({ id: "s2", pending: true })] });
    expect(stripLocal(s, op, { startedSessionId: "s2" }).manejoSessions.map((m) => m.id)).toEqual(["s1"]);
  });

  it("returns the same animals when nothing carries the marker", () => {
    const before = slices();
    expect(stripLocal(before, "nobody").animals).toEqual(before.animals);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `pnpm vitest run lib/store/__tests__/manejoMerge.test.ts --exclude '**/worktrees/**'`
Expected: FAIL. The module `@/lib/store/manejoMerge` does not resolve.

- [ ] **Step 3: Create the helpers**

`lib/store/manejoMerge.ts`:
```ts
/**
 * Pure merges of the manejo actions' answers into the herd store's slices. The
 * online actions and the offline sync reconcile through these same functions,
 * so a pass lands in the store the same way whichever path it took.
 */
import type {
  Animal,
  Breeding,
  HerdData,
  ManejoSession,
  ManejoSessionAnimal,
  ReproductionRecord,
  Treatment,
  Weighing,
} from "@/lib/types";

/** The store slices a manejo pass can touch. */
export type HerdSlices = Pick<HerdData, "animals" | "treatments" | "manejoSessions" | "semenBulls">;

/** Herd change a manejo pass applied to one animal (lot, herd membership). */
export interface PassAnimalPatch {
  earTag: string;
  active: boolean;
  lotId: string;
}

/** Answer of a completed pass. */
export interface CompleteResult {
  entry: ManejoSessionAnimal;
  treatments: Treatment[];
  weighing?: Weighing;
  animal?: PassAnimalPatch;
  breeding?: Breeding;
}

/** Answer of a refugo / dúvida. */
export interface SetAsideResult {
  entry: ManejoSessionAnimal;
  weighing?: Weighing;
}

/** What a baixa at the brete changed on the animal. */
export type BaixaAnimalPatch = Pick<Animal, "active" | "inactiveReason" | "inactiveDate" | "inactiveNotes">;

/** Answer of an undone pass. */
export interface ReopenResult {
  entry: ManejoSessionAnimal;
  removedTreatmentIds: string[];
  removedWeighing?: Weighing;
  animal?: PassAnimalPatch;
  removedEarTag?: string;
  removedBreedingId?: string;
}

/** Answer of a new rendimento de carcaça on a venda. */
export interface CarcassYieldResult {
  carcassYieldPct: number;
  amounts: { earTag: string; amountBrl: number }[];
}

export const compareByDate = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

/** A female with no reproduction history yet — she can still receive records. */
const EMPTY_REPRODUCTION: ReproductionRecord = {
  breedings: [],
  diagnoses: [],
  calvings: [],
};

/** Immutably updates one female's reproduction record, creating it if absent. */
export function withReproduction(
  animals: Animal[],
  earTag: string,
  update: (record: ReproductionRecord) => ReproductionRecord
): Animal[] {
  return animals.map((a) =>
    a.earTag === earTag
      ? { ...a, reproduction: update(a.reproduction ?? EMPTY_REPRODUCTION) }
      : a
  );
}

/** Immutably replaces one animal entry inside one session. */
function withSessionAnimal(
  sessions: ManejoSession[],
  sessionId: string,
  earTag: string,
  entry: ManejoSessionAnimal
): ManejoSession[] {
  return sessions.map((m) =>
    m.id === sessionId
      ? { ...m, animals: m.animals.map((a) => (a.earTag === earTag ? entry : a)) }
      : m
  );
}

/** Appends one weighing to one animal, keeping the readings sorted by date. */
function withWeighing(animals: Animal[], earTag: string, weighing: Weighing): Animal[] {
  return animals.map((a) =>
    a.earTag === earTag
      ? { ...a, weighings: [...a.weighings, weighing].sort(compareByDate) }
      : a
  );
}

export function mergeCompleteResult(
  s: HerdSlices,
  sessionId: string,
  earTag: string,
  result: CompleteResult
): HerdSlices {
  let animals = s.animals;
  // An inseminação pass recorded an IATF cobertura on the cow.
  const breeding = result.breeding;
  if (breeding) {
    animals = withReproduction(animals, earTag, (r) => ({
      ...r,
      breedings: [...r.breedings, breeding],
    }));
  }
  if (result.weighing) animals = withWeighing(animals, earTag, result.weighing);
  // A transferência/venda pass moved the animal: take the server's word for
  // its lot and herd membership.
  const patch = result.animal;
  if (patch) {
    animals = animals.map((a) =>
      a.earTag === patch.earTag
        ? { ...a, active: patch.active, lotId: patch.lotId }
        : a
    );
  }
  return {
    ...s,
    treatments: [...s.treatments, ...result.treatments],
    animals,
    manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
  };
}

export function mergeSkipResult(
  s: HerdSlices,
  sessionId: string,
  earTag: string,
  entry: ManejoSessionAnimal
): HerdSlices {
  return { ...s, manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, entry) };
}

export function mergeSetAsideResult(
  s: HerdSlices,
  sessionId: string,
  earTag: string,
  result: SetAsideResult
): HerdSlices {
  return {
    ...s,
    animals: result.weighing ? withWeighing(s.animals, earTag, result.weighing) : s.animals,
    manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
  };
}

export function mergeBaixaResult(
  s: HerdSlices,
  sessionId: string,
  earTag: string,
  result: { entry: ManejoSessionAnimal; animal: BaixaAnimalPatch }
): HerdSlices {
  return {
    ...s,
    animals: s.animals.map((a) =>
      a.earTag === earTag
        ? {
            ...a,
            active: result.animal.active,
            inactiveReason: result.animal.inactiveReason,
            inactiveDate: result.animal.inactiveDate,
            inactiveNotes: result.animal.inactiveNotes,
          }
        : a
    ),
    manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
  };
}

export function mergeReopenResult(
  s: HerdSlices,
  sessionId: string,
  earTag: string,
  result: ReopenResult
): HerdSlices {
  const removedIds = new Set(result.removedTreatmentIds);
  const treatments =
    removedIds.size > 0 ? s.treatments.filter((t) => !removedIds.has(t.id)) : s.treatments;

  // Undoing an entry pass unregisters the animal it created.
  if (result.removedEarTag !== undefined) {
    const gone = result.removedEarTag;
    return {
      ...s,
      treatments,
      animals: s.animals.filter((a) => a.earTag !== gone),
      manejoSessions: s.manejoSessions.map((session) =>
        session.id === sessionId
          ? { ...session, animals: session.animals.filter((a) => a.earTag !== gone) }
          : session
      ),
    };
  }

  let animals = s.animals;
  const removed = result.removedWeighing;
  if (removed) {
    animals = animals.map((a) => {
      if (a.earTag !== earTag) return a;
      // Remove the single weighing the pass appended (last date+value match).
      let index = -1;
      for (let i = a.weighings.length - 1; i >= 0; i--) {
        if (a.weighings[i].date === removed.date && a.weighings[i].weightKg === removed.weightKg) {
          index = i;
          break;
        }
      }
      if (index === -1) return a;
      return { ...a, weighings: a.weighings.filter((_, i) => i !== index) };
    });
  }

  // Undoing an inseminação pass deleted its cobertura; the dose is back in stock.
  const breedingId = result.removedBreedingId;
  if (breedingId !== undefined) {
    animals = withReproduction(animals, earTag, (r) => ({
      ...r,
      breedings: r.breedings.filter((b) => b.id !== breedingId),
    }));
  }

  // The undo put the animal back in its lot / in the active herd.
  const patch = result.animal;
  if (patch) {
    animals = animals.map((a) =>
      a.earTag === patch.earTag
        ? { ...a, active: patch.active, lotId: patch.lotId }
        : a
    );
  }

  return {
    ...s,
    treatments,
    animals,
    manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
  };
}

export function mergeCarcassYield(
  s: HerdSlices,
  sessionId: string,
  result: CarcassYieldResult
): HerdSlices {
  const amountByEarTag = new Map(result.amounts.map((a) => [a.earTag, a.amountBrl]));
  return {
    ...s,
    manejoSessions: s.manejoSessions.map((m) =>
      m.id === sessionId
        ? {
            ...m,
            carcassYieldPct: result.carcassYieldPct,
            animals: m.animals.map((a) => {
              const amountBrl = amountByEarTag.get(a.earTag);
              return amountBrl === undefined ? a : { ...a, amountBrl };
            }),
          }
        : m
    ),
  };
}

export function mergeClose(s: HerdSlices, sessionId: string): HerdSlices {
  return {
    ...s,
    manejoSessions: s.manejoSessions.map((m) =>
      m.id === sessionId ? { ...m, status: "closed" as const } : m
    ),
  };
}

export function mergeStart(s: HerdSlices, session: ManejoSession): HerdSlices {
  return { ...s, manejoSessions: [...s.manejoSessions, session] };
}

/**
 * Takes back what one queued operation applied on the phone: every treatment,
 * weighing and cobertura carrying its `localOpId`, and the entry it marked,
 * back to pending. A local transfer or sale also puts the animal back the way
 * the server's undo does (old lot, back in the herd). The pending session of
 * an offline start goes when `startedSessionId` names it.
 */
export function stripLocal(
  s: HerdSlices,
  localOpId: string,
  opts: { startedSessionId?: string } = {}
): HerdSlices {
  const mine = (record: { localOpId?: string }) => record.localOpId === localOpId;

  let restore: { earTag: string; lotId?: string; sold: boolean } | undefined;
  for (const m of s.manejoSessions) {
    const entry = m.animals.find(mine);
    if (entry) {
      restore = {
        earTag: entry.earTag,
        lotId: entry.previousLotId,
        sold: m.kind === "sale" && entry.outcome === "done",
      };
    }
  }

  const manejoSessions = s.manejoSessions
    .filter((m) => !(m.pending && m.id === opts.startedSessionId))
    .map((m) =>
      m.animals.some(mine)
        ? {
            ...m,
            animals: m.animals.map((a) =>
              mine(a) ? { earTag: a.earTag, outcome: "pending" as const } : a
            ),
          }
        : m
    );

  const animals = s.animals.map((a) => {
    const weighings = a.weighings.filter((w) => !mine(w));
    const breedings = a.reproduction?.breedings.filter((b) => !mine(b));
    const back = restore?.earTag === a.earTag ? restore : undefined;
    const untouched =
      weighings.length === a.weighings.length &&
      breedings?.length === a.reproduction?.breedings.length &&
      !back;
    if (untouched) return a;
    return {
      ...a,
      weighings,
      ...(a.reproduction && breedings ? { reproduction: { ...a.reproduction, breedings } } : {}),
      ...(back?.lotId !== undefined ? { lotId: back.lotId } : {}),
      ...(back?.sold ? { active: true, inactiveReason: undefined, inactiveDate: undefined } : {}),
    };
  });

  return { ...s, animals, treatments: s.treatments.filter((t) => !mine(t)), manejoSessions };
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `pnpm vitest run lib/store/__tests__/manejoMerge.test.ts --exclude '**/worktrees/**'`
Expected: PASS, 13 tests.

- [ ] **Step 5: Point the store at the helpers: imports**

In `lib/store/useHerdStore.ts`, drop `ReproductionRecord` from the `@/lib/types` import, because only the moved code used it:
```ts
  PregnancyDiagnosis,
  ReproductionRecord,
  ScheduleTreatmentsInput,
```
→
```ts
  PregnancyDiagnosis,
  ScheduleTreatmentsInput,
```
Then add the helpers' import after the `DeletedManejo` import:
```ts
import type { DeletedManejo } from "@/lib/api/domains/manejo/useCases/Delete.useCase";
```
→
```ts
import type { DeletedManejo } from "@/lib/api/domains/manejo/useCases/Delete.useCase";
import {
  compareByDate,
  mergeBaixaResult,
  mergeCarcassYield,
  mergeClose,
  mergeCompleteResult,
  mergeReopenResult,
  mergeSetAsideResult,
  mergeSkipResult,
  mergeStart,
  withReproduction,
  type BaixaAnimalPatch,
  type CarcassYieldResult,
  type CompleteResult,
  type ReopenResult,
  type SetAsideResult,
} from "@/lib/store/manejoMerge";
```

- [ ] **Step 6: Remove the moved declarations from the store**

Delete these three blocks. Each old block is replaced by nothing, and the blank line after it goes too.

At line 95:
```ts
/** Herd change a manejo pass applied to one animal (lot, herd membership). */
interface PassAnimalPatch {
  earTag: string;
  active: boolean;
  lotId: string;
}

```
At line 501:
```ts
const compareByDate = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

```
At line 540, from `/** A female with no reproduction history yet` through the closing `}` of `withSessionAnimal`, up to the line before `export const useHerdStore`:
```ts
/** A female with no reproduction history yet — she can still receive records. */
const EMPTY_REPRODUCTION: ReproductionRecord = {
  breedings: [],
  diagnoses: [],
  calvings: [],
};

/** Immutably updates one female's reproduction record, creating it if absent. */
function withReproduction(
  animals: Animal[],
  earTag: string,
  update: (record: ReproductionRecord) => ReproductionRecord
): Animal[] {
  return animals.map((a) =>
    a.earTag === earTag
      ? { ...a, reproduction: update(a.reproduction ?? EMPTY_REPRODUCTION) }
      : a
  );
}

/** Immutably replaces one animal entry inside one session. */
function withSessionAnimal(
  sessions: ManejoSession[],
  sessionId: string,
  earTag: string,
  entry: ManejoSessionAnimal
): ManejoSession[] {
  return sessions.map((m) =>
    m.id === sessionId
      ? { ...m, animals: m.animals.map((a) => (a.earTag === earTag ? entry : a)) }
      : m
  );
}

```

- [ ] **Step 7: Rewrite the eight `set(...)` bodies**

`startManejoSession`:
```ts
    set((s) => ({ manejoSessions: [...s.manejoSessions, session] }));
    return session.id;
```
→
```ts
    set((s) => mergeStart(s, session));
    return session.id;
```

`completeManejoAnimal`, from `const result = response.data as {` through `return true;`:
```ts
    const result = response.data as {
      entry: ManejoSessionAnimal;
      treatments: Treatment[];
      weighing?: Weighing;
      animal?: PassAnimalPatch;
      breeding?: Breeding;
    };
    set((s) => {
      let animals = s.animals;
      // An inseminação pass recorded an IATF cobertura on the cow.
      const breeding = result.breeding;
      if (breeding) {
        animals = withReproduction(animals, earTag, (r) => ({
          ...r,
          breedings: [...r.breedings, breeding],
        }));
      }
      const weighing = result.weighing;
      if (weighing) {
        animals = animals.map((a) =>
          a.earTag === earTag
            ? { ...a, weighings: [...a.weighings, weighing].sort(compareByDate) }
            : a
        );
      }
      // A transferência/venda pass moved the animal: take the server's word for
      // its lot and herd membership.
      const patch = result.animal;
      if (patch) {
        animals = animals.map((a) =>
          a.earTag === patch.earTag
            ? { ...a, active: patch.active, lotId: patch.lotId }
            : a
        );
      }
      return {
        treatments: [...s.treatments, ...result.treatments],
        animals,
        manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
      };
    });
    return true;
  },

  skipManejoAnimal: async (sessionId, earTag, notes) => {
```
→
```ts
    const result = response.data as CompleteResult;
    set((s) => mergeCompleteResult(s, sessionId, earTag, result));
    return true;
  },

  skipManejoAnimal: async (sessionId, earTag, notes) => {
```

`skipManejoAnimal`:
```ts
    const entry = data as ManejoSessionAnimal;
    set((s) => ({
      manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, entry),
    }));
  },
```
→
```ts
    const entry = data as ManejoSessionAnimal;
    set((s) => mergeSkipResult(s, sessionId, earTag, entry));
  },
```

`setAsideManejoAnimal`:
```ts
    const result = data as { entry: ManejoSessionAnimal; weighing?: Weighing };
    set((s) => {
      const weighing = result.weighing;
      const animals = weighing
        ? s.animals.map((a) =>
            a.earTag === earTag
              ? { ...a, weighings: [...a.weighings, weighing].sort(compareByDate) }
              : a
          )
        : s.animals;
      return {
        animals,
        manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
      };
    });
    return true;
```
→
```ts
    const result = data as SetAsideResult;
    set((s) => mergeSetAsideResult(s, sessionId, earTag, result));
    return true;
```

`baixaManejoAnimal`:
```ts
    const result = data as {
      entry: ManejoSessionAnimal;
      animal: Pick<Animal, "active" | "inactiveReason" | "inactiveDate" | "inactiveNotes">;
    };
    set((s) => ({
      animals: s.animals.map((a) =>
        a.earTag === earTag
          ? {
              ...a,
              active: result.animal.active,
              inactiveReason: result.animal.inactiveReason,
              inactiveDate: result.animal.inactiveDate,
              inactiveNotes: result.animal.inactiveNotes,
            }
          : a
      ),
      manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
    }));
    return true;
```
→
```ts
    const result = data as { entry: ManejoSessionAnimal; animal: BaixaAnimalPatch };
    set((s) => mergeBaixaResult(s, sessionId, earTag, result));
    return true;
```

`reopenManejoAnimal`: lines 1003-1075 of `2502844`, from `const result = data as {` (after `apiFail("desfazer o registro do animal", error);`) through the start of `setSaleCarcassYield`:
```ts
    const result = data as {
      entry: ManejoSessionAnimal;
      removedTreatmentIds: string[];
      removedWeighing?: Weighing;
      animal?: PassAnimalPatch;
      removedEarTag?: string;
      removedBreedingId?: string;
    };
    set((s) => {
      const removedIds = new Set(result.removedTreatmentIds);
      const treatments =
        removedIds.size > 0 ? s.treatments.filter((t) => !removedIds.has(t.id)) : s.treatments;

      // Undoing an entry pass unregisters the animal it created.
      if (result.removedEarTag !== undefined) {
        const gone = result.removedEarTag;
        return {
          treatments,
          animals: s.animals.filter((a) => a.earTag !== gone),
          manejoSessions: s.manejoSessions.map((session) =>
            session.id === sessionId
              ? { ...session, animals: session.animals.filter((a) => a.earTag !== gone) }
              : session
          ),
        };
      }

      let animals = s.animals;
      const removed = result.removedWeighing;
      if (removed) {
        animals = animals.map((a) => {
          if (a.earTag !== earTag) return a;
          // Remove the single weighing the pass appended (last date+value match).
          let index = -1;
          for (let i = a.weighings.length - 1; i >= 0; i--) {
            if (a.weighings[i].date === removed.date && a.weighings[i].weightKg === removed.weightKg) {
              index = i;
              break;
            }
          }
          if (index === -1) return a;
          return { ...a, weighings: a.weighings.filter((_, i) => i !== index) };
        });
      }

      // Undoing an inseminação pass deleted its cobertura; the dose is back in stock.
      const breedingId = result.removedBreedingId;
      if (breedingId !== undefined) {
        animals = withReproduction(animals, earTag, (r) => ({
          ...r,
          breedings: r.breedings.filter((b) => b.id !== breedingId),
        }));
      }

      // The undo put the animal back in its lot / in the active herd.
      const patch = result.animal;
      if (patch) {
        animals = animals.map((a) =>
          a.earTag === patch.earTag
            ? { ...a, active: patch.active, lotId: patch.lotId }
            : a
        );
      }

      return {
        treatments,
        animals,
        manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, result.entry),
      };
    });
  },

  setSaleCarcassYield: async (sessionId, carcassYieldPct) => {
```
→
```ts
    const result = data as ReopenResult;
    set((s) => mergeReopenResult(s, sessionId, earTag, result));
  },

  setSaleCarcassYield: async (sessionId, carcassYieldPct) => {
```

`setSaleCarcassYield`:
```ts
    const result = data as {
      carcassYieldPct: number;
      amounts: { earTag: string; amountBrl: number }[];
    };
    const amountByEarTag = new Map(result.amounts.map((a) => [a.earTag, a.amountBrl]));
    set((s) => ({
      manejoSessions: s.manejoSessions.map((m) =>
        m.id === sessionId
          ? {
              ...m,
              carcassYieldPct: result.carcassYieldPct,
              animals: m.animals.map((a) => {
                const amountBrl = amountByEarTag.get(a.earTag);
                return amountBrl === undefined ? a : { ...a, amountBrl };
              }),
            }
          : m
      ),
    }));
  },
```
→
```ts
    const result = data as CarcassYieldResult;
    set((s) => mergeCarcassYield(s, sessionId, result));
  },
```

`closeManejoSession`:
```ts
    set((s) => ({
      manejoSessions: s.manejoSessions.map((m) =>
        m.id === sessionId ? { ...m, status: "closed" as const } : m
      ),
    }));
  },

  deleteManejoSession: async (sessionId) => {
```
→
```ts
    set((s) => mergeClose(s, sessionId));
  },

  deleteManejoSession: async (sessionId) => {
```

Check that no leftover references remain:
Run: `grep -n "withSessionAnimal\|PassAnimalPatch\|EMPTY_REPRODUCTION\|ReproductionRecord" lib/store/useHerdStore.ts`
Expected: no output.

- [ ] **Step 8: Run the store tests, types and lint**

Run: `pnpm vitest run lib/store --exclude '**/worktrees/**'`
Expected: PASS, including `manejoMerge.test.ts`, with the other store suites unchanged.

Run: `pnpm tsc --noEmit`
Expected: no output, exit 0. If `Breeding`, `Weighing` or `Treatment` is reported unused in `useHerdStore.ts`, drop it from the `@/lib/types` import. At `2502844` all three are still used by other actions.

Run: `pnpm exec eslint lib/store/manejoMerge.ts lib/store/useHerdStore.ts lib/store/__tests__/manejoMerge.test.ts`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add lib/store/manejoMerge.ts lib/store/__tests__/manejoMerge.test.ts lib/store/useHerdStore.ts
git commit -m "refactor(store): extract the manejo merge helpers" -- lib/store/manejoMerge.ts lib/store/__tests__/manejoMerge.test.ts lib/store/useHerdStore.ts
```

---

### Task 7: Local apply (optimistic effects)

**Files:**
- Create: `lib/offline/localApply.ts`
- Test: `lib/offline/__tests__/localApply.test.ts`

**Interfaces:**
- Consumes: `OutboxOp` (`lib/offline/types.ts`, Task 3); the markers `pending?`/`localOpId?` on `ManejoSessionAnimal`, `Treatment`, `Weighing`, `Breeding` and `ManejoSession.pending?` (`lib/types.ts`, Task 3); `CompleteResult` (`lib/store/manejoMerge.ts`, Task 6); `buildPassEffects`, `sessionName`, `baixaPassNote`, `TreatmentEffect` (`lib/domain/manejo.ts`); `ManejoPassData`, `NewBaixa`, `NewManejoSession` (type-only from `lib/store/useHerdStore.ts`, as `lib/domain/manejo.ts` already does).
- Produces:
```ts
export interface LocalApplyResult extends CompleteResult {
  animal?: CompleteResult["animal"] & Partial<Pick<Animal, "inactiveReason" | "inactiveDate" | "inactiveNotes">>;
}
export interface LocalApplyContext { session: ManejoSession; animal: Animal; semenBulls: SemenBull[]; today: string }
export function localApply(op: OutboxOp, ctx: LocalApplyContext): LocalApplyResult | null;
export function localStartSession(op: OutboxOp): ManejoSession;
```
Task 9 applies each result through Task 6's helpers:
- `complete` goes through `mergeCompleteResult(s, op.sessionId, op.earTag, r)`.
- `skip` goes through `mergeSkipResult(…, r.entry)`.
- `set-aside` goes through `mergeSetAsideResult(…, { entry: r.entry, weighing: r.weighing })`.
- `baixa` goes through `mergeBaixaResult(…, { entry: r.entry, animal: r.animal! })`. The widened `animal` is still assignable to both `PassAnimalPatch` and `BaixaAnimalPatch`.

Notes on the numbers and fields:
- The sale value comes from `buildPassEffects`, which already calls `saleAmount(weightKg, pricePerArroba, own ?? padrão)`, the same number the server writes. The test recomputes it independently with `saleAmount` + `passYieldPct`.
- `ctx.today` is kept for the contract but unused: every date comes from the session or the op body.
- `localStartSession` takes no `ctx`, because nothing in it needs the herd.
- The entry carries `previousLotId` when the pass moves the animal, as the server's does. Task 6's `stripLocal` reads it to put the animal back.
- The bull's `bullEarTag` is `code || name`, the same rule as the server's `bullEarTagOf`. That function lives beside Drizzle in `lib/api/domains/semen/_shared/stock.ts`, so it is not imported into client code.
- When the picked bull is not in `ctx.semenBulls`, no cobertura is made locally. The server will answer `bull_not_found` on replay, and that becomes a conflict.
- Node is v24 on this machine and `package.json` declares no `engines`, so the global `crypto.randomUUID()` is there in the browser and under vitest.

- [ ] **Step 1: Write the failing parity test**

`lib/offline/__tests__/localApply.test.ts`:
```ts
/**
 * Parity of the phone's optimistic pass with what the server's use cases
 * write. The expectations come straight from the pure parts the use cases
 * call (buildPassEffects, saleAmount, baixaPassNote) and from the columns each
 * use case sets (CompleteAnimal, SkipAnimal, SetAsideAnimal, BaixaAnimal);
 * the use cases themselves need a database and are not run here.
 */
import { describe, expect, it } from "vitest";
import { localApply, localStartSession } from "@/lib/offline/localApply";
import { baixaPassNote, buildPassEffects } from "@/lib/domain/manejo";
import { passYieldPct, saleAmount } from "@/lib/domain/movements";
import type { OutboxKind, OutboxOp } from "@/lib/offline/types";
import type { Animal, ManejoSession, SemenBull } from "@/lib/types";

const TODAY = "2026-05-02";

const animal: Animal = {
  id: "a-101",
  earTag: "101",
  category: "cow",
  breed: "Nelore",
  sex: "female",
  birthDate: "2022-01-01",
  lotId: "lot-a",
  active: true,
  weighings: [],
};

const semenBulls: SemenBull[] = [
  { id: "bull-1", name: "Faraó", code: "NEL-1", purchases: [] },
  { id: "bull-2", name: "Jaguar", purchases: [] },
];

const session = (over: Partial<ManejoSession>): ManejoSession => ({
  id: "s1",
  name: "Manejo",
  date: TODAY,
  status: "open",
  kind: "health",
  weighing: false,
  animals: [{ earTag: "101", outcome: "pending" }],
  ...over,
});

const op = (kind: OutboxKind, body: Record<string, unknown>): OutboxOp => ({
  id: "op-1",
  seq: 1,
  userId: "u1",
  farmId: 1,
  sessionId: "s1",
  kind,
  earTag: "101",
  body,
  createdAt: "2026-05-02T10:00:00.000Z",
  state: "queued",
  attempts: 0,
});

/** A record without its provisional id and markers, for the field-by-field compare. */
const unmark = (record: object) =>
  Object.fromEntries(
    Object.entries(record).filter(([key]) => !["id", "localOpId", "pending"].includes(key))
  );

const run = (s: ManejoSession, kind: OutboxKind, body: Record<string, unknown>) =>
  localApply(op(kind, body), { session: s, animal, semenBulls, today: TODAY })!;

describe("localApply · complete", () => {
  it("health with booster and weighing: the server's treatments, weighing and entry", () => {
    const s = session({
      kind: "health",
      weighing: true,
      treatment: {
        type: "vaccine",
        name: "Vacina aftosa",
        withdrawalDays: 0,
        dose: "5 ml",
        responsible: "Dr. Ana",
        costBrl: 4.5,
        nextDate: "2026-11-02",
      },
    });
    const body = { weightKg: 415, notes: "  reação  " };
    const effects = buildPassEffects(s, body);
    const r = run(s, "complete", body);

    expect(r.treatments.map(unmark)).toEqual([
      { animalEarTag: "101", ...effects.treatment },
      { animalEarTag: "101", ...effects.booster },
    ]);
    expect(r.treatments.every((t) => t.id.startsWith("local:") && t.localOpId === "op-1")).toBe(true);
    expect(new Set(r.treatments.map((t) => t.id)).size).toBe(2);

    expect(unmark(r.weighing!)).toEqual(effects.weighing);
    expect(r.weighing!.id).toBeLessThan(0);
    expect(r.weighing!.localOpId).toBe("op-1");

    expect(unmark(r.entry)).toEqual({ earTag: "101", outcome: "done", weightKg: 415, notes: "reação" });
    expect(r.entry).toMatchObject({ pending: true, localOpId: "op-1" });
    expect(r.animal).toBeUndefined();
    expect(r.breeding).toBeUndefined();
  });

  it("transfer: lands the animal in the destination lot and keeps where it came from", () => {
    const s = session({ kind: "transfer", destinationLotId: "lot-b" });
    const r = run(s, "complete", {});
    expect(r.animal).toEqual({ earTag: "101", active: true, lotId: "lot-b" });
    expect(unmark(r.entry)).toEqual({ earTag: "101", outcome: "done", previousLotId: "lot-a" });
    expect(r.treatments).toEqual([]);
    expect(r.weighing).toBeUndefined();
  });

  it("sale per arroba with its own yield: prices the pass the way the server does and takes the animal out", () => {
    const s = session({ kind: "sale", weighing: true, pricePerArroba: 300, carcassYieldPct: 52 });
    const body = { weightKg: 480, carcassYieldPct: 54 };
    const r = run(s, "complete", body);
    const amountBrl = saleAmount(480, 300, passYieldPct(s, { carcassYieldPct: 54 }));
    expect(unmark(r.entry)).toEqual({
      earTag: "101",
      outcome: "done",
      weightKg: 480,
      amountBrl,
      carcassYieldPct: 54,
      previousLotId: "lot-a",
    });
    expect(r.animal).toEqual({ earTag: "101", active: false, lotId: "lot-a" });
    expect(unmark(r.weighing!)).toEqual({ date: TODAY, weightKg: 480 });
    expect(r.weighing!.localOpId).toBe("op-1");
  });

  it("insemination: the picked bull's cobertura, named like the server names it", () => {
    const s = session({ kind: "insemination", semenBullIds: ["bull-1", "bull-2"] });
    const r = run(s, "complete", { semenBullId: "bull-2" });
    expect(unmark(r.breeding!)).toEqual({ date: TODAY, type: "timedAI", semenBullId: "bull-2", bullEarTag: "Jaguar" });
    expect(r.breeding!.id.startsWith("local:")).toBe(true);
    expect(r.breeding!.localOpId).toBe("op-1");
  });

  it("insemination without a pick: the session's first bull, by its code", () => {
    const s = session({ kind: "insemination", semenBullIds: ["bull-1", "bull-2"] });
    const r = run(s, "complete", {});
    expect(r.breeding).toMatchObject({ semenBullId: "bull-1", bullEarTag: "NEL-1" });
  });
});

describe("localApply · skip", () => {
  it("skips with the trimmed note", () => {
    const r = run(session({}), "skip", { notes: " mancou " });
    expect(unmark(r.entry)).toEqual({ earTag: "101", outcome: "skipped", notes: "mancou" });
    expect(r.entry).toMatchObject({ pending: true, localOpId: "op-1" });
    expect(r.treatments).toEqual([]);
  });
});

describe("localApply · set-aside", () => {
  it("rejected with a weight: the refugo and its weighing", () => {
    const s = session({ kind: "sale", weighing: true, pricePerArroba: 300 });
    const r = run(s, "set-aside", { list: "rejected", weightKg: 380, notes: "" });
    expect(unmark(r.entry)).toEqual({ earTag: "101", outcome: "rejected", weightKg: 380 });
    expect(unmark(r.weighing!)).toEqual({ date: TODAY, weightKg: 380 });
    expect(r.weighing!.id).toBeLessThan(0);
    expect(r.weighing!.localOpId).toBe("op-1");
    expect(r.animal).toBeUndefined();
  });
});

describe("localApply · baixa", () => {
  it("skips the pass with the baixa note and takes the animal out of the herd", () => {
    const body = { reason: "death", date: "2026-05-03", notes: "quebrou a perna" };
    const r = run(session({}), "baixa", body);
    expect(unmark(r.entry)).toEqual({
      earTag: "101",
      outcome: "skipped",
      notes: baixaPassNote("death", "quebrou a perna"),
    });
    expect(r.animal).toEqual({
      earTag: "101",
      active: false,
      lotId: "lot-a",
      inactiveReason: "death",
      inactiveDate: "2026-05-03",
      inactiveNotes: "quebrou a perna",
    });
  });
});

describe("localApply · other kinds", () => {
  it("leaves reopen, close, carcass-yield and start to the store", () => {
    for (const kind of ["reopen", "close", "carcass-yield", "start"] as const) {
      expect(localApply(op(kind, {}), { session: session({}), animal, semenBulls, today: TODAY })).toBeNull();
    }
  });
});

describe("localStartSession", () => {
  it("builds the pending session the server would start, with the op's id", () => {
    const start: OutboxOp = {
      ...op("start", {
        date: TODAY,
        kind: "insemination",
        earTags: ["101", "102"],
        weighing: false,
        semenBullIds: ["bull-1", "bull-1", "bull-2"],
        notes: "lote das vacas",
      }),
      sessionId: "5f0c2b8e-8d2a-4c61-9d3e-2f1a7b6c9e10",
      earTag: undefined,
    };
    expect(localStartSession(start)).toEqual({
      id: "5f0c2b8e-8d2a-4c61-9d3e-2f1a7b6c9e10",
      name: "Inseminação",
      date: TODAY,
      status: "open",
      kind: "insemination",
      weighing: false,
      animals: [
        { earTag: "101", outcome: "pending" },
        { earTag: "102", outcome: "pending" },
      ],
      semenBullIds: ["bull-1", "bull-2"],
      notes: "lote das vacas",
      pending: true,
    });
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `pnpm vitest run lib/offline/__tests__/localApply.test.ts --exclude '**/worktrees/**'`
Expected: FAIL. The module `@/lib/offline/localApply` does not resolve.

- [ ] **Step 3: Write the local apply**

`lib/offline/localApply.ts`:
```ts
/**
 * Optimistic effects of a queued manejo operation: what the server's use case
 * will write, computed on the phone with the same buildPassEffects and marked
 * provisional (`localOpId`, `local:` ids, negative weighing ids) until the sync
 * reconciles it through the store's merge helpers.
 */
import { baixaPassNote, buildPassEffects, sessionName, type TreatmentEffect } from "@/lib/domain/manejo";
import type { OutboxOp } from "@/lib/offline/types";
import type { CompleteResult } from "@/lib/store/manejoMerge";
import type { ManejoPassData, NewBaixa, NewManejoSession } from "@/lib/store/useHerdStore";
import type {
  Animal,
  Breeding,
  ManejoSession,
  ManejoSessionAnimal,
  SemenBull,
  Treatment,
  Weighing,
} from "@/lib/types";

/** A pass applied on the phone; a baixa also says why and when the animal left. */
export interface LocalApplyResult extends CompleteResult {
  animal?: CompleteResult["animal"] &
    Partial<Pick<Animal, "inactiveReason" | "inactiveDate" | "inactiveNotes">>;
}

export interface LocalApplyContext {
  session: ManejoSession;
  animal: Animal;
  semenBulls: SemenBull[];
  today: string;
}

let weighingsMade = 0;

/** Negative id, so it never meets a server weighing id (serial, positive). */
function provisionalWeighing(weighing: Weighing, localOpId: string): Weighing {
  weighingsMade += 1;
  return { ...weighing, id: -(Date.now() % 1e9) - weighingsMade, localOpId };
}

const localId = () => `local:${crypto.randomUUID()}`;

/** The server keeps a note only when something is left after trimming. */
const trimmed = (notes: string | undefined) => notes?.trim() || undefined;

/**
 * The records one pass, skip, refugo/dúvida or baixa creates, as the server's
 * use case would write them. Null for the kinds the store applies itself
 * (start, reopen, carcass-yield, close).
 */
export function localApply(op: OutboxOp, ctx: LocalApplyContext): LocalApplyResult | null {
  const { session, animal } = ctx;
  const existing: ManejoSessionAnimal = session.animals.find((a) => a.earTag === animal.earTag) ?? {
    earTag: animal.earTag,
    outcome: "pending",
  };
  const mark = { pending: true, localOpId: op.id };

  switch (op.kind) {
    case "complete":
      return completePass(op, ctx, { ...existing, ...mark });
    case "skip": {
      const body = op.body as { notes?: string };
      return {
        entry: { ...existing, outcome: "skipped", notes: trimmed(body.notes), ...mark },
        treatments: [],
      };
    }
    case "set-aside": {
      const body = op.body as { list: "rejected" | "held"; weightKg?: number; notes?: string };
      const weighing =
        session.weighing && body.weightKg !== undefined
          ? provisionalWeighing({ date: session.date, weightKg: body.weightKg }, op.id)
          : undefined;
      return {
        entry: {
          ...existing,
          outcome: body.list,
          weightKg: weighing?.weightKg,
          notes: trimmed(body.notes),
          ...mark,
        },
        treatments: [],
        weighing,
      };
    }
    case "baixa": {
      const body = op.body as unknown as NewBaixa;
      return {
        entry: { ...existing, outcome: "skipped", notes: baixaPassNote(body.reason, body.notes), ...mark },
        treatments: [],
        animal: {
          earTag: animal.earTag,
          active: false,
          lotId: animal.lotId,
          inactiveReason: body.reason,
          inactiveDate: body.date,
          inactiveNotes: trimmed(body.notes),
        },
      };
    }
    default:
      return null;
  }
}

/** CompleteAnimal's writes: treatments, weighing, cobertura, lot/sale, entry. */
function completePass(
  op: OutboxOp,
  { session, animal, semenBulls }: LocalApplyContext,
  entry: ManejoSessionAnimal
): LocalApplyResult {
  const data = op.body as ManejoPassData;
  const effects = buildPassEffects(session, data);

  const treatments: Treatment[] = [effects.treatment, effects.booster]
    .filter((t): t is TreatmentEffect => t !== undefined)
    .map((t) => ({ id: localId(), animalEarTag: animal.earTag, ...t, localOpId: op.id }));

  const weighing = effects.weighing && provisionalWeighing(effects.weighing, op.id);

  // Named like the server's bullEarTagOf: the bull's code, or its name.
  const bull = semenBulls.find((b) => b.id === effects.breeding?.semenBullId);
  const breeding: Breeding | undefined =
    effects.breeding && bull
      ? { id: localId(), ...effects.breeding, bullEarTag: bull.code || bull.name, localOpId: op.id }
      : undefined;

  const moves = effects.lotId !== undefined || effects.sold === true;
  return {
    entry: {
      ...entry,
      outcome: "done",
      weightKg: effects.weighing?.weightKg,
      notes: trimmed(data.notes),
      amountBrl: effects.amountBrl,
      carcassYieldPct: effects.carcassYieldPct,
      previousLotId: moves ? animal.lotId : undefined,
    },
    treatments,
    weighing,
    animal: moves
      ? {
          earTag: animal.earTag,
          active: effects.sold ? false : animal.active,
          lotId: effects.lotId ?? animal.lotId,
        }
      : undefined,
    breeding,
  };
}

/** The session an offline start opens, as StartSessionUseCase would return it. */
export function localStartSession(op: OutboxOp): ManejoSession {
  const body = op.body as unknown as NewManejoSession;
  return {
    id: op.sessionId,
    name: sessionName(body.treatment, body.kind),
    date: body.date,
    status: "open",
    kind: body.kind,
    weighing: body.weighing,
    treatment: body.treatment,
    animals: body.earTags.map((earTag) => ({ earTag, outcome: "pending" })),
    destinationLotId: body.destinationLotId,
    counterparty: body.counterparty,
    pricePerArroba: body.pricePerArroba,
    carcassYieldPct: body.carcassYieldPct,
    totalAmountBrl: body.totalAmountBrl,
    semenBullIds:
      body.kind === "insemination" ? [...new Set(body.semenBullIds ?? [])] : undefined,
    notes: body.notes,
    pending: true,
  };
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `pnpm vitest run lib/offline --exclude '**/worktrees/**'`
Expected: PASS. `localApply.test.ts` has 10 tests, and the earlier `lib/offline` suites still pass.

- [ ] **Step 5: Types and lint**

Run: `pnpm tsc --noEmit`
Expected: no output, exit 0.

Run: `pnpm exec eslint lib/offline/localApply.ts lib/offline/__tests__/localApply.test.ts`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add lib/offline/localApply.ts lib/offline/__tests__/localApply.test.ts
git commit -m "feat(offline): apply a pass locally with the server's own effects" -- lib/offline/localApply.ts lib/offline/__tests__/localApply.test.ts
```

---

### Task 8: Sync engine

**Files:**
- Create: `lib/offline/sync.ts`
- Test: `lib/offline/__tests__/sync.test.ts`

**Interfaces:**
- Consumes (Task 3 as the contract writes it, plus merge-notes ruling 1: a close/carcass-yield op is a dependent of any earlier conflito/falha of its session, and `nextSendable` holds it back): `OutboxOp`, `OutboxDetail`, `OutboxKind` from `lib/offline/types.ts`; `Outbox`, `OutboxCounts`, `createOutbox(store, meta)`, `dependentOps(ops, op)` from `lib/offline/outbox.ts`; `memoryStore<T>()` from `lib/offline/db.ts`. `ManejoSessionAnimal` from `lib/types.ts`.
- Produces:
```ts
export type SendResult = { ok: true; result: unknown } | { ok: false; status: number; error?: string; message?: string; server?: ManejoSessionAnimal; sessionClosed?: boolean };
export interface Transport { send(op: OutboxOp, opts: { force: boolean }): Promise<SendResult> }   // throws on network failure
export interface SyncStatus { online: boolean; phase: "offline" | "idle" | "sending" | "paused_auth"; sending?: { done: number; total: number }; lastSyncedAt?: string; offlineSince?: string; counts: OutboxCounts }
export type SyncKick = "online" | "visible" | "enqueue" | "manual" | "interval";
export interface SyncEngine { start(): void; stop(): void; kick(reason: SyncKick): Promise<void>; resolve(opId: string, choice: "server" | "mine"): Promise<void>; resolveAll(choice: "server" | "mine"): Promise<void>; discard(opId: string): Promise<void>; status(): SyncStatus; subscribe(fn: (s: SyncStatus) => void): () => void }
export interface Timers { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void; setInterval(fn: () => void, ms: number): unknown; clearInterval(id: unknown): void }
export interface SyncDeps { outbox: Outbox; transport: Transport; userId(): string | undefined; isOnline(): boolean; now(): string; timers?: Timers; onApplied(op: OutboxOp, result: unknown): void; onDropped(op: OutboxOp): void; onBatchResolved(): Promise<void>; onAuthRequired(): void }
export function createSyncEngine(deps: SyncDeps): SyncEngine;
```

Rules the code implements (contract + spec + merge-notes ruling 5: `session_not_open` is a conflito with `sessionClosed: true`): one drain at a time, `nextSendable()` until none; 2xx → `onApplied` + remove; 409 with a listed reason → conflito, later ops of the same animal (every later op of the session for a `start`) → conflito `{ error: "dependent" }`; 401 → op back to `queued`, `paused_auth`, drain stops, `onAuthRequired` (only a `"manual"` kick resumes); throw / 5xx / 429 → `attempts + 1`, back to `queued`, drain stops, retry after 1 s, 5 s, 30 s, then every 30 s; any other answer → falha, and its dependents become falhas `{ error: "dependent" }` too (the spec: a refused start makes every op of the session a falha — and it keeps `counts.queued` from holding ops that can never leave); interval every 30 s while `counts.queued > 0` and online; `resolve`/`resolveAll`/`discard` call `onBatchResolved()` once each, then kick the drain; `start()` puts an op left `sending` by a closed tab back in line. Merge-notes ruling 7: `deps.userId()` is the signed-in user (Task 4's `lastUser`); the engine passes it to `nextSendable`/`counts`/`list`, so another user's ops stay in the fila untouched, unsent, uncounted and unlisted until that user signs in again; with no known user nothing is sent.

- [ ] **Step 1: Write the failing test**

Create `lib/offline/__tests__/sync.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStore } from "@/lib/offline/db";
import { createOutbox } from "@/lib/offline/outbox";
import {
  createSyncEngine,
  type SendResult,
  type SyncStatus,
  type Transport,
} from "@/lib/offline/sync";
import type { OutboxKind, OutboxOp } from "@/lib/offline/types";

type Answer = SendResult | "throw";

const conflict = (error: string): SendResult => ({ ok: false, status: 409, error });

/**
 * An engine over the memory outbox and a transport that answers from a script
 * per op id ("throw" is a network failure); ops without a script are accepted.
 */
function setup(script: Record<string, Answer[]> = {}, online = true) {
  const outbox = createOutbox(memoryStore(), memoryStore());
  const sent: { id: string; force: boolean }[] = [];
  const transport: Transport = {
    async send(op, { force }) {
      sent.push({ id: op.id, force });
      const answer = script[op.id]?.shift() ?? { ok: true, result: { id: op.id } };
      if (answer === "throw") throw new TypeError("Failed to fetch");
      return answer;
    },
  };
  let isOnline = online;
  const deps = {
    outbox,
    transport,
    userId: () => "u1",
    isOnline: () => isOnline,
    now: () => new Date().toISOString(),
    onApplied: vi.fn(),
    onDropped: vi.fn(),
    onBatchResolved: vi.fn(async () => {}),
    onAuthRequired: vi.fn(),
  };
  const engine = createSyncEngine(deps);
  return {
    outbox,
    engine,
    deps,
    sent: () => sent.map((s) => s.id),
    forces: () => sent.map((s) => s.force),
    setOnline: (value: boolean) => {
      isOnline = value;
    },
    enqueue: (
      id: string,
      earTag: string | undefined,
      kind: OutboxKind = "complete",
      sessionId = "s1"
    ) =>
      outbox.enqueue({ id, userId: "u1", farmId: 1, sessionId, kind, earTag, body: {} }),
    states: async () =>
      Object.fromEntries((await outbox.list()).map((op) => [op.id, op.state])),
    ids: (fn: { mock: { calls: unknown[][] } }) =>
      fn.mock.calls.map((call) => (call[0] as OutboxOp).id),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T14:07:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSyncEngine", () => {
  it("sends the fila in order and applies each answer", async () => {
    const h = setup();
    await h.enqueue("a", "101");
    await h.enqueue("b", "102");
    await h.enqueue("c", "101", "skip");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a", "b", "c"]);
    expect(h.ids(h.deps.onApplied)).toEqual(["a", "b", "c"]);
    expect(h.deps.onApplied).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), { id: "a" });
    expect(await h.outbox.list()).toEqual([]);
    expect(h.engine.status()).toMatchObject({
      online: true,
      phase: "idle",
      counts: { queued: 0, conflict: 0, failed: 0 },
      lastSyncedAt: "2026-09-25T14:07:00.000Z",
    });
  });

  it("keeps a later pass behind a network failure and retries after 1 s, then 5 s", async () => {
    const h = setup({ a: ["throw", "throw"] });
    await h.enqueue("a", "101");
    await h.enqueue("b", "102");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a"]);
    expect(await h.outbox.get("a")).toMatchObject({ state: "queued", attempts: 1 });
    await vi.advanceTimersByTimeAsync(999);
    expect(h.sent()).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.sent()).toEqual(["a", "a"]);
    expect(await h.outbox.get("a")).toMatchObject({ state: "queued", attempts: 2 });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(h.sent()).toEqual(["a", "a"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.sent()).toEqual(["a", "a", "a", "b"]);
    expect(await h.outbox.list()).toEqual([]);
  });

  it("turns a 409 into a conflito, holds the same animal's later passes and the close, sends the others", async () => {
    const h = setup({ a: [conflict("entry_not_actionable")] });
    await h.enqueue("a", "101");
    await h.enqueue("b", "102");
    await h.enqueue("c", "101", "reopen");
    await h.enqueue("z", undefined, "close");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a", "b"]);
    expect(await h.outbox.get("z")).toMatchObject({ state: "conflict", detail: { error: "dependent" } });
    expect(await h.outbox.get("a")).toMatchObject({
      state: "conflict",
      detail: { error: "entry_not_actionable" },
    });
    expect(await h.outbox.get("c")).toMatchObject({ state: "conflict", detail: { error: "dependent" } });
    expect(await h.outbox.get("b")).toBeUndefined();
    expect(h.engine.status().counts).toEqual({ queued: 0, conflict: 3, failed: 0 });
  });

  it.each(["session_closed", "session_not_open"])("marks a %s conflito as a closed session", async (error) => {
    const h = setup({ a: [conflict(error)] });
    await h.enqueue("a", "101");
    await h.engine.kick("enqueue");
    expect(await h.outbox.get("a")).toMatchObject({
      state: "conflict",
      detail: { error, sessionClosed: true },
    });
  });

  it("pauses on 401 with the fila intact and resumes on a manual kick", async () => {
    const h = setup({ a: [{ ok: false, status: 401 }] });
    await h.enqueue("a", "101");
    await h.enqueue("b", "102");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a"]);
    expect(h.engine.status().phase).toBe("paused_auth");
    expect(h.deps.onAuthRequired).toHaveBeenCalledTimes(1);
    expect(await h.states()).toEqual({ a: "queued", b: "queued" });
    await h.engine.kick("interval");
    expect(h.sent()).toEqual(["a"]);
    await h.engine.kick("manual");
    expect(h.sent()).toEqual(["a", "a", "b"]);
    expect(await h.outbox.list()).toEqual([]);
  });

  it("turns another 4xx into a falha, with the same animal's later passes", async () => {
    const h = setup({
      a: [{ ok: false, status: 422, error: "future_date", message: "Data no futuro" }],
    });
    await h.enqueue("a", "101", "baixa");
    await h.enqueue("b", "102");
    await h.enqueue("c", "101", "reopen");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a", "b"]);
    expect(await h.outbox.get("a")).toMatchObject({
      state: "failed",
      detail: { error: "future_date", message: "Data no futuro" },
    });
    expect(await h.outbox.get("c")).toMatchObject({ state: "failed", detail: { error: "dependent" } });
    expect(h.engine.status().counts).toEqual({ queued: 0, conflict: 0, failed: 2 });
  });

  it("'Manter do servidor' drops the conflito and its dependents, then reloads once", async () => {
    const h = setup({ a: [conflict("entry_not_actionable")] });
    await h.enqueue("a", "101");
    await h.enqueue("c", "101", "reopen");
    await h.engine.kick("enqueue");
    await h.engine.resolve("a", "server");
    expect(h.ids(h.deps.onDropped)).toEqual(["a", "c"]);
    expect(await h.outbox.list()).toEqual([]);
    expect(h.deps.onBatchResolved).toHaveBeenCalledTimes(1);
    expect(h.sent()).toEqual(["a"]);
  });

  it("'Aplicar o meu' resends with force and lets the held passes go", async () => {
    const h = setup({ a: [conflict("entry_not_actionable")] });
    await h.enqueue("a", "101");
    await h.enqueue("c", "101", "reopen");
    await h.engine.kick("enqueue");
    await h.engine.resolve("a", "mine");
    expect(h.sent()).toEqual(["a", "a", "c"]);
    expect(h.forces()).toEqual([false, true, false]);
    expect(h.ids(h.deps.onApplied)).toEqual(["a", "c"]);
    expect(await h.outbox.list()).toEqual([]);
    expect(h.deps.onBatchResolved).toHaveBeenCalledTimes(1);
  });

  it("'Aplicar o meu' refused again becomes a falha", async () => {
    const h = setup({ a: [conflict("entry_not_actionable"), conflict("has_diagnosis")] });
    await h.enqueue("a", "101");
    await h.enqueue("c", "101", "reopen");
    await h.engine.kick("enqueue");
    await h.engine.resolve("a", "mine");
    expect(await h.states()).toEqual({ a: "failed", c: "failed" });
    expect((await h.outbox.get("a"))?.detail).toMatchObject({ error: "has_diagnosis" });
    expect(h.deps.onApplied).not.toHaveBeenCalled();
  });

  it("'Aplicar todos os meus' goes through the conflitos in fila order with one reload", async () => {
    const h = setup({
      a: [conflict("entry_not_actionable")],
      d: [conflict("out_of_stock")],
    });
    await h.enqueue("a", "101");
    await h.enqueue("d", "103");
    await h.engine.kick("enqueue");
    await h.engine.resolveAll("mine");
    expect(h.sent()).toEqual(["a", "d", "a", "d"]);
    expect(h.forces()).toEqual([false, false, true, true]);
    expect(h.deps.onBatchResolved).toHaveBeenCalledTimes(1);
    expect(await h.outbox.list()).toEqual([]);
  });

  it("Descartar removes a falha and its dependents and takes their records out", async () => {
    const h = setup({ a: [{ ok: false, status: 404, error: "not_found" }] });
    await h.enqueue("a", "101");
    await h.enqueue("c", "101", "reopen");
    await h.engine.kick("enqueue");
    await h.engine.discard("a");
    expect(h.ids(h.deps.onDropped)).toEqual(["a", "c"]);
    expect(await h.outbox.list()).toEqual([]);
    expect(h.sent()).toEqual(["a"]);
  });

  it("sends and counts only the signed-in user's ops", async () => {
    const h = setup();
    await h.outbox.enqueue({ id: "x", userId: "u2", farmId: 1, sessionId: "s1", kind: "complete", earTag: "103", body: {} });
    await h.enqueue("a", "101");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual(["a"]);
    expect(await h.states()).toEqual({ x: "queued" });
    expect(h.engine.status().counts).toEqual({ queued: 0, conflict: 0, failed: 0 });
  });

  it("reports offline, then sending with progress, then idle", async () => {
    const h = setup({}, false);
    await h.enqueue("a", "101");
    await h.enqueue("b", "102");
    await h.engine.kick("enqueue");
    expect(h.sent()).toEqual([]);
    expect(h.engine.status()).toMatchObject({
      online: false,
      phase: "offline",
      offlineSince: "2026-09-25T14:07:00.000Z",
      counts: { queued: 2, conflict: 0, failed: 0 },
    });
    const seen: SyncStatus[] = [];
    h.engine.subscribe((s) => seen.push(s));
    vi.setSystemTime(new Date("2026-09-25T14:41:00.000Z"));
    h.setOnline(true);
    await h.engine.kick("online");
    expect(seen.filter((s) => s.phase === "sending").map((s) => s.sending)).toEqual([
      { done: 0, total: 2 },
      { done: 1, total: 2 },
    ]);
    expect(seen.at(-1)).toMatchObject({
      online: true,
      phase: "idle",
      lastSyncedAt: "2026-09-25T14:41:00.000Z",
      counts: { queued: 0, conflict: 0, failed: 0 },
    });
    expect(seen.at(-1)?.offlineSince).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `pnpm exec vitest run lib/offline/__tests__/sync.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `Failed to resolve import "@/lib/offline/sync"` (the module does not exist yet).

- [ ] **Step 3: Write the engine**

Create `lib/offline/sync.ts`:

```ts
/**
 * The sync engine: sends the fila to the server one operation at a time, in
 * the order the brete did them, and sorts every answer into applied, conflito
 * (the vaqueiro decides), falha (only Descartar) or "try again later". The
 * transport, the clock, the online flag and the timers are injected, so the
 * whole state machine runs in tests without a network.
 */
import { dependentOps, type Outbox, type OutboxCounts } from "@/lib/offline/outbox";
import type { OutboxDetail, OutboxOp } from "@/lib/offline/types";
import type { ManejoSessionAnimal } from "@/lib/types";

export type SendResult =
  | { ok: true; result: unknown }
  | {
      ok: false;
      status: number;
      error?: string;
      message?: string;
      server?: ManejoSessionAnimal;
      sessionClosed?: boolean;
    };

/** Sends one operation; throws when the request never reached the server. */
export interface Transport {
  send(op: OutboxOp, opts: { force: boolean }): Promise<SendResult>;
}

export interface SyncStatus {
  online: boolean;
  phase: "offline" | "idle" | "sending" | "paused_auth";
  sending?: { done: number; total: number };
  lastSyncedAt?: string;
  offlineSince?: string;
  counts: OutboxCounts;
}

export type SyncKick = "online" | "visible" | "enqueue" | "manual" | "interval";

export interface SyncEngine {
  start(): void;
  stop(): void;
  kick(reason: SyncKick): Promise<void>;
  resolve(opId: string, choice: "server" | "mine"): Promise<void>;
  resolveAll(choice: "server" | "mine"): Promise<void>;
  discard(opId: string): Promise<void>;
  status(): SyncStatus;
  subscribe(fn: (s: SyncStatus) => void): () => void;
}

/** The four timer functions the engine uses; the browser's by default. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface SyncDeps {
  outbox: Outbox;
  transport: Transport;
  /**
   * The signed-in user: only their ops are sent, counted and resolved; another
   * user's stay in the fila, hidden, until they sign in again.
   */
  userId(): string | undefined;
  isOnline(): boolean;
  now(): string;
  timers?: Timers;
  onApplied(op: OutboxOp, result: unknown): void;
  onDropped(op: OutboxOp): void;
  /** One reload of the herd after the vaqueiro's choices. */
  onBatchResolved(): Promise<void>;
  onAuthRequired(): void;
}

/** 409 answers that mean someone else got there first: the vaqueiro decides. */
const CONFLICT_ERRORS = new Set([
  "entry_not_actionable",
  "held_pending",
  "out_of_stock",
  "animal_inactive",
  "has_diagnosis",
  "session_closed",
  "session_not_open",
  "not_female",
  "bull_not_found",
  "id_taken",
]);

/** Refusals that mean the server's session is closed: "Aplicar o meu" cannot help. */
const CLOSED_ERRORS = new Set(["session_closed", "session_not_open"]);

/** Waits before the 1st, 2nd and 3rd retry of a network failure; the last one repeats. */
const RETRY_MS = [1_000, 5_000, 30_000];

/** How often a non-empty fila is tried while online. */
const INTERVAL_MS = 30_000;

type Refusal = Extract<SendResult, { ok: false }>;

/** The server is down or busy, not refusing: try again later, order kept. */
const retryable = (r: Refusal): boolean => r.status >= 500 || r.status === 429;

const detailOf = (r: Refusal): OutboxDetail => ({
  error: r.error ?? `http_${r.status}`,
  message: r.message,
  server: r.server,
  sessionClosed: r.sessionClosed || CLOSED_ERRORS.has(r.error ?? "") || undefined,
});

/** The later ops held back only because an earlier op of the same animal was refused. */
const held = (op: OutboxOp): boolean => op.detail?.error === "dependent";

export function createSyncEngine(deps: SyncDeps): SyncEngine {
  const { outbox, transport } = deps;
  const timers: Timers = deps.timers ?? globalThis;
  const listeners = new Set<(s: SyncStatus) => void>();
  // With no known user nothing matches: ops always carry a real user id.
  const who = () => deps.userId() ?? "";
  let online = true;
  let offlineSince: string | undefined;
  let lastSyncedAt: string | undefined;
  let counts: OutboxCounts = { queued: 0, conflict: 0, failed: 0 };
  let sending: SyncStatus["sending"];
  let pausedAuth = false;
  let stopped = false;
  let draining: Promise<void> | null = null;
  let again = false;
  let retry: unknown;
  let interval: unknown;
  // Drains and the vaqueiro's choices touch the outbox one at a time.
  let lock: Promise<unknown> = Promise.resolve();

  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = lock.then(fn);
    lock = run.catch(() => undefined);
    return run;
  }

  /** Reads the online flag; the first offline reading starts "Sem conexão desde". */
  function sense(): void {
    online = deps.isOnline();
    if (!online) offlineSince ??= deps.now();
    else offlineSince = undefined;
  }

  function snapshot(): SyncStatus {
    return {
      online,
      phase: !online ? "offline" : pausedAuth ? "paused_auth" : sending ? "sending" : "idle",
      sending,
      lastSyncedAt,
      offlineSince,
      counts,
    };
  }

  /** Re-reads the counts, starts or stops the 30 s interval and tells every subscriber. */
  async function refresh(): Promise<void> {
    sense();
    counts = await outbox.counts(who());
    const wanted = !stopped && online && counts.queued > 0;
    if (wanted && interval === undefined) {
      interval = timers.setInterval(() => void kick("interval"), INTERVAL_MS);
    }
    if (!wanted && interval !== undefined) {
      timers.clearInterval(interval);
      interval = undefined;
    }
    const status = snapshot();
    for (const fn of listeners) fn(status);
  }

  /** Marks an op conflito or falha, and the later ops of the same animal with it. */
  async function settle(
    op: OutboxOp,
    state: "conflict" | "failed",
    detail: OutboxDetail
  ): Promise<void> {
    await outbox.update(op.id, { state, detail });
    for (const dep of dependentOps(await outbox.list(), op)) {
      if (dep.state === "queued" || held(dep)) {
        await outbox.update(dep.id, { state, detail: { error: "dependent" } });
      }
    }
  }

  /** Drops an op and every op that depends on it; the store takes their records out. */
  async function drop(op: OutboxOp): Promise<void> {
    for (const gone of [op, ...dependentOps(await outbox.list(), op)]) {
      deps.onDropped(gone);
      await outbox.remove(gone.id);
    }
  }

  /** Puts a network-failed op back in line and schedules the next try. */
  async function backOff(op: OutboxOp): Promise<false> {
    const attempts = op.attempts + 1;
    await outbox.update(op.id, { state: "queued", attempts });
    if (retry !== undefined) timers.clearTimeout(retry);
    retry = stopped
      ? undefined
      : timers.setTimeout(() => {
          retry = undefined;
          void kick("interval");
        }, RETRY_MS[Math.min(attempts, RETRY_MS.length) - 1]);
    return false;
  }

  /** Sends one op of the drain; false when the drain must stop (network, sign-in). */
  async function sendOne(op: OutboxOp): Promise<boolean> {
    await outbox.update(op.id, { state: "sending" });
    let result: SendResult;
    try {
      result = await transport.send(op, { force: false });
    } catch {
      return backOff(op);
    }
    if (result.ok) {
      deps.onApplied(op, result.result);
      await outbox.remove(op.id);
      return true;
    }
    if (retryable(result)) return backOff(op);
    if (result.status === 401) {
      await outbox.update(op.id, { state: "queued" });
      pausedAuth = true;
      deps.onAuthRequired();
      return false;
    }
    const isConflict = result.status === 409 && CONFLICT_ERRORS.has(result.error ?? "");
    await settle(op, isConflict ? "conflict" : "failed", detailOf(result));
    return true;
  }

  async function drain(): Promise<void> {
    let done = 0;
    do {
      again = false;
      for (let op = await outbox.nextSendable(who()); op; op = await outbox.nextSendable(who())) {
        sense();
        if (!online || pausedAuth) return;
        counts = await outbox.counts(who());
        sending = { done, total: done + counts.queued };
        await refresh();
        if (!(await sendOne(op))) return;
        done += 1;
      }
    } while (again);
    if ((await outbox.counts(who())).queued === 0) lastSyncedAt = deps.now();
  }

  function kick(reason: SyncKick): Promise<void> {
    if (reason === "manual") pausedAuth = false;
    if (draining) {
      again = true;
      return draining;
    }
    const run = exclusive(async () => {
      try {
        sense();
        if (online && !pausedAuth) await drain();
      } finally {
        sending = undefined;
        await refresh();
      }
    });
    draining = run
      .catch((error: unknown) => console.error("sync failed", error))
      .finally(() => {
        draining = null;
        // A kick that arrived after the drain's last look goes now (never as
        // "manual": only the vaqueiro lifts a sign-in pause).
        if (again) {
          again = false;
          void kick("enqueue");
        }
      });
    return draining;
  }

  async function resolveOne(opId: string, choice: "server" | "mine"): Promise<void> {
    const op = await outbox.get(opId);
    if (op?.state !== "conflict") return;
    if (choice === "server") return drop(op);
    // Held back behind another conflito, it never reached the server: back in line.
    if (held(op)) {
      await outbox.update(op.id, { state: "queued", detail: undefined });
      return;
    }
    let result: SendResult;
    try {
      result = await transport.send(op, { force: true });
    } catch {
      return; // still a conflito; the choice can be made again with signal
    }
    if (result.ok) {
      deps.onApplied(op, result.result);
      await outbox.remove(op.id);
      for (const dep of dependentOps(await outbox.list(), op)) {
        if (held(dep)) await outbox.update(dep.id, { state: "queued", detail: undefined });
      }
      return;
    }
    if (result.status === 401) {
      pausedAuth = true;
      deps.onAuthRequired();
      return;
    }
    if (retryable(result)) return;
    await settle(op, "failed", detailOf(result));
  }

  /** After the vaqueiro's choice: one reload, then whatever is back in line goes. */
  async function afterBatch(): Promise<void> {
    await deps.onBatchResolved();
    await kick("enqueue");
  }

  return {
    start() {
      stopped = false;
      // An op left "sending" by a tab closed mid-request goes back in line.
      void exclusive(async () => {
        for (const op of await outbox.list()) {
          if (op.state === "sending") await outbox.update(op.id, { state: "queued" });
        }
      }).then(() => kick("online"));
    },
    stop() {
      stopped = true;
      if (retry !== undefined) timers.clearTimeout(retry);
      if (interval !== undefined) timers.clearInterval(interval);
      retry = undefined;
      interval = undefined;
    },
    kick,
    async resolve(opId, choice) {
      await exclusive(() => resolveOne(opId, choice));
      await afterBatch();
    },
    async resolveAll(choice) {
      await exclusive(async () => {
        for (const op of await outbox.list(who())) {
          if (op.state === "conflict") await resolveOne(op.id, choice);
        }
      });
      await afterBatch();
    },
    async discard(opId) {
      await exclusive(async () => {
        const op = await outbox.get(opId);
        if (op && op.state !== "sending") await drop(op);
      });
      await afterBatch();
    },
    status() {
      sense();
      return snapshot();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
```

`discard` also reloads once (not only `resolve`/`resolveAll`): a discarded close or carcass-yield left a local change that only the server's copy undoes.

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm exec vitest run lib/offline/__tests__/sync.test.ts --exclude '**/worktrees/**'`
Expected: PASS — `Tests  14 passed (14)`.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm tsc --noEmit`
Expected: no output, exit 0.

Run: `pnpm exec eslint lib/offline/sync.ts lib/offline/__tests__/sync.test.ts`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/offline/sync.ts lib/offline/__tests__/sync.test.ts
git commit -m "feat(offline): send the fila in order and sort the server's answers" -- lib/offline/sync.ts lib/offline/__tests__/sync.test.ts
```

---

### Task 9: Store integration, transport, hooks

**Files:**
- Create: `lib/offline/apiTransport.ts`, `lib/store/offlineWiring.ts`, `lib/offline/useOffline.ts`
- Modify: `lib/store/useHerdStore.ts` — imports (after line 47, `import type { DeletedManejo } …`), `HerdStore` interface (after line 239, `pendingInvites: MyInvite[];`), a helper block before line 574 (`export const useHerdStore = …`), initial slices + `load` (lines 593–596), `startManejoSession` (801), `completeManejoAnimal` (809), `skipManejoAnimal` (874), `setAsideManejoAnimal` (887), `baixaManejoAnimal` (922), `reopenManejoAnimal` (960), `setSaleCarcassYield` (1075), `closeManejoSession` (1101), `registerEntryAnimal` (1194). Line numbers are today's; Tasks 4 and 6 land first and shift them — match the quoted text, which those tasks leave alone (Task 6 rewrites only the merge bodies after each error branch and moves `withSessionAnimal`/`withReproduction` out of the store; Task 4 keeps the first two lines of `load` and adds its slices after `loaded: false,`).
- Modify: `lib/store/useHerdStore.ts` also Task 4's `load` (the offline-boot branch and the background `rememberUser`), for ruling 7
- Modify: `lib/auth/navigation.ts` (`useSignOut`, line 38–39)
- Test: `lib/offline/__tests__/apiTransport.test.ts`, `lib/store/__tests__/queueOrSend.test.ts`

**Interfaces:**
- Consumes: Task 3 `OutboxOp`, `OutboxKind`, `Outbox`, `createOutbox`, `openStore`, `memoryStore`; Task 4 `clearUserSnapshots(store, userId)`, `LAST_USER_KEY` and, inside the store module, `persistSnapshot(get: () => HerdStore): Promise<void>` (never throws), `snapshotStore()`, `metaStore()` and the slices `offline: boolean`, `snapshotAt: string | null`; Task 6 `mergeStart`, `mergeCompleteResult`, `mergeSkipResult`, `mergeSetAsideResult`, `mergeBaixaResult`, `mergeReopenResult`, `mergeCarcassYield`, `mergeClose`, `stripLocal(s, localOpId, { startedSessionId? })`, `compareByDate`, `withReproduction`, types `HerdSlices`, `CompleteResult`, `SetAsideResult`, `BaixaAnimalPatch`, `ReopenResult`, `CarcassYieldResult`; Task 7 `localApply(op, ctx)`, `localStartSession(op)`; Task 8 `createSyncEngine`, `SyncDeps`, `SyncEngine`, `SyncStatus`, `SendResult`, `Transport`; Task 5's `force` on the four pass bodies and `id` on the start body.
- Produces:
```ts
// lib/offline/apiTransport.ts
export function createApiTransport(api: typeof herdApi, animalIdByEarTag: (earTag: string) => string | undefined): Transport;
// lib/store/offlineWiring.ts
export function getOutbox(): Outbox;
export function getEngine(): SyncEngine | undefined;
export interface OfflineHooks extends Pick<SyncDeps, "onApplied" | "onDropped" | "onBatchResolved" | "onAuthRequired"> { animalIdByEarTag(earTag: string): string | undefined; onChange(sync: SyncStatus, ops: OutboxOp[]): void }
export function wireOffline(hooks: OfflineHooks): void;
export function setSyncUser(userId: string | undefined): void;
export function getSyncUser(): string | undefined;
// lib/store/useHerdStore.ts
HerdStore.sync: SyncStatus; HerdStore.outboxCount: number; HerdStore.ops: OutboxOp[];
export async function clearOfflineSnapshots(): Promise<void>;
// lib/offline/useOffline.ts
export function useOffline(): { online: boolean; offline: boolean; snapshotAt: string | null; sync: SyncStatus; ops: OutboxOp[]; open: boolean; setOpen(v: boolean): void; resolve(opId: string, choice: "server" | "mine"): Promise<void>; resolveAll(choice: "server" | "mine"): Promise<void>; discard(opId: string): Promise<void>; syncNow(): Promise<void> };
```

Decisions: the engine is wired from the store's `load` (AppShell calls it on every mount, so AppShell stays untouched); later calls to `wireOffline` kick a `"manual"` sync, which is what resumes a 401 pause after the user signs in again. Sign-out clears the user's snapshots (the user from Task 4's `meta` `lastUser`) and keeps the fila (spec: "the fila survives"; the contract's "clears the outbox" loses exactly what Review Focus 5 protects). Merge-notes ruling 8: the pass routes' 409 bodies carry `entry` (Task 5), and the transport maps `value.entry` → `SendResult.server`, so the sheet shows "No servidor: …" before the choice. Merge-notes ruling 7: `offlineWiring` holds the signed-in user (`setSyncUser`, fed by Task 4's `rememberUser` after an online load and by the `lastUser` meta key after an offline boot, cleared on sign-out) and gives it to the engine as `userId()`; another user's ops stay in the fila, unsent and unlisted. `lastNetworkFailureAt` treats Eden's 503 (what it returns when `fetch` throws) as a network failure in both the online path and the transport.

- [ ] **Step 1: Write the failing transport test**

Create `lib/offline/__tests__/apiTransport.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createApiTransport } from "@/lib/offline/apiTransport";
import type { OutboxOp } from "@/lib/offline/types";

type Answer = { data: unknown; error: { status: number; value: unknown } | null };

/** The slice of the Eden client the two kinds under test walk through. */
function stubApi(answer: Answer) {
  const complete = vi.fn<(body: unknown) => Promise<Answer>>(async () => answer);
  const start = vi.fn<(body: unknown) => Promise<Answer>>(async () => answer);
  const animals = vi.fn<(params: { animalId: string }) => object>(() => ({
    complete: { post: complete },
  }));
  const manejo = Object.assign(
    vi.fn<(params: { id: string }) => object>(() => ({ animals })),
    { post: start }
  );
  return { api: { manejo }, manejo, animals, complete, start };
}

const op = (patch: Partial<OutboxOp> = {}): OutboxOp => ({
  id: "op1",
  seq: 1,
  userId: "u1",
  farmId: 1,
  sessionId: "s1",
  kind: "complete",
  earTag: "101",
  body: { weightKg: 301 },
  createdAt: "2026-09-25T14:07:00.000Z",
  state: "sending",
  attempts: 0,
  ...patch,
});

const idOf = (earTag: string) => (earTag === "101" ? "a-101" : undefined);

describe("createApiTransport", () => {
  it("sends a pass to its animal's route with the op's body and force", async () => {
    const s = stubApi({ data: { entry: { earTag: "101", outcome: "done" } }, error: null });
    const result = await createApiTransport(s.api as never, idOf).send(op(), { force: true });
    expect(s.manejo).toHaveBeenCalledWith({ id: "s1" });
    expect(s.animals).toHaveBeenCalledWith({ animalId: "a-101" });
    expect(s.complete).toHaveBeenCalledWith({ weightKg: 301, force: true });
    expect(result).toEqual({ ok: true, result: { entry: { earTag: "101", outcome: "done" } } });
  });

  it("starts a manejo with the id the phone gave it", async () => {
    const s = stubApi({ data: { id: "s1" }, error: null });
    const body = { date: "2026-09-25", kind: "weighing", earTags: ["101"], weighing: true };
    await createApiTransport(s.api as never, idOf).send(
      op({ kind: "start", earTag: undefined, body }),
      { force: false }
    );
    expect(s.start).toHaveBeenCalledWith({ ...body, id: "s1" });
  });

  it("reads the server's reason from a refusal", async () => {
    const s = stubApi({ data: null, error: { status: 409, value: { error: "session_closed" } } });
    const result = await createApiTransport(s.api as never, idOf).send(op(), { force: true });
    expect(result).toEqual({ ok: false, status: 409, error: "session_closed", sessionClosed: true });
  });

  it("keeps the server's entry from a 409, for the sheet", async () => {
    const server = { earTag: "101", outcome: "done", weightKg: 299 };
    const s = stubApi({ data: null, error: { status: 409, value: { error: "entry_not_actionable", entry: server } } });
    const result = await createApiTransport(s.api as never, idOf).send(op(), { force: false });
    expect(result).toEqual({ ok: false, status: 409, error: "entry_not_actionable", server });
  });

  it("throws when the request never got through", async () => {
    const s = stubApi({ data: null, error: { status: 503, value: new TypeError("Failed to fetch") } });
    await expect(
      createApiTransport(s.api as never, idOf).send(op(), { force: false })
    ).rejects.toThrow("network failure");
  });

  it("fails an op whose animal is no longer in the herd", async () => {
    const s = stubApi({ data: null, error: null });
    const result = await createApiTransport(s.api as never, idOf).send(op({ earTag: "999" }), {
      force: false,
    });
    expect(result).toEqual({ ok: false, status: 404, error: "animal_not_found" });
    expect(s.complete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run lib/offline/__tests__/apiTransport.test.ts --exclude '**/worktrees/**'`
Expected: FAIL — `Failed to resolve import "@/lib/offline/apiTransport"`.

- [ ] **Step 3: Write the transport**

Create `lib/offline/apiTransport.ts`:

```ts
/**
 * Sends one fila operation to the manejo route its online action calls, with
 * the same body (plus `force` on the four pass routes when the vaqueiro chose
 * "Aplicar o meu"), and reads the answer the way the sync engine needs it.
 */
import type { api as herdApi } from "@/lib/api/client";
import type { SendResult, Transport } from "@/lib/offline/sync";
import type { OutboxOp } from "@/lib/offline/types";
import type { ManejoSessionAnimal } from "@/lib/types";

type Answer = { data: unknown; error: { status: unknown; value: unknown } | null };

/** The Eden call of one op; null when its animal is not in the herd any more. */
function request(
  api: typeof herdApi,
  op: OutboxOp,
  force: boolean,
  animalId: string | undefined
): Promise<Answer> | null {
  const session = api.manejo({ id: op.sessionId });
  // op.body is exactly what the online action sent, typed there.
  switch (op.kind) {
    case "start":
      return api.manejo.post({ ...op.body, id: op.sessionId } as never);
    case "carcass-yield":
      return session["carcass-yield"].post(op.body as never);
    case "close":
      return session.close.post();
  }
  if (animalId === undefined) return null;
  const animal = session.animals({ animalId });
  switch (op.kind) {
    case "complete":
      return animal.complete.post({ ...op.body, force } as never);
    case "set-aside":
      return animal["set-aside"].post({ ...op.body, force } as never);
    case "skip":
      return animal.skip.post({ ...op.body, force } as never);
    case "baixa":
      return animal.baixa.post({ ...op.body, force } as never);
    case "reopen":
      return animal.reopen.post();
  }
  return null;
}

export function createApiTransport(
  api: typeof herdApi,
  animalIdByEarTag: (earTag: string) => string | undefined
): Transport {
  return {
    async send(op, { force }): Promise<SendResult> {
      const animalId = op.earTag === undefined ? undefined : animalIdByEarTag(op.earTag);
      const call = request(api, op, force, animalId);
      if (call === null) return { ok: false, status: 404, error: "animal_not_found" };
      const { data, error } = await call;
      if (!error) return { ok: true, result: data };
      const status = Number(error.status);
      // Eden answers 503 without a response when fetch itself failed: no signal.
      if (status === 0 || status === 503) throw new Error(`network failure (${status})`);
      const value =
        typeof error.value === "object" && error.value !== null
          ? (error.value as { error?: unknown; message?: unknown; entry?: unknown })
          : {};
      const code = typeof value.error === "string" ? value.error : undefined;
      return {
        ok: false,
        status,
        error: code,
        message: typeof value.message === "string" ? value.message : undefined,
        // The pass routes' 409s name the server's entry (merge-notes ruling 8).
        server:
          typeof value.entry === "object" && value.entry !== null
            ? (value.entry as ManejoSessionAnimal)
            : undefined,
        sessionClosed: code === "session_closed" || code === "session_not_open" || undefined,
      };
    },
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm exec vitest run lib/offline/__tests__/apiTransport.test.ts --exclude '**/worktrees/**'`
Expected: PASS — `Tests  6 passed (6)`.

- [ ] **Step 5: Write the wiring singletons**

Create `lib/store/offlineWiring.ts`:

```ts
/**
 * The phone's fila and sync engine — one of each per tab,
 * built on first use in the browser (never during SSR) — and the window
 * events that kick the engine. The store hands in what happens to its state.
 */
import { api } from "@/lib/api/client";
import { createApiTransport } from "@/lib/offline/apiTransport";
import { openStore } from "@/lib/offline/db";
import { createOutbox, type Outbox } from "@/lib/offline/outbox";
import {
  createSyncEngine,
  type SyncDeps,
  type SyncEngine,
  type SyncStatus,
} from "@/lib/offline/sync";
import type { OutboxOp } from "@/lib/offline/types";

let outbox: Outbox | undefined;
let engine: SyncEngine | undefined;
/** The signed-in user: only their ops are sent, counted and listed (merge-notes ruling 7). */
let user: string | undefined;

/**
 * Who the fila works for: the store sets it after an online load (the session
 * read) or an offline boot (the last user), and clears it on sign-out. A new
 * user kicks a sync by hand, which also lifts a 401 pause.
 */
export function setSyncUser(userId: string | undefined): void {
  user = userId;
  void engine?.kick("manual");
}

export function getSyncUser(): string | undefined {
  return user;
}

export function getOutbox(): Outbox {
  return (outbox ??= createOutbox(openStore("outbox"), openStore("meta")));
}

/** The engine once `wireOffline` ran; undefined during SSR and before the first load. */
export function getEngine(): SyncEngine | undefined {
  return engine;
}

export interface OfflineHooks
  extends Pick<SyncDeps, "onApplied" | "onDropped" | "onBatchResolved" | "onAuthRequired"> {
  animalIdByEarTag(earTag: string): string | undefined;
  /** Every status change, with the fila as it stands after it. */
  onChange(sync: SyncStatus, ops: OutboxOp[]): void;
}

/**
 * Builds the engine and hooks it to the window, once. Later calls only kick a
 * sync by hand — after signing in again, that is what lifts a 401 pause.
 */
export function wireOffline(hooks: OfflineHooks): void {
  if (typeof window === "undefined") return;
  if (engine) {
    void engine.kick("manual");
    return;
  }
  const fila = getOutbox();
  const e = createSyncEngine({
    outbox: fila,
    transport: createApiTransport(api, hooks.animalIdByEarTag),
    userId: () => user,
    isOnline: () => navigator.onLine,
    now: () => new Date().toISOString(),
    onApplied: hooks.onApplied,
    onDropped: hooks.onDropped,
    onBatchResolved: hooks.onBatchResolved,
    onAuthRequired: hooks.onAuthRequired,
  });
  engine = e;
  e.subscribe((sync) => {
    void fila
      .list(user ?? "")
      .then((ops) => hooks.onChange(sync, ops))
      .catch(() => {});
  });
  // Both flips re-read the flag: "online" drains, "offline" shows "Sem conexão".
  window.addEventListener("online", () => void e.kick("online"));
  window.addEventListener("offline", () => void e.kick("online"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void e.kick("visible");
  });
  e.start();
}
```

- [ ] **Step 6: Store — imports**

In `lib/store/useHerdStore.ts`, Task 4's snapshot import, old:

```ts
import {
  LAST_USER_KEY,
  loadSnapshot,
  saveSnapshot,
  snapshotKey,
  type Snapshot,
} from "@/lib/offline/snapshot";
```

New:

```ts
import {
  LAST_USER_KEY,
  clearUserSnapshots,
  loadSnapshot,
  saveSnapshot,
  snapshotKey,
  type Snapshot,
} from "@/lib/offline/snapshot";
```

Task 6's helpers import (after the `DeletedManejo` import), old:

```ts
import {
  compareByDate,
  mergeBaixaResult,
  mergeCarcassYield,
  mergeClose,
  mergeCompleteResult,
  mergeReopenResult,
  mergeSetAsideResult,
  mergeSkipResult,
  mergeStart,
  withReproduction,
  type BaixaAnimalPatch,
  type CarcassYieldResult,
  type CompleteResult,
  type ReopenResult,
  type SetAsideResult,
} from "@/lib/store/manejoMerge";
```

New:

```ts
import {
  compareByDate,
  mergeBaixaResult,
  mergeCarcassYield,
  mergeClose,
  mergeCompleteResult,
  mergeReopenResult,
  mergeSetAsideResult,
  mergeSkipResult,
  mergeStart,
  stripLocal,
  withReproduction,
  type BaixaAnimalPatch,
  type CarcassYieldResult,
  type CompleteResult,
  type HerdSlices,
  type ReopenResult,
  type SetAsideResult,
} from "@/lib/store/manejoMerge";
import { todayISO } from "@/lib/domain/dates";
import { localApply, localStartSession } from "@/lib/offline/localApply";
import type { SyncStatus } from "@/lib/offline/sync";
import type { OutboxKind, OutboxOp } from "@/lib/offline/types";
import {
  getEngine,
  getOutbox,
  getSyncUser,
  setSyncUser,
  wireOffline,
} from "@/lib/store/offlineWiring";
```

- [ ] **Step 7: Store — the new slices in `HerdStore`**

Old:

```ts
  pendingInvites: MyInvite[];
```

New:

```ts
  pendingInvites: MyInvite[];
  /** Where the fila's sync stands (lib/offline/sync.ts). */
  sync: SyncStatus;
  /** Operations in the fila: a enviar, conflitos and falhas. */
  outboxCount: number;
  /** The fila itself, in the order it goes, for the runner's list and the Sincronização sheet. */
  ops: OutboxOp[];
```

- [ ] **Step 8: Store — the queue helpers**

Old:

```ts
export const useHerdStore = create<HerdStore>()((set, get) => ({
```

New:

```ts
/** When a manejo request last failed for network reasons (ms since epoch). */
let lastNetworkFailureAt = 0;

/** For this long after a network failure, the brete queues instead of trying the API. */
const NETWORK_FAILURE_WINDOW_MS = 10_000;

/** Eden answers 503 without a response when fetch itself failed; remembers when. */
function networkFailed(error: { status: number }): boolean {
  if (error.status !== 503 && error.status !== 0) return false;
  lastNetworkFailureAt = Date.now();
  return true;
}

/**
 * A manejo action goes to the fila without signal, right after a network
 * failure, or while its session has anything waiting there — so a later pass
 * never reaches the server before an earlier one.
 */
async function mustQueue(sessionId?: string): Promise<boolean> {
  if (!navigator.onLine || Date.now() - lastNetworkFailureAt < NETWORK_FAILURE_WINDOW_MS) {
    return true;
  }
  return sessionId !== undefined && getOutbox().hasPending(sessionId);
}

/** Immutably patches one session's own fields. */
function patchSession(
  sessions: ManejoSession[],
  sessionId: string,
  patch: Partial<ManejoSession>
): ManejoSession[] {
  return sessions.map((m) => (m.id === sessionId ? { ...m, ...patch } : m));
}

/**
 * Only a start's own reconcile or drop takes the phone's session out (an
 * offline close also marks its session pending, and must not lose it).
 */
const startedBy = (op: OutboxOp) =>
  op.kind === "start" ? { startedSessionId: op.sessionId } : undefined;

/** An operation's effects on the store, before the server has seen it (provisional). */
function applyLocally(s: HerdStore, op: OutboxOp): Partial<HerdStore> {
  const earTag = op.earTag ?? "";
  switch (op.kind) {
    case "start":
      return s.manejoSessions.some((m) => m.id === op.sessionId)
        ? {}
        : mergeStart(s, localStartSession(op));
    case "close":
      return {
        manejoSessions: patchSession(s.manejoSessions, op.sessionId, {
          status: "closed",
          pending: true,
        }),
      };
    case "carcass-yield":
      return {
        manejoSessions: patchSession(s.manejoSessions, op.sessionId, {
          carcassYieldPct: op.body.carcassYieldPct as number,
        }),
      };
    case "reopen":
      // The entry goes back to pending at once; mergeSkipResult just swaps an entry in.
      return mergeSkipResult(s, op.sessionId, earTag, {
        earTag,
        outcome: "pending",
        pending: true,
        localOpId: op.id,
      });
    default: {
      const session = s.manejoSessions.find((m) => m.id === op.sessionId);
      const animal = s.animals.find((a) => a.earTag === earTag);
      const effects =
        session && animal
          ? localApply(op, { session, animal, semenBulls: s.semenBulls, today: todayISO() })
          : null;
      return effects ? mergeCompleteResult(s, op.sessionId, earTag, effects) : {};
    }
  }
}

/** The server accepted an op: its provisional records go and its answer merges as online. */
function reconcile(s: HerdStore, op: OutboxOp, result: unknown): HerdSlices {
  const earTag = op.earTag ?? "";
  const base = stripLocal(s, op.id, startedBy(op));
  switch (op.kind) {
    case "start": {
      // The server's session replaces the phone's, keeping the passes still in the fila.
      const session = result as ManejoSession;
      const local = s.manejoSessions.find((m) => m.id === op.sessionId);
      const waiting = new Map(
        (local?.animals ?? []).filter((a) => a.pending).map((a) => [a.earTag, a])
      );
      return mergeStart(base, {
        ...session,
        animals: session.animals.map((a) => waiting.get(a.earTag) ?? a),
      });
    }
    case "complete":
      return mergeCompleteResult(base, op.sessionId, earTag, result as CompleteResult);
    case "skip":
      return mergeSkipResult(base, op.sessionId, earTag, result as ManejoSessionAnimal);
    case "set-aside":
      return mergeSetAsideResult(base, op.sessionId, earTag, result as SetAsideResult);
    case "baixa":
      return mergeBaixaResult(
        base,
        op.sessionId,
        earTag,
        result as { entry: ManejoSessionAnimal; animal: BaixaAnimalPatch }
      );
    case "reopen":
      return mergeReopenResult(base, op.sessionId, earTag, result as ReopenResult);
    case "carcass-yield":
      return mergeCarcassYield(base, op.sessionId, result as CarcassYieldResult);
    case "close": {
      const closed = mergeClose(base, op.sessionId);
      return {
        ...closed,
        manejoSessions: patchSession(closed.manejoSessions, op.sessionId, { pending: undefined }),
      };
    }
  }
}

/** An op left the fila unsent (Manter do servidor, Descartar): its local effects go. */
function dropLocally(s: HerdStore, op: OutboxOp): HerdSlices {
  const base = stripLocal(s, op.id, startedBy(op));
  if (op.kind === "close") {
    return {
      ...base,
      manejoSessions: patchSession(base.manejoSessions, op.sessionId, {
        status: "open",
        pending: undefined,
      }),
    };
  }
  return base;
}

/** Sign-out: this user's snapshots go (the farm, money included); the fila stays for their return. */
export async function clearOfflineSnapshots(): Promise<void> {
  setSyncUser(undefined);
  try {
    const userId = await metaStore().get(LAST_USER_KEY);
    if (userId) await clearUserSnapshots(snapshotStore(), userId);
  } catch {
    // no IndexedDB: nothing was saved
  }
}

/**
 * Puts a manejo action in the fila and applies it to the store at once, so
 * the brete moves on without signal; the engine sends it when it can.
 */
async function queueOp(
  kind: OutboxKind,
  sessionId: string,
  body: object,
  earTag?: string
): Promise<OutboxOp> {
  const userId =
    getSyncUser() ??
    (await metaStore()
      .get(LAST_USER_KEY)
      .catch(() => undefined));
  const op = await getOutbox().enqueue({
    id: crypto.randomUUID(),
    // ponytail: "" only on a phone that never finished a first online load; such ops wait unsent.
    userId: userId ?? "",
    farmId: useHerdStore.getState().activeFarmId ?? 0,
    sessionId,
    kind,
    earTag,
    body: { ...body } as Record<string, unknown>,
  });
  useHerdStore.setState((s) => applyLocally(s, op));
  await persistSnapshot(useHerdStore.getState);
  void getEngine()?.kick("enqueue");
  return op;
}

/** A pass queued: the brete goes on as if the server had said yes. */
async function queuePass(
  kind: OutboxKind,
  sessionId: string,
  earTag: string,
  body: object
): Promise<true> {
  await queueOp(kind, sessionId, body, earTag);
  return true;
}

/**
 * Desfazer while the session has a fila: a pass still waiting is simply taken
 * out, with its provisional records, and nothing is sent; otherwise the undo
 * itself waits in the fila behind the pass.
 */
async function queueReopen(sessionId: string, earTag: string): Promise<void> {
  const entry = useHerdStore
    .getState()
    .manejoSessions.find((m) => m.id === sessionId)
    ?.animals.find((a) => a.earTag === earTag);
  const fila = getOutbox();
  const waiting = entry?.localOpId === undefined ? undefined : await fila.get(entry.localOpId);
  if (waiting?.state !== "queued") {
    await queueOp("reopen", sessionId, {}, earTag);
    return;
  }
  // ponytail: the engine could pick the op up between get and remove when online; the
  // server then answers the undo that follows, so nothing is lost — only a flicker.
  await fila.remove(waiting.id);
  useHerdStore.setState((s) => stripLocal(s, waiting.id));
  await persistSnapshot(useHerdStore.getState);
  void getEngine()?.kick("enqueue");
}

/** Hooks the fila's engine to this store (the first call builds it; see wireOffline). */
function startOffline(): void {
  wireOffline({
    animalIdByEarTag: (earTag) =>
      useHerdStore.getState().animals.find((a) => a.earTag === earTag)?.id,
    onApplied: (op, result) => {
      useHerdStore.setState((s) => reconcile(s, op, result));
      void persistSnapshot(useHerdStore.getState);
    },
    onDropped: (op) => {
      useHerdStore.setState((s) => dropLocally(s, op));
      void persistSnapshot(useHerdStore.getState);
    },
    onBatchResolved: async () => {
      await reloadHerd(useHerdStore.setState);
      // The reload brought the server's herd; what is still in the fila goes back on top.
      const ops = await getOutbox().list(getSyncUser() ?? "");
      useHerdStore.setState((s) =>
        ops.reduce<HerdStore>((acc, op) => ({ ...acc, ...applyLocally(acc, op) }), s)
      );
      await persistSnapshot(useHerdStore.getState);
    },
    onAuthRequired: () => {
      toast.error("Entre de novo para enviar");
    },
    onChange: (sync, ops) => useHerdStore.setState({ sync, ops, outboxCount: ops.length }),
  });
}

export const useHerdStore = create<HerdStore>()((set, get) => ({
```

- [ ] **Step 9: Store — initial slices and wiring on `load`**

Old:

```ts
  pendingInvites: [],

  load: async () => {
    if (get().loaded) return;
```

New:

```ts
  pendingInvites: [],
  // Until the engine reports (first load), nothing is waiting and nothing says "Sem conexão".
  sync: { online: true, phase: "idle", counts: { queued: 0, conflict: 0, failed: 0 } },
  outboxCount: 0,
  ops: [],

  load: async () => {
    startOffline();
    if (get().loaded) return;
```

Then, in Task 4's `load`, the fila learns who is signed in. Old:

```ts
        offline: true,
        snapshotAt: snap.savedAt,
      });
      return null;
```

New:

```ts
        offline: true,
        snapshotAt: snap.savedAt,
      });
      // No session to ask offline: the fila works for the user whose snapshot this is.
      void metaStore()
        .get(LAST_USER_KEY)
        .then(setSyncUser)
        .catch(() => {});
      return null;
```

Old:

```ts
    void rememberUser()
      .then((userId) => (userId ? persistSnapshot(get) : undefined))
      .catch(() => {});
```

New:

```ts
    void rememberUser()
      .then((userId) => {
        setSyncUser(userId ?? undefined);
        return userId ? persistSnapshot(get) : undefined;
      })
      .catch(() => {});
```

- [ ] **Step 10: Store — `startManejoSession`**

Old:

```ts
  startManejoSession: async (input) => {
    const { data, error } = await api.manejo.post(input);
    if (error) apiFail("iniciar o manejo", error);
```

New:

```ts
  startManejoSession: async (input) => {
    // An entrada creates animals on the server: it never starts on the phone.
    const queueable = input.kind !== "entry";
    if (queueable && (await mustQueue())) {
      return (await queueOp("start", crypto.randomUUID(), input)).sessionId;
    }
    const { data, error } = await api.manejo.post(input);
    if (error) {
      if (queueable && networkFailed(error)) {
        return (await queueOp("start", crypto.randomUUID(), input)).sessionId;
      }
      apiFail("iniciar o manejo", error);
    }
```

- [ ] **Step 11: Store — `completeManejoAnimal`**

Old:

```ts
  completeManejoAnimal: async (sessionId, earTag, data = {}) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const response = await api.manejo({ id: sessionId }).animals({ animalId }).complete.post(data);
    if (response.error) {
```

New:

```ts
  completeManejoAnimal: async (sessionId, earTag, data = {}) => {
    if (await mustQueue(sessionId)) return queuePass("complete", sessionId, earTag, data);
    const animalId = animalIdByEarTag(get().animals, earTag);
    const response = await api.manejo({ id: sessionId }).animals({ animalId }).complete.post(data);
    if (response.error) {
      if (networkFailed(response.error)) return queuePass("complete", sessionId, earTag, data);
```

- [ ] **Step 12: Store — `skipManejoAnimal`**

Old:

```ts
  skipManejoAnimal: async (sessionId, earTag, notes) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).skip.post({ notes });
    if (error) {
```

New:

```ts
  skipManejoAnimal: async (sessionId, earTag, notes) => {
    if (await mustQueue(sessionId)) {
      await queuePass("skip", sessionId, earTag, { notes });
      return;
    }
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).skip.post({ notes });
    if (error) {
      if (networkFailed(error)) {
        await queuePass("skip", sessionId, earTag, { notes });
        return;
      }
```

- [ ] **Step 13: Store — `setAsideManejoAnimal`**

Old:

```ts
  setAsideManejoAnimal: async (sessionId, earTag, input) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api
      .manejo({ id: sessionId })
      .animals({ animalId })["set-aside"]
      .post(input);
    if (error) {
```

New:

```ts
  setAsideManejoAnimal: async (sessionId, earTag, input) => {
    if (await mustQueue(sessionId)) return queuePass("set-aside", sessionId, earTag, input);
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api
      .manejo({ id: sessionId })
      .animals({ animalId })["set-aside"]
      .post(input);
    if (error) {
      if (networkFailed(error)) return queuePass("set-aside", sessionId, earTag, input);
```

- [ ] **Step 14: Store — `baixaManejoAnimal`**

Old:

```ts
  baixaManejoAnimal: async (sessionId, earTag, input) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const notes = input.notes?.trim();
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).baixa.post({
      reason: input.reason,
      date: input.date,
      notes: notes ? notes : undefined,
    });
    if (error) {
```

New:

```ts
  baixaManejoAnimal: async (sessionId, earTag, input) => {
    const notes = input.notes?.trim();
    const body = { reason: input.reason, date: input.date, notes: notes ? notes : undefined };
    if (await mustQueue(sessionId)) return queuePass("baixa", sessionId, earTag, body);
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).baixa.post(body);
    if (error) {
      if (networkFailed(error)) return queuePass("baixa", sessionId, earTag, body);
```

- [ ] **Step 15: Store — `reopenManejoAnimal`**

Old:

```ts
  reopenManejoAnimal: async (sessionId, earTag) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).reopen.post();
    if (error) {
```

New:

```ts
  reopenManejoAnimal: async (sessionId, earTag) => {
    if (await mustQueue(sessionId)) return queueReopen(sessionId, earTag);
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).reopen.post();
    if (error) {
      if (networkFailed(error)) return queueReopen(sessionId, earTag);
```

- [ ] **Step 16: Store — `setSaleCarcassYield`**

Old:

```ts
  setSaleCarcassYield: async (sessionId, carcassYieldPct) => {
    const { data, error } = await api
      .manejo({ id: sessionId })["carcass-yield"]
      .post({ carcassYieldPct });
    if (error) apiFail("definir o rendimento de carcaça", error);
```

New:

```ts
  setSaleCarcassYield: async (sessionId, carcassYieldPct) => {
    if (await mustQueue(sessionId)) {
      await queueOp("carcass-yield", sessionId, { carcassYieldPct });
      return;
    }
    const { data, error } = await api
      .manejo({ id: sessionId })["carcass-yield"]
      .post({ carcassYieldPct });
    if (error) {
      if (networkFailed(error)) {
        await queueOp("carcass-yield", sessionId, { carcassYieldPct });
        return;
      }
      apiFail("definir o rendimento de carcaça", error);
    }
```

- [ ] **Step 17: Store — `closeManejoSession`**

Old:

```ts
  closeManejoSession: async (sessionId) => {
    const { error } = await api.manejo({ id: sessionId }).close.post();
    if (error) {
```

New:

```ts
  closeManejoSession: async (sessionId) => {
    if (await mustQueue(sessionId)) {
      await queueOp("close", sessionId, {});
      return;
    }
    const { error } = await api.manejo({ id: sessionId }).close.post();
    if (error) {
      if (networkFailed(error)) {
        await queueOp("close", sessionId, {});
        return;
      }
```

- [ ] **Step 18: Store — `registerEntryAnimal` never queues**

Old:

```ts
  registerEntryAnimal: async (sessionId, animal) => {
    const { data, error } = await api.manejo({ id: sessionId }).animals.post(animal);
```

New:

```ts
  registerEntryAnimal: async (sessionId, animal) => {
    // An entrada creates the animal on the server; the fila never holds one.
    if (!navigator.onLine) {
      toast.error("Entrada precisa de sinal");
      return false;
    }
    const { data, error } = await api.manejo({ id: sessionId }).animals.post(animal);
```

- [ ] **Step 19: Sign-out clears the snapshots, keeps the fila**

In `lib/auth/navigation.ts`, old:

```ts
  return useCallback(async () => {
    await authClient.signOut();
```

New:

```ts
  return useCallback(async () => {
    // The snapshot holds this user's farm and leaves with them. The fila stays:
    // it is sent once the same user signs in again. Imported on demand so the
    // sign-in pages that use this module do not load the herd store.
    const { clearOfflineSnapshots } = await import("@/lib/store/useHerdStore");
    await clearOfflineSnapshots();
    await authClient.signOut();
```

- [ ] **Step 20: Write the hook**

Create `lib/offline/useOffline.ts`:

```ts
/**
 * Everything the offline UI reads and does: the online flag, the snapshot
 * boot, the fila and its sync, the Sincronização sheet and the vaqueiro's
 * choices on it.
 */
import { create } from "zustand";
import type { SyncStatus } from "@/lib/offline/sync";
import type { OutboxOp } from "@/lib/offline/types";
import { getEngine } from "@/lib/store/offlineWiring";
import { useHerdStore } from "@/lib/store/useHerdStore";

/** One Sincronização sheet for the pill, the tab badge, the banner and the Manejo list. */
const useSheet = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export interface OfflineState {
  online: boolean;
  /** Booted from the snapshot (Task 4). */
  offline: boolean;
  snapshotAt: string | null;
  sync: SyncStatus;
  ops: OutboxOp[];
  open: boolean;
  setOpen(v: boolean): void;
  resolve(opId: string, choice: "server" | "mine"): Promise<void>;
  resolveAll(choice: "server" | "mine"): Promise<void>;
  discard(opId: string): Promise<void>;
  syncNow(): Promise<void>;
}

export function useOffline(): OfflineState {
  const offline = useHerdStore((s) => s.offline);
  const snapshotAt = useHerdStore((s) => s.snapshotAt);
  const sync = useHerdStore((s) => s.sync);
  const ops = useHerdStore((s) => s.ops);
  const open = useSheet((s) => s.open);
  const setOpen = useSheet((s) => s.setOpen);
  return {
    online: sync.online,
    offline,
    snapshotAt,
    sync,
    ops,
    open,
    setOpen,
    resolve: async (opId, choice) => {
      await getEngine()?.resolve(opId, choice);
    },
    resolveAll: async (choice) => {
      await getEngine()?.resolveAll(choice);
    },
    discard: async (opId) => {
      await getEngine()?.discard(opId);
    },
    syncNow: async () => {
      await getEngine()?.kick("manual");
    },
  };
}
```

- [ ] **Step 21: Write the store test (queue path, no request)**

Mocking costs ~20 lines (the Eden client, the auth client, IndexedDB, the wiring singletons over the memory outbox, sonner), so the store is tested directly. Create `lib/store/__tests__/queueOrSend.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Animal, ManejoSession } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/auth/client", () => ({ authClient: {} }));
vi.mock("@/lib/api/client", () => ({ api: { manejo: vi.fn() } }));
// No IndexedDB in node: every store the store module opens lives in memory.
vi.mock("@/lib/offline/db", async (importOriginal) => {
  const db = await importOriginal<typeof import("@/lib/offline/db")>();
  return { ...db, openStore: () => db.memoryStore() };
});
vi.mock("@/lib/store/offlineWiring", async () => {
  const { createOutbox } = await import("@/lib/offline/outbox");
  const { memoryStore } = await import("@/lib/offline/db");
  const outbox = createOutbox(memoryStore(), memoryStore());
  const engine = { kick: vi.fn(async () => {}) };
  return {
    getOutbox: () => outbox,
    getEngine: () => engine,
    wireOffline: vi.fn(),
    setSyncUser: vi.fn(),
    getSyncUser: () => "u1",
  };
});

import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { getEngine, getOutbox } from "@/lib/store/offlineWiring";
import { useHerdStore } from "@/lib/store/useHerdStore";

const animal: Animal = {
  id: "a-101",
  earTag: "101",
  category: "cow",
  breed: "Nelore",
  sex: "female",
  birthDate: "2022-01-10",
  lotId: "L1",
  active: true,
  weighings: [],
};

const session: ManejoSession = {
  id: "s1",
  name: "Vacinação",
  date: "2026-09-25",
  status: "open",
  kind: "health",
  weighing: false,
  treatment: { type: "vaccine", name: "Aftosa", withdrawalDays: 0 },
  animals: [{ earTag: "101", outcome: "pending" }],
};

const entry = () => useHerdStore.getState().manejoSessions[0].animals[0];

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { onLine: false });
  for (const op of await getOutbox().list()) await getOutbox().remove(op.id);
  useHerdStore.setState({
    animals: [animal],
    treatments: [],
    semenBulls: [],
    manejoSessions: [session],
    activeFarmId: 1,
  });
});

describe("manejo actions without signal", () => {
  it("queue a pass and show it at once, sending nothing", async () => {
    expect(await useHerdStore.getState().completeManejoAnimal("s1", "101", { notes: "calma" })).toBe(
      true
    );
    const [op] = await getOutbox().list();
    expect(op).toMatchObject({
      kind: "complete",
      userId: "u1",
      sessionId: "s1",
      earTag: "101",
      body: { notes: "calma" },
      state: "queued",
    });
    expect(entry()).toMatchObject({ outcome: "done", pending: true, localOpId: op.id });
    expect(useHerdStore.getState().treatments).toEqual([
      expect.objectContaining({ animalEarTag: "101", localOpId: op.id }),
    ]);
    expect(getEngine()?.kick).toHaveBeenCalledWith("enqueue");
    expect(api.manejo).not.toHaveBeenCalled();
  });

  it("undo a pass that never left the phone: the op and its records go, nothing is sent", async () => {
    await useHerdStore.getState().completeManejoAnimal("s1", "101");
    await useHerdStore.getState().reopenManejoAnimal("s1", "101");
    expect(await getOutbox().list()).toEqual([]);
    expect(entry().outcome).toBe("pending");
    expect(entry().pending).toBeUndefined();
    expect(entry().localOpId).toBeUndefined();
    expect(useHerdStore.getState().treatments).toEqual([]);
    expect(api.manejo).not.toHaveBeenCalled();
  });

  it("start a manejo on the phone with its own id, the start first in the fila", async () => {
    const input = { date: "2026-09-25", kind: "weighing" as const, earTags: ["101"], weighing: true };
    const id = await useHerdStore.getState().startManejoSession(input);
    const [op] = await getOutbox().list();
    expect(op).toMatchObject({ kind: "start", sessionId: id, body: input });
    expect(useHerdStore.getState().manejoSessions.find((m) => m.id === id)).toMatchObject({
      status: "open",
      pending: true,
    });
    expect(api.manejo).not.toHaveBeenCalled();
  });

  it("refuse an entrada animal", async () => {
    const registered = await useHerdStore.getState().registerEntryAnimal("s1", {
      earTag: "900",
      category: "steer",
      breed: "Nelore",
      sex: "male",
      birthDate: "2025-01-01",
    });
    expect(registered).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Entrada precisa de sinal");
    expect(api.manejo).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 22: Run the new tests and the suites they touch**

Run: `pnpm exec vitest run lib/offline/__tests__ lib/store/__tests__ --exclude '**/worktrees/**'`
Expected: PASS — every file green; `apiTransport.test.ts` 6 tests, `queueOrSend.test.ts` 4 tests, `sync.test.ts` 14 tests, plus the earlier store/offline tests unchanged.

- [ ] **Step 23: Typecheck and lint**

Run: `pnpm tsc --noEmit`
Expected: no output, exit 0.

Run: `pnpm exec eslint lib/offline/apiTransport.ts lib/offline/useOffline.ts lib/offline/__tests__/apiTransport.test.ts lib/store/offlineWiring.ts lib/store/useHerdStore.ts lib/store/__tests__/queueOrSend.test.ts lib/auth/navigation.ts`
Expected: no output, exit 0.

- [ ] **Step 24: Commit**

```bash
git add lib/offline/apiTransport.ts lib/offline/useOffline.ts lib/offline/__tests__/apiTransport.test.ts lib/store/offlineWiring.ts lib/store/useHerdStore.ts lib/store/__tests__/queueOrSend.test.ts lib/auth/navigation.ts
git commit -m "feat(offline): queue the brete's passes and sync them in order" -- lib/offline/apiTransport.ts lib/offline/useOffline.ts lib/offline/__tests__/apiTransport.test.ts lib/store/offlineWiring.ts lib/store/useHerdStore.ts lib/store/__tests__/queueOrSend.test.ts lib/auth/navigation.ts
```

---

### Task 10: Show the fila, the conflicts and the offline state at the brete

**Files:**
- Create: `components/offline/QueuedPassesList.tsx` (also exports `clock`, `opAction`, `OpRow`, `PILL`, reused by the others), `components/offline/OfflinePill.tsx`, `components/offline/OfflineBanner.tsx`, `components/offline/SyncSheet.tsx`, `components/offline/SyncBadge.tsx`, `components/offline/OfflineDataLine.tsx`
- Modify:
  - `components/manejo/session-runner.tsx`: imports after `:52` (`import { ReadOnlyPill }`), `badges` at `:302`, banner after the `PageHeader` close (`:341`), list after the "Todos os animais manejados" card (`:535`), list at the top of the right column (`:560`)
  - `components/manejo/register-manejo-dialog.tsx`: `:15` lucide import, `:18` useToast import, `:189` `const { addToast }`, `:401` `</DialogHeader>`, `:414` `<SelectItem>`, `:420` finance helper, `:828-836` submit button
  - `components/manejo/open-sessions.tsx`: `:9` lucide import, `:33` `ManejoTypePill`
  - `components/layout/MobileTabBar.tsx`: `:22` cn import, `:81` tab icon
  - `components/layout/Sidebar.tsx`: `:13` cn import, `:102` `{item.label}`
  - `components/layout/PageHeader.tsx`: `:1` import, `:23` subtitle
  - `components/layout/AppShell.tsx`: `:8` PrintRoot import, `:72-73` `<PrintRoot />` + Task 1's `<ServiceWorker />`. T1 lands first (wave 0) and adds `<ServiceWorker />` right after `<PrintRoot />`; this hunk anchors on both lines and adds `<SyncSheet />` after them.
- Test: none. The repo has no component tests. Checks are `pnpm tsc --noEmit` and eslint. Task 11's smoke run exercises the screens.

**Interfaces:**
- Consumes (from T9, contract "Store integration"): `useOffline()` from `@/lib/offline/useOffline`, which returns `{ online, offline, snapshotAt, sync, ops, open, setOpen, resolve, resolveAll, discard, syncNow }`; `useHerdStore((s) => s.outboxCount)`; types `OutboxOp`, `OutboxState` from `@/lib/offline/types`; `SyncStatus` fields `phase`, `sending`, `lastSyncedAt`, `offlineSince`, `counts`; `ManejoSession.pending` from `@/lib/types`. `startManejoSession` queues offline on its own (T9); the dialog does not change how it calls it.
- Produces: `OfflinePill()`, `OfflineBanner({ sessionId: string })`, `QueuedPassesList({ sessionId: string; className?: string })`, `SyncSheet()`, `SyncBadge({ className?: string })`, `OfflineDataLine()`, and the helpers `clock(iso)`, `opAction(op)`, `OpRow({ op })`, `PILL`.

Decisions this task takes (the plan reviewer should check them):
- The "No servidor" box shows `Concluído · 299 kg` with **no author and no time**. `detail.server` is a `ManejoSessionAnimal`, which records neither. The spec's "por Ana às 14:15" needs a server change, which is out of scope.
- The banner shows only while offline. Online with passes still waiting, the header pill ("N a enviar") and the "Guardados no celular" list carry the state, because the banner's sentence ("Serão enviados quando o sinal voltar") would be false online.
- Tapping the Manejo tab or sidebar row still navigates. The badge is only visual. The spec says tapping it opens the sheet, but a button nested inside the tab link is invalid HTML.
- The "Conflito" pill and the heading use the attention tone, as this task specifies. The canvas draws them in the overdue red, and "falha" keeps overdue.
- The canvas desktop runner puts inline "a enviar" markers in Manejados. This task renders the "Guardados no celular" card at the top of the right column instead, so there is one component on both layouts.

- [ ] **Step 1: Create `components/offline/QueuedPassesList.tsx`**

```tsx
"use client";

/**
 * "Guardados no celular": the operations of one manejo waiting in the fila,
 * newest first. The row and the op wording are shared with the Sincronização
 * sheet, so both read the same.
 */
import { CloudOff, RefreshCw } from "lucide-react";
import type { OutboxOp, OutboxState } from "@/lib/offline/types";
import { useOffline } from "@/lib/offline/useOffline";
import { formatKg } from "@/lib/domain/format";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

/** The StatusPill shape, for pills whose label is not a StatusVisual. */
export const PILL =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

/** "14:07" from an ISO datetime, in the phone's time zone. */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const SET_ASIDE_LABEL: Record<string, string> = { rejected: "Refugo", held: "Dúvida" };

/** What the operation did, in the runner's words, and the weight it carried. */
export function opAction(op: OutboxOp): { label: string; weightKg?: number } {
  const weightKg = typeof op.body.weightKg === "number" ? op.body.weightKg : undefined;
  switch (op.kind) {
    case "complete":
      return { label: "Concluído", weightKg };
    case "skip":
      return { label: "Pulado" };
    case "set-aside":
      return { label: SET_ASIDE_LABEL[String(op.body.list)] ?? "Apartado", weightKg };
    case "baixa":
      return { label: "Baixa" };
    case "reopen":
      return { label: "Desfeito" };
    case "close":
      return { label: "Encerrado" };
    case "start":
      return { label: "Iniciado" };
    case "carcass-yield":
      return {
        label:
          typeof op.body.carcassYieldPct === "number"
            ? `Rendimento ${op.body.carcassYieldPct}%`
            : "Rendimento",
      };
  }
}

function OpState({ state }: { state: OutboxState }) {
  if (state === "sending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-brand">
        <RefreshCw className="size-3 motion-safe:animate-spin" aria-hidden />
        enviando…
      </span>
    );
  }
  if (state === "conflict") {
    return <span className={cn(PILL, "bg-attention-soft text-attention")}>conflito</span>;
  }
  if (state === "failed") {
    return <span className={cn(PILL, "bg-overdue-soft text-overdue")}>falha</span>;
  }
  return <span className="text-xs text-ink-soft">a enviar</span>;
}

/** One operation: hora · brinco · ação · estado. */
export function OpRow({ op }: { op: OutboxOp }) {
  const { label, weightKg } = opAction(op);
  return (
    <li className="flex min-h-11 items-center gap-2 px-1 py-2">
      <CloudOff className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
      <span className="font-mono text-xs text-ink-soft">{clock(op.createdAt)}</span>
      {op.earTag ? (
        <span className="font-mono text-sm font-medium text-ink">{op.earTag}</span>
      ) : null}
      <span className="text-xs whitespace-nowrap text-ink-soft">
        {label}
        {weightKg !== undefined ? (
          <>
            {" · "}
            <span className="font-mono">{formatKg(weightKg)}</span>
          </>
        ) : null}
      </span>
      <span className="ml-auto shrink-0">
        <OpState state={op.state} />
      </span>
    </li>
  );
}

export function QueuedPassesList({
  sessionId,
  className,
}: {
  sessionId: string;
  className?: string;
}) {
  const { ops } = useOffline();
  const mine = ops.filter((op) => op.sessionId === sessionId).sort((a, b) => b.seq - a.seq);
  if (mine.length === 0) return null;
  return (
    <SectionCard
      title="Guardados no celular"
      subtitle={`${mine.length} ${mine.length === 1 ? "passe" : "passes"} a enviar`}
      className={className}
    >
      <ul className="-my-1 max-h-72 divide-y divide-hairline overflow-y-auto">
        {mine.map((op) => (
          <OpRow key={op.id} op={op} />
        ))}
      </ul>
    </SectionCard>
  );
}
```

- [ ] **Step 2: Create `components/offline/OfflinePill.tsx`**

```tsx
"use client";

/**
 * The runner's header pill: "Sem conexão" offline, "Sincronizando" while a
 * replay is in flight, "N a enviar" online with a non-empty fila. Tapping it
 * opens the Sincronização sheet. Online with nothing waiting, it is gone.
 */
import { CloudUpload, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";
import { useOffline } from "@/lib/offline/useOffline";
import { PILL } from "@/components/offline/QueuedPassesList";
import { cn } from "@/lib/utils";

interface PillLook {
  label: string;
  Icon: LucideIcon;
  tone: string;
  spin: boolean;
}

export function OfflinePill() {
  const { online, sync, setOpen } = useOffline();
  const count = sync.counts.queued + sync.counts.conflict + sync.counts.failed;
  const look: PillLook | null = !online
    ? { label: "Sem conexão", Icon: WifiOff, tone: "bg-attention-soft text-attention", spin: false }
    : sync.phase === "sending"
      ? { label: "Sincronizando", Icon: RefreshCw, tone: "bg-scheduled-soft text-scheduled", spin: true }
      : count > 0
        ? { label: `${count} a enviar`, Icon: CloudUpload, tone: "bg-brand-soft text-brand", spin: false }
        : null;
  if (!look) return null;
  const { label, Icon, tone, spin } = look;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      title="Abrir a sincronização"
      className="inline-flex min-h-11 items-center md:min-h-0"
    >
      <span className={cn(PILL, tone)}>
        <Icon className={cn("size-3", spin && "motion-safe:animate-spin")} aria-hidden />
        {label}
      </span>
    </button>
  );
}
```

- [ ] **Step 3: Create `components/offline/OfflineBanner.tsx`**

```tsx
"use client";

/**
 * Under the runner's header while offline: since when, and how many of this
 * manejo's passes wait on the phone, with "Ver fila" into the sheet.
 */
import { CloudOff, WifiOff } from "lucide-react";
import { useOffline } from "@/lib/offline/useOffline";
import { clock } from "@/components/offline/QueuedPassesList";
import { Button } from "@/components/ui/button";

export function OfflineBanner({ sessionId }: { sessionId: string }) {
  const { online, sync, ops, setOpen } = useOffline();
  if (online) return null;
  const count = ops.filter((op) => op.sessionId === sessionId).length;
  const since = sync.offlineSince ? `Sem conexão desde ${clock(sync.offlineSince)}` : "Sem conexão";
  return (
    <section
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-attention/25 bg-attention-soft pt-3 pr-3 pb-2 pl-4"
    >
      <div className="flex items-start gap-2.5 text-attention">
        <WifiOff className="mt-px size-[18px] shrink-0" aria-hidden />
        <p className="text-sm text-ink">
          {count > 0 ? (
            <>
              <span className="font-medium">
                {since} · {count} {count === 1 ? "passe guardado" : "passes guardados"} no celular.
              </span>{" "}
              Serão enviados quando o sinal voltar.
            </>
          ) : (
            <>
              <span className="font-medium">{since}.</span> Os passes ficam guardados no celular e
              serão enviados quando o sinal voltar.
            </>
          )}
        </p>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 text-brand md:min-h-0"
          onClick={() => setOpen(true)}
        >
          <CloudOff aria-hidden />
          Ver fila
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create `components/offline/SyncSheet.tsx`**

```tsx
"use client";

/**
 * "Sincronização": the whole fila. A bottom sheet on the phone, a right-side
 * panel from md up. It shows the status line, A enviar, Conflitos (per item or
 * in batch: keep the server's record or resend the phone's with force) and
 * Falhas (Descartar only), with "Sincronizar agora" at the foot. It is mounted
 * once in AppShell and opened through useOffline().setOpen.
 */
import { useState } from "react";
import { RefreshCw, TriangleAlert, Wifi } from "lucide-react";
import type { OutboxOp } from "@/lib/offline/types";
import type { ManejoOutcome } from "@/lib/types";
import { useOffline } from "@/lib/offline/useOffline";
import { formatKg } from "@/lib/domain/format";
import { useToast } from "@/components/providers/Toasts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BOTTOM_SHEET } from "@/components/finance/extrato/ExtratoFilters";
import { clock, OpRow, opAction, PILL } from "@/components/offline/QueuedPassesList";
import { cn } from "@/lib/utils";

const SHEET = cn(
  BOTTOM_SHEET,
  "max-h-[85dvh] gap-5 overflow-y-auto md:top-0 md:right-0 md:bottom-0 md:left-auto md:h-dvh md:max-h-dvh md:w-[420px] md:max-w-[420px] md:rounded-none md:rounded-l-xl"
);

const HEADING = "text-xs font-semibold tracking-wide text-ink-soft uppercase";

const OUTCOME_TEXT: Record<ManejoOutcome, string> = {
  pending: "Pendente",
  done: "Concluído",
  skipped: "Pulado",
  rejected: "Refugo",
  held: "Dúvida",
};

const ERROR_TEXT: Record<string, string> = {
  entry_not_actionable: "Já tratado em outro aparelho",
  held_pending: "Há dúvidas por decidir",
  out_of_stock: "Touro sem doses",
  animal_inactive: "Animal já saiu do rebanho",
  has_diagnosis: "Vaca já tem diagnóstico",
  session_closed: "Manejo já encerrado",
  not_female: "Não é fêmea",
  bull_not_found: "Touro não encontrado",
  id_taken: "Manejo já existe em outra fazenda",
  dependent: "Depende do passe anterior deste animal",
};

function reason(op: OutboxOp): string {
  return op.detail?.message ?? ERROR_TEXT[op.detail?.error ?? ""] ?? "Recusado pelo servidor";
}

/**
 * The server's side of a conflito. The entry carries no author and no time:
 * the server stores neither per pass, so the box names only what was recorded.
 */
function serverText(op: OutboxOp): string {
  const server = op.detail?.server;
  if (!server) return reason(op);
  return `${OUTCOME_TEXT[server.outcome]}${
    server.weightKg !== undefined ? ` · ${formatKg(server.weightKg)}` : ""
  }`;
}

/** Why "Aplicar o meu" cannot go, or null when it can. */
function blockedReason(op: OutboxOp): string | null {
  if (op.detail?.sessionClosed) return "manejo já encerrado";
  if (op.detail?.error === "has_diagnosis") return "vaca já tem diagnóstico";
  if (op.detail?.error === "dependent") return "depende do anterior";
  return null;
}

function StatusLine() {
  const { online, sync } = useOffline();
  if (sync.phase === "paused_auth") {
    return (
      <p className="flex items-center gap-1.5 text-sm text-attention">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        Entre de novo para enviar
      </p>
    );
  }
  if (!online) {
    return (
      <p className="text-sm text-ink-soft">
        {sync.offlineSince ? `Sem conexão desde ${clock(sync.offlineSince)}` : "Sem conexão"}
      </p>
    );
  }
  if (sync.phase === "sending" && sync.sending) {
    const { done, total } = sync.sending;
    return (
      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-sm text-healthy">
          <Wifi className="size-4 shrink-0" aria-hidden />
          <span>
            Conectado · enviando <span className="font-mono">{Math.min(done + 1, total)}</span> de{" "}
            <span className="font-mono">{total}</span>…
          </span>
        </p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="Envio dos passes"
          className="h-1 overflow-hidden rounded-full bg-surface"
        >
          <div
            className="h-full bg-brand transition-[width]"
            style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
          />
        </div>
      </div>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-sm text-healthy">
      <Wifi className="size-4 shrink-0" aria-hidden />
      {sync.lastSyncedAt && sync.counts.queued === 0
        ? `Tudo enviado às ${clock(sync.lastSyncedAt)}`
        : "Conectado"}
    </p>
  );
}

function Side({ label, text, server }: { label: string; text: string; server?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-md border border-hairline px-2.5 py-2",
        server ? "bg-surface" : "bg-panel"
      )}
    >
      <span className="text-[11px] font-medium text-ink-soft">{label}</span>
      <span className="text-[13px] leading-[18px] text-ink">{text}</span>
    </div>
  );
}

function ConflictItem({
  op,
  disabled,
  onResolve,
}: {
  op: OutboxOp;
  disabled: boolean;
  onResolve: (choice: "server" | "mine") => void;
}) {
  const mine = opAction(op);
  const blocked = blockedReason(op);
  return (
    <li className="flex flex-col gap-2 border-t border-hairline py-3">
      <div className="flex items-center gap-2">
        {op.earTag ? (
          <span className="font-mono text-base font-semibold text-ink">{op.earTag}</span>
        ) : null}
        <span className={cn(PILL, "bg-attention-soft text-attention")}>
          <TriangleAlert className="size-3" aria-hidden />
          Conflito
        </span>
      </div>
      <div className="grid gap-1.5">
        <Side
          label="Neste celular"
          text={`${mine.label} ${clock(op.createdAt)}${
            mine.weightKg !== undefined ? ` · ${formatKg(mine.weightKg)}` : ""
          }`}
        />
        <Side label="No servidor" text={serverText(op)} server />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-1"
          disabled={disabled}
          onClick={() => onResolve("server")}
        >
          Manter do servidor
        </Button>
        <div className="flex flex-1 flex-col gap-1">
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={disabled || blocked !== null}
            onClick={() => onResolve("mine")}
          >
            Aplicar o meu
          </Button>
          {blocked ? <p className="text-center text-xs text-ink-soft">{blocked}</p> : null}
        </div>
      </div>
    </li>
  );
}

export function SyncSheet() {
  const { online, sync, ops, open, setOpen, resolve, resolveAll, discard, syncNow } = useOffline();
  const { addToast } = useToast();
  /** A choice in flight: its buttons must not double-fire. */
  const [busy, setBusy] = useState(false);
  const sending = sync.phase === "sending";
  const toSend = ops.filter((op) => op.state === "queued" || op.state === "sending");
  const conflicts = ops.filter((op) => op.state === "conflict");
  const failed = ops.filter((op) => op.state === "failed");

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await action();
      addToast({ messageType: "success", text: done });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={SHEET} aria-describedby={undefined}>
        <DialogHeader className="pr-10">
          <DialogTitle className="text-lg leading-6 font-semibold">Sincronização</DialogTitle>
          <StatusLine />
        </DialogHeader>

        {ops.length === 0 ? (
          <p className="text-sm text-ink-soft">Nada guardado no celular.</p>
        ) : null}

        {toSend.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className={HEADING}>
              A enviar · <span className="font-mono">{toSend.length}</span>
            </h3>
            <ul className="divide-y divide-hairline">
              {toSend.map((op) => (
                <OpRow key={op.id} op={op} />
              ))}
            </ul>
          </section>
        ) : null}

        {conflicts.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className={cn(HEADING, "text-attention")}>
              Conflitos · <span className="font-mono">{conflicts.length}</span>
            </h3>
            <p className="text-[13px] leading-[18px] text-ink-soft">
              Estes animais já foram tratados em outro aparelho. Escolha qual passe vale.
            </p>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 px-1.5"
                disabled={busy || sending}
                onClick={() => run(() => resolveAll("mine"), "Seus passes foram reenviados")}
              >
                Aplicar todos os meus
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 px-1.5"
                disabled={busy || sending}
                onClick={() => run(() => resolveAll("server"), "Registros do servidor mantidos")}
              >
                Manter todos do servidor
              </Button>
            </div>
            <ul className="mt-1">
              {conflicts.map((op) => (
                <ConflictItem
                  key={op.id}
                  op={op}
                  disabled={busy}
                  onResolve={(choice) =>
                    run(
                      () => resolve(op.id, choice),
                      choice === "mine" ? "Seu passe foi reenviado" : "Registro do servidor mantido"
                    )
                  }
                />
              ))}
            </ul>
          </section>
        ) : null}

        {failed.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className={cn(HEADING, "text-overdue")}>
              Falhas · <span className="font-mono">{failed.length}</span>
            </h3>
            <ul className="divide-y divide-hairline">
              {failed.map((op) => (
                <li key={op.id} className="flex min-h-11 items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      {op.earTag ? (
                        <span className="font-mono text-sm font-medium text-ink">{op.earTag}</span>
                      ) : null}
                      <span className="text-xs text-ink-soft">
                        {opAction(op).label} · {clock(op.createdAt)}
                      </span>
                    </p>
                    <p className="text-xs text-overdue">{reason(op)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 shrink-0 text-ink-soft hover:text-overdue md:min-h-0"
                    disabled={busy}
                    aria-label={op.earTag ? `Descartar o passe do animal ${op.earTag}` : "Descartar"}
                    onClick={() => run(() => discard(op.id), "Passe descartado")}
                  >
                    Descartar
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="-mx-4 flex flex-col gap-1.5 border-t border-hairline bg-surface/50 px-4 pt-4">
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={!online || sending || busy}
            onClick={() => void syncNow()}
          >
            <RefreshCw className={cn(sending && "motion-safe:animate-spin")} aria-hidden />
            {sending ? "Enviando…" : "Sincronizar agora"}
          </Button>
          {!online ? (
            <p className="text-center text-xs text-ink-soft">sem conexão</p>
          ) : sending ? (
            <p className="text-center text-xs text-ink-soft">
              Os conflitos esperam sua escolha; o resto segue sozinho.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Create `components/offline/SyncBadge.tsx`**

```tsx
"use client";

/** The fila's count on the Manejo tab and the sidebar's Manejo row. */
import { useHerdStore } from "@/lib/store/useHerdStore";
import { cn } from "@/lib/utils";

export function SyncBadge({ className }: { className?: string }) {
  const count = useHerdStore((s) => s.outboxCount);
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 font-mono text-[10px] leading-none font-semibold text-primary-foreground",
        className
      )}
    >
      {count > 99 ? "99+" : count}
      <span className="sr-only"> a enviar</span>
    </span>
  );
}
```

- [ ] **Step 6: Create `components/offline/OfflineDataLine.tsx`**

```tsx
"use client";

/** Under every page title while the farm comes from the phone's snapshot. */
import { useOffline } from "@/lib/offline/useOffline";
import { clock } from "@/components/offline/QueuedPassesList";

export function OfflineDataLine() {
  const { offline, snapshotAt } = useOffline();
  if (!offline || !snapshotAt) return null;
  const day = new Date(snapshotAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return (
    <p className="mt-0.5 text-xs text-attention">
      Sem conexão · dados de {day} às {clock(snapshotAt)}
    </p>
  );
}
```

- [ ] **Step 7: Runner (`components/manejo/session-runner.tsx`): imports**

old (`:52`):
```tsx
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
```
new:
```tsx
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { OfflinePill } from "@/components/offline/OfflinePill";
import { QueuedPassesList } from "@/components/offline/QueuedPassesList";
```

- [ ] **Step 8: Runner: the pill next to the title**

old (`:302`):
```tsx
        badges={canRun ? undefined : <ReadOnlyPill />}
```
new:
```tsx
        badges={
          <>
            {canRun ? null : <ReadOnlyPill />}
            <OfflinePill />
          </>
        }
```

- [ ] **Step 9: Runner: the banner under the header**

old (`:341-343`):
```tsx
      />

      <DeleteManejoDialog
```
new:
```tsx
      />

      <OfflineBanner sessionId={session.id} />

      <DeleteManejoDialog
```

- [ ] **Step 10: Runner: the list under the brete (phone, and a venda at any width)**

old (`:530-537`):
```tsx
                : "Revise os pulados abaixo, se houver, e encerre o manejo."
            }
          />
        </SectionCard>
      ) : null}

      {isSale ? (
```
new:
```tsx
                : "Revise os pulados abaixo, se houver, e encerre o manejo."
            }
          />
        </SectionCard>
      ) : null}

      {/* The fila on the phone: right under the brete. A venda has no right
          column, so its list stays here at every width. */}
      <QueuedPassesList sessionId={session.id} className={isSale ? undefined : "lg:hidden"} />

      {isSale ? (
```

- [ ] **Step 11: Runner: the list at the top of the right column (wide screens)**

old (`:560-561`):
```tsx
          <div className="space-y-4">
            <SectionCard
              title={`${isEntry ? "Registrados" : isInsemination ? "Inseminadas" : "Manejados"} (${done.length})`}
```
new:
```tsx
          <div className="space-y-4">
            <QueuedPassesList sessionId={session.id} className="hidden lg:block" />
            <SectionCard
              title={`${isEntry ? "Registrados" : isInsemination ? "Inseminadas" : "Manejados"} (${done.length})`}
```

- [ ] **Step 12: Iniciar manejo dialog (`components/manejo/register-manejo-dialog.tsx`): imports and hook**

old (`:15`):
```tsx
import { Play, Search } from "lucide-react";
```
new:
```tsx
import { Play, Search, WifiOff } from "lucide-react";
```
old (`:18`):
```tsx
import { useToast } from "@/components/providers/Toasts";
```
new:
```tsx
import { useToast } from "@/components/providers/Toasts";
import { useOffline } from "@/lib/offline/useOffline";
```
old (`:189`):
```tsx
  const { addToast } = useToast();
```
new:
```tsx
  const { addToast } = useToast();
  // Offline the start goes to the fila (the store decides); only the entrada,
  // which creates animals, needs the signal.
  const { online } = useOffline();
```

- [ ] **Step 13: Dialog: the offline note under the title**

old (`:400-403`):
```tsx
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
```
new:
```tsx
          </DialogDescription>
        </DialogHeader>

        {online ? null : (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg bg-attention-soft px-3 py-2.5 text-attention"
          >
            <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-[13px] leading-[18px] text-ink">
              Sem conexão: o manejo começa no celular e é enviado quando o sinal voltar.
            </p>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
```

- [ ] **Step 14: Dialog: Entrada disabled, with its helper**

old (`:413-424`):
```tsx
                    {actionList.map((action) => (
                      <SelectItem key={action} value={action}>
                        {MANEJO_ACTION_LABEL[action]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canEditFinance ? null : (
```
new:
```tsx
                    {actionList.map((action) => (
                      <SelectItem
                        key={action}
                        value={action}
                        disabled={!online && action === "entry"}
                      >
                        {MANEJO_ACTION_LABEL[action]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!online && actionList.includes("entry") ? (
                  <p className="text-xs text-ink-soft">
                    Entrada (compra): precisa de sinal (cria animais novos).
                  </p>
                ) : null}
                {canEditFinance ? null : (
```

- [ ] **Step 15: Dialog: the submit button**

old (`:829-836`):
```tsx
            <Button
              type="submit"
              className="min-h-11"
              // Nothing to inseminate with until a bull is registered on Reprodução.
              disabled={inseminates && semenBulls.length === 0}
            >
              {inseminates ? "Iniciar inseminação" : "Iniciar manejo"}
            </Button>
```
new:
```tsx
            <Button
              type="submit"
              className="min-h-11"
              // Nothing to inseminate with until a bull is registered on Reprodução;
              // an entrada already picked (or preset) cannot start without signal.
              disabled={
                (inseminates && semenBulls.length === 0) || (!online && fields.action === "entry")
              }
            >
              {!online
                ? "Começar no celular"
                : inseminates
                  ? "Iniciar inseminação"
                  : "Iniciar manejo"}
            </Button>
```

- [ ] **Step 16: `components/manejo/open-sessions.tsx`: the "no celular" pill**

old (`:9`):
```tsx
import { ArrowRight } from "lucide-react";
```
new:
```tsx
import { ArrowRight, CloudOff } from "lucide-react";
```
old (`:33`):
```tsx
                <ManejoTypePill action={sessionKind(session)} />
```
new:
```tsx
                <div className="flex items-center gap-1.5">
                  <ManejoTypePill action={sessionKind(session)} />
                  {/* Started offline: the server does not have it yet. */}
                  {session.pending ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-scheduled-soft px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-scheduled">
                      <CloudOff className="size-3" aria-hidden />
                      no celular
                    </span>
                  ) : null}
                </div>
```

- [ ] **Step 17: `components/layout/MobileTabBar.tsx`: the badge on the Manejo tab**

old (`:22`):
```tsx
import { cn } from "@/lib/utils";
```
new:
```tsx
import { cn } from "@/lib/utils";
import { SyncBadge } from "@/components/offline/SyncBadge";
```
old (`:81`):
```tsx
              <tab.icon className="size-5" aria-hidden />
```
new:
```tsx
              <span className="relative">
                <tab.icon className="size-5" aria-hidden />
                {/* Visual only: the tab still navigates; the sheet opens from the runner. */}
                {tab.href === "/manejo" ? (
                  <SyncBadge className="absolute -top-1.5 -right-2.5 ring-2 ring-panel" />
                ) : null}
              </span>
```

- [ ] **Step 18: `components/layout/Sidebar.tsx`: the badge on the Manejo row**

old (`:13`):
```tsx
import { cn } from "@/lib/utils";
```
new:
```tsx
import { cn } from "@/lib/utils";
import { SyncBadge } from "@/components/offline/SyncBadge";
```
old (`:102`):
```tsx
                {item.label}
              </Link>
```
new:
```tsx
                {item.label}
                {/* Brand on the cream active pill; cream on the green rail. */}
                {item.href === "/manejo" ? (
                  <SyncBadge
                    className={cn("ml-auto", !active && "bg-sidebar-active text-sidebar-active-ink")}
                  />
                ) : null}
              </Link>
```

- [ ] **Step 19: `components/layout/PageHeader.tsx`: the snapshot line under every title**

old (`:1`):
```tsx
import type { ReactNode } from "react";
```
new:
```tsx
import type { ReactNode } from "react";
import { OfflineDataLine } from "@/components/offline/OfflineDataLine";
```
old (`:23`):
```tsx
        {subtitle ? <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p> : null}
```
new:
```tsx
        {subtitle ? <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p> : null}
        <OfflineDataLine />
```
(PageHeader is not a client module. Importing the client `OfflineDataLine` into it is valid for both server and client parents. On the server `offline` is false, so the line renders nothing and hydration matches.)

- [ ] **Step 20: `components/layout/AppShell.tsx`: mount the sheet once**

old (`:8`):
```tsx
import { PrintRoot } from "@/components/print/PrintRoot";
```
new:
```tsx
import { PrintRoot } from "@/components/print/PrintRoot";
import { SyncSheet } from "@/components/offline/SyncSheet";
```
old (`:72-73`, as Task 1 left them):
```tsx
      <PrintRoot />
      <ServiceWorker />
```
new:
```tsx
      <PrintRoot />
      <ServiceWorker />
      <SyncSheet />
```

- [ ] **Step 21: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors. If `useOffline()`'s `resolve`/`resolveAll`/`discard`/`syncNow` are typed as returning `void` rather than `Promise<void>`, `run(() => …)` still type-checks, since `() => Promise<void>` accepts an async wrapper. In that case, change `run`'s parameter to `() => void | Promise<void>` and nothing else.

- [ ] **Step 22: Lint**

Run: `pnpm exec eslint components/offline components/manejo/session-runner.tsx components/manejo/register-manejo-dialog.tsx components/manejo/open-sessions.tsx components/layout/MobileTabBar.tsx components/layout/Sidebar.tsx components/layout/PageHeader.tsx components/layout/AppShell.tsx`
Expected: no errors.

- [ ] **Step 23: Commit (no trailers)**

```bash
git add components/offline/QueuedPassesList.tsx components/offline/OfflinePill.tsx components/offline/OfflineBanner.tsx components/offline/SyncSheet.tsx components/offline/SyncBadge.tsx components/offline/OfflineDataLine.tsx components/manejo/session-runner.tsx components/manejo/register-manejo-dialog.tsx components/manejo/open-sessions.tsx components/layout/MobileTabBar.tsx components/layout/Sidebar.tsx components/layout/PageHeader.tsx components/layout/AppShell.tsx
git commit -m "feat(offline): show the fila, the conflicts and the offline state at the brete" -- components/offline/QueuedPassesList.tsx components/offline/OfflinePill.tsx components/offline/OfflineBanner.tsx components/offline/SyncSheet.tsx components/offline/SyncBadge.tsx components/offline/OfflineDataLine.tsx components/manejo/session-runner.tsx components/manejo/register-manejo-dialog.tsx components/manejo/open-sessions.tsx components/layout/MobileTabBar.tsx components/layout/Sidebar.tsx components/layout/PageHeader.tsx components/layout/AppShell.tsx
```

---

### Task 11: Smoke of the offline flows and whole-branch review

**Files:**
- Create (scratchpad only, not committed): `<scratchpad>/smoke-offline/offline-smoke.mjs`
- Modify: nothing in the repo unless the smoke finds a bug (`fix(offline): …` commits)

**Interfaces:**
- Consumes: everything Tasks 1–10 shipped; the seed; the spike script of Task 1.
- Produces: screenshots, a pass/fail list, fixes.

- [ ] **Step 1: Clean tree and green checks**

```bash
cd /home/luketa/meubov && git status --short && pnpm tsc --noEmit && pnpm exec eslint app components lib cli public/sw.js && TZ=America/Sao_Paulo pnpm exec vitest run lib components app cli --exclude '**/worktrees/**'
```
Expected: no output from status, tsc silent, eslint clean, every test green.

- [ ] **Step 2: Throwaway database, migrations, app**

Pick free names/ports (`docker ps`, `ss -ltnp`):
```bash
docker run --rm -d --name meubov-offline-db -e POSTGRES_USER=meubov -e POSTGRES_PASSWORD=meubov -e POSTGRES_DB=meubov -p 127.0.0.1:5447:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine
sleep 3
cd /home/luketa/meubov && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5447/meubov pnpm migration:run
pnpm build && DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5447/meubov BETTER_AUTH_URL=http://localhost:3017 pnpm exec next start -p 3017 > <scratchpad>/smoke-offline/server.log 2>&1 &
sleep 5; curl -s http://localhost:3017/api/auth/ok
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:3017/sw.js
curl -s -I http://localhost:3017/sw.js | grep -i cache-control
curl -s http://localhost:3017/manifest.webmanifest | head -c 200
curl -s -X POST http://localhost:3017/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:3017' -d '{"name":"Teste Offline","email":"teste.offline@meubov.local","password":"Offline2026!"}'
DATABASE_URL=postgresql://meubov:meubov@127.0.0.1:5447/meubov pnpm db:seed --email teste.offline@meubov.local
```
Expected: `{"ok":true}`; `200 application/javascript; charset=utf-8`; `Cache-Control: no-cache, no-store, must-revalidate`; a manifest JSON with `"name":"MeuBov"`; sign-up 200; seed prints farm 1. A production build is used because the service worker must be tested against the real `/_next/static` output (dev serves differently).

- [ ] **Step 3: The smoke script**

`<scratchpad>/smoke-offline/offline-smoke.mjs` (Playwright via `createRequire("/home/luketa/.npm/_npx/705bc6b22212b352/node_modules/")`, chromium `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`, one context per user, `serviceWorkers: "allow"`, viewport 390×844 for the phone parts and 1440×900 for desktop):

1. Sign in (`POST /api/auth/sign-in/email`), open `/manejo`, start a Vermifugação for one lot online (through the UI: "Iniciar manejo" → tipo, lote, tratamento fields, submit) → the runner opens at `/manejo/<A>`; complete one animal online; wait for the worker to be active (`navigator.serviceWorker.ready`).
2. `context.setOffline(true)`. Complete two animals (one with a weight) and skip one. Assert: pill "Sem conexão" visible; the banner says "3 passes guardados"; "Guardados no celular" lists three rows; the progress moved by three; the Manejo tab badge shows 3.
3. Reload the page offline (`page.reload()`): the runner renders again with the three guardados (from the snapshot). Navigate offline to `/manejo` (cached) and back.
4. Open the sheet from the pill: "A enviar · 3", "Sincronizar agora" disabled with "sem conexão". Close it.
5. Desfazer one of the guardados (the runner's undo on the last completed): the list shows two; the badge shows 2; assert the outbox holds 2 (through the page: `window.indexedDB` read in `page.evaluate`, store "outbox").
6. `context.setOffline(false)`; wait until the badge disappears; assert the server rows: `GET /api/herd` in the page context → session A has the two animals `done`/`skipped` with the right weight; no provisional ids (`local:`) anywhere in the session's treatments.
7. Conflict: a SECOND context (same user, new page) completes animal X of session A online; the first context goes offline, completes the same X with weight 301 (pass applies locally), goes online → the sheet shows "Conflitos · 1" with "Neste celular: Concluído … 301 kg" and "No servidor: Concluído …". Click "Manter do servidor": the row disappears, the store's entry for X shows the server's weight. Repeat with animal Y and click "Aplicar o meu": the server now has the phone's weight (assert via the API). Repeat with two animals at once and use "Aplicar todos os meus".
8. Closed session conflict: the second context closes session A; the first, offline, completes Z; online → conflict with "Aplicar o meu" disabled and the helper "manejo já encerrado"; "Manter do servidor" clears it.
9. Start offline: first context offline, "Iniciar manejo" → the note "Sem conexão: o manejo começa no celular…" is visible, the "Entrada" option is disabled, submit "Começar no celular" → the runner opens at `/manejo/<B>` (phone-generated id), pill "Sem conexão"; complete one animal; online → session B exists on the server with that same id and the pass. Reload offline BEFORE going online in a variant run and assert the runner still opens for B (the template document).
10. Auth pause: with one op queued offline, clear the auth cookie in the context (`context.clearCookies()`), go online → the sheet says "Entre de novo para enviar"; sign in again in the same context (POST) → `Sincronizar agora` → the op is sent.
11. Install card: a context with an Android Chrome user agent at 390 px opens `/dashboard` → the card "Instale o MeuBov no celular" is visible (the `beforeinstallprompt` event does not fire in headless Chromium: assert the iOS-hint variant with an iPhone UA instead, and that the card is absent at 1440 px). "Agora não" hides it and sets `meubov.installDismissedAt`.
12. Screenshots at each state into `<scratchpad>/smoke-offline/` and copies to `/home/luketa/.cache/meubov-plan-2026-09-25/smoke/`: runner-offline, sheet-offline, sheet-conflicts, sheet-sending, start-offline, install-card, desktop-runner-offline.

Filter out `_vercel` and aborted `_rsc` requests from any "no failed request" check. Print `ok`/`FAIL` per assertion and exit 1 on any failure.

- [ ] **Step 4: Run it, look at every screenshot**

Run: `node <scratchpad>/smoke-offline/offline-smoke.mjs`
Expected: `all green`. View each PNG with the Read tool against the canvas (https://claude.ai/artifact/2h55gyJAjK3bwrX5HRVu1h). Fix what differs; a fix is its own `fix(offline): …` commit by pathspec, with a unit test when the code is pure.

- [ ] **Step 5: Whole-branch review** (dispatched by the controller on Opus with the review package, the spec, the plan and the ledger) looking for: order violations, provisional ids leaking into requests or the server, money in the snapshot beyond the user's own payload, `/api/*` ever cached by the worker, the template trick serving a stale runner shell after a deploy (version constant + `updateViaCache: "none"`), the 10 s "recent failure" rule queuing passes that could have gone online, conflicts resolved without `reloadHerd`, the runner's undo on a queued op, `registerEntryAnimal` offline, sign-out keeping the fila.

- [ ] **Step 6: Tear down**

```bash
kill $(ss -ltnp | awk '/:3017 /{print $NF}' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1)
docker rm -f meubov-offline-db
```
Report to the user what passed, what was fixed, the screenshot paths, and offer the finishing choices.

---

