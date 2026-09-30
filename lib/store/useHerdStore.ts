/**
 * Zustand herd store: extends HerdData with the hydration flag and the write
 * actions. All updates are immutable and the new ids are deterministic
 * (prefix + counter derived from the current collection size).
 */
import { create, type StoreApi } from "zustand";
import type {
  Account,
  AccountGroup,
  Animal,
  Attachment,
  BankAccount,
  BankAccountKind,
  Breeding,
  Calving,
  CsvMapping,
  CustomCategory,
  Expense,
  FarmData,
  InactiveReason,
  HerdData,
  Invernada,
  Lot,
  LotPlacement,
  ManejoKind,
  ManejoSession,
  ManejoSessionAnimal,
  ManejoTreatmentPlan,
  PregnancyDiagnosis,
  ScheduleTreatmentsInput,
  SemenBull,
  SemenPurchase,
  SeriesRepeat,
  SeriesScope,
  Sex,
  StatementLine,
  Transfer,
  Weighing,
  HealthProtocol,
  Treatment,
} from "@/lib/types";
import { toast } from "sonner";
import { type HerdRepository } from "@/lib/repository/HerdRepository";
import { ApiHerdRepository } from "@/lib/repository/ApiHerdRepository";
import { api } from "@/lib/api/client";
import { clearActiveFarmId, getActiveFarmId, setActiveFarmId } from "@/lib/api/activeFarm";
import { authClient } from "@/lib/auth/client";
import { openStore } from "@/lib/offline/db";
import {
  clearUserSnapshots,
  isNetworkFailure,
  LAST_USER_KEY,
  loadSnapshot,
  saveSnapshot,
  snapshotKey,
  type Snapshot,
} from "@/lib/offline/snapshot";
import { can, type FarmRole, type MemberPreset, type Permissions } from "@/lib/domain/permissions";
import type { BullRemovalBlock } from "@/lib/domain/semen";
import { selectActivePermissions } from "@/lib/store/selectors";
import type { MyInvite } from "@/lib/api/domains/invites/useCases/BrowseMine.useCase";
import type { ImportAnimalPayload } from "@/lib/domain/herdImport";
import type { ImportBirthPayload } from "@/lib/domain/birthImport";
import type { BlockedAnimal } from "@/lib/domain/manejoRevert";
import type { DeletedManejo } from "@/lib/api/domains/manejo/useCases/Delete.useCase";
import type { ImportResult } from "@/lib/api/domains/statements/useCases/ImportStatement.useCase";
import type { ImportView } from "@/lib/api/domains/statements/useCases/GetImport.useCase";
import type { LineEntry, Resolved } from "@/lib/api/domains/statements/useCases/ResolveLine.useCase";
import { pairKey, type MatchTarget } from "@/lib/domain/statements/match";
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
import { attachmentContentType, attachmentPathname } from "@/lib/domain/attachments";
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

/** Animal to register; the optional initial weight becomes the first weighing. */
export type NewAnimal = Omit<Animal, "id" | "active" | "weighings" | "reproduction"> & {
  initialWeightKg?: number;
};

/**
 * New manejo session (curral working session). Opens with every selected
 * animal pending; effects (treatments, weighings, lot changes, sales) are
 * applied one animal at a time via completeManejoAnimal — a manejo takes hours,
 * not one click. An entry (compra) opens with NO animals: they do not exist yet
 * and are registered as they arrive, via registerEntryAnimal.
 */
export interface NewManejoSession {
  date: string;
  kind: ManejoKind;
  earTags: string[];
  /** Capture one weight per animal as it passes the chute. */
  weighing: boolean;
  treatment?: ManejoTreatmentPlan;
  /** Lot every animal lands in — transfer and entry sessions. */
  destinationLotId?: string;
  /** Buyer (sale) or seller (entry). */
  counterparty?: string;
  /** R$/@ of a sale priced by weight. */
  pricePerArroba?: number;
  /** Rendimento de carcaça (%) of a sale priced per arroba. */
  carcassYieldPct?: number;
  /** Closed price of the batch, or the purchase total of an entry. */
  totalAmountBrl?: number;
  /** Touros of an inseminação session, in the order picked. */
  semenBullIds?: string[];
  notes?: string;
}

/** Animal arriving in an entry session: registered and handled in one pass. */
export type EntryAnimal = Omit<NewAnimal, "lotId"> & { notes?: string };

/** Data captured for one animal at the chute. */
export interface ManejoPassData {
  weightKg?: number;
  notes?: string;
  semenBullId?: string;
  /** Rendimento (%) the brete priced this boiada at (venda per arroba only). */
  carcassYieldPct?: number;
}

/**
 * Baixa of an animal: why it left the herd, when, and what happened. A sale is
 * not one of these — it is recorded by a manejo de venda, which knows the price.
 */
export interface NewBaixa {
  reason: Exclude<InactiveReason, "sale">;
  date: string;
  notes?: string;
}

/**
 * Breeding to record; the id comes from the server. With `semenBullId` it takes
 * one dose of that registered bull, and the server stores the bull's code (or
 * name) as `bullEarTag`.
 */
export type NewBreeding = Omit<Breeding, "id">;

/** Purchase of semen doses to record; it also becomes a Reprodução expense. */
export interface NewSemenPurchase {
  date: string;
  doses: number;
  totalBrl: number;
  seller?: string;
}

/** Semen bull to register, with the first purchase of doses when there is one. */
export interface NewSemenBull {
  name: string;
  code?: string;
  breed?: string;
  central?: string;
  firstPurchase?: NewSemenPurchase;
}

/** Editable fields of a semen bull (only sent ones change; a blank text clears it). */
export type SemenBullPatch = Partial<Pick<SemenBull, "name" | "code" | "breed" | "central">>;

/** Editable fields of a lançamento: only sent ones change; null clears an optional one. */
export type ExpensePatch = Partial<Pick<Expense, "date" | "category" | "amountBrl">> & {
  [K in "notes" | "dueDate" | "paidAt" | "counterparty" | "document" | "accountId" | "lotId" | "bankAccountId"]?:
    | string
    | null;
};

/** A new conta ("Nova conta"); a cartão takes the fechamento and vencimento days. */
export interface NewBankAccount {
  kind: BankAccountKind;
  name: string;
  label?: string;
  openingBalanceBrl?: number;
  openingDate: string;
  isMain?: boolean;
  closingDay?: number;
  dueDay?: number;
  paysFromId?: string;
}

/** Editable fields of a conta; the kind never changes, null clears. */
export type BankAccountPatch = Partial<
  Pick<NewBankAccount, "name" | "openingBalanceBrl" | "openingDate" | "isMain" | "closingDay" | "dueDay">
> & { label?: string | null; paysFromId?: string | null };

/** A decision on a linha do extrato (POST /statement-lines/:id/<type>). */
export type LineDecision =
  | { type: "match"; target: MatchTarget }
  | { type: "create"; entry: LineEntry }
  | { type: "transfer"; otherAccountId: string }
  | { type: "ignore"; reason: string }
  | { type: "undo" };

/**
 * Calving to record. The calf joins the herd in the same transaction, taking
 * the dam's breed and lot unless overridden here.
 */
export interface NewCalving {
  date: string;
  calfEarTag: string;
  calfSex: Sex;
  calfBreed?: string;
  calfLotId?: string;
  calfWeightKg?: number;
}

/** Outcome of a batch registration: how many went in, or the brincos that refused it. */
export type AddAnimalsResult = { added: number } | { duplicates: string[] };

/** Summary of a bulk import, shown on the dialog's final screen. */
export interface ImportSummary {
  imported: number;
  skipped: number;
  createdBreeds: string[];
  /** Names of the lots auto-created by the import. */
  createdLots: string[];
}

/**
 * What "Importar nascimentos" wrote, by calf brinco: the calves, how many
 * partos landed on a dam, the calves without one, the dead ones, the brincos
 * skipped because they already existed and the raças created.
 */
export interface ImportBirthsSummary {
  imported: string[];
  calvings: number;
  withoutDam: string[];
  deaths: string[];
  skipped: string[];
  createdBreeds: string[];
}

/** Logical cattle group plus the physical invernada where it starts. */
export interface NewLot {
  name: string;
  invernadaId: string;
}

/** Dated movement of one whole cattle group between invernadas. */
export interface MoveLotInput {
  invernadaId: string;
  startedOn: string;
  notes?: string;
}

/** Ends an empty logical lot while preserving its placement history. */
export interface ArchiveLotInput {
  endedOn: string;
}

/** Editable fields of a fixed physical invernada. */
export interface InvernadaPatch {
  /** One-time correction of a migration-only LEGACY-* code. */
  code?: string;
  name?: string | null;
  grass?: string;
  hectares?: number;
  boundary?: [number, number][] | null;
}

/** A farm the user can switch to (from GET /farms), with what they may do in it. */
export interface FarmOption {
  id: number;
  name: string;
  municipality: string;
  role: FarmRole;
  preset: MemberPreset | null;
  /** Resolved by the server: the Dono and superusers come back with every area at edit. */
  permissions: Permissions;
  /** When the membership began; null for a superuser who is not a member. */
  joinedAt: string | null;
}

/** What the Nova fazenda dialog sends: `copy` starts it from the open farm's setup. */
export interface NewFarmInput {
  name: string;
  municipality: string;
  copy: boolean;
}

export interface HerdStore extends HerdData {
  /** Always present in the store; HerdData leaves them optional for older snapshots and fixtures. */
  bankAccounts: BankAccount[];
  transfers: Transfer[];
  reconciledIds: string[];
  loaded: boolean;
  /** True when the API was unreachable at boot and the store came from the phone's snapshot. */
  offline: boolean;
  /** When that snapshot's data was saved (ISO); null when the store booted online. */
  snapshotAt: string | null;
  /** Farms the user can access; the switcher lists them all, even just one. */
  farms: FarmOption[];
  activeFarmId: number | null;
  /** Convites waiting for the signed-in e-mail (the Painel banner, the avatar dot). */
  pendingInvites: MyInvite[];
  /** Where the fila's sync stands (lib/offline/sync.ts). */
  sync: SyncStatus;
  /** Operations in the fila: a enviar, conflitos and falhas. */
  outboxCount: number;
  /** The fila itself, in the order it goes, for the runner's list and the Sincronização sheet. */
  ops: OutboxOp[];
  load: () => Promise<void>;
  /** Persists the choice and rehydrates the whole store from the new farm. */
  switchFarm: (farmId: number) => Promise<void>;
  /** Re-reads the farm list and the herd after the caller's access changed. */
  refreshAccess: () => Promise<void>;
  /**
   * Creates a farm the caller owns, starting from the open farm's raças,
   * categorias and protocolos when `copy` is on, and opens it. Resolves the new
   * id; throws after a toast when the server refused.
   */
  createFarm: (input: NewFarmInput) => Promise<number>;
  /**
   * Deletes a farm the caller owns. When it was the open farm the store moves
   * to the default one; throws after a toast when the server refused.
   */
  deleteFarm: (farmId: number) => Promise<void>;
  /** Re-reads the convites after one was accepted or declined. */
  refreshInvites: () => Promise<void>;
  /** Registers the animal via the API; false when the ear tag is taken. */
  addAnimal: (a: NewAnimal) => Promise<boolean>;
  /** Registers a batch all or nothing; lists the brincos taken when refused. */
  addAnimals: (animals: NewAnimal[]) => Promise<AddAnimalsResult>;
  /** Bulk-imports parsed rows, refreshes the herd, and returns a summary. */
  importHerd: (rows: ImportAnimalPayload[]) => Promise<ImportSummary>;
  /** Imports a maternidade caderno, refreshes the herd, and returns what it wrote. */
  importBirths: (rows: ImportBirthPayload[]) => Promise<ImportBirthsSummary>;
  markTreatmentDone: (id: string) => Promise<void>;
  completeTreatments: (ids: string[]) => Promise<void>;
  /** Schedules one treatment for every selected active animal. */
  scheduleTreatments: (input: ScheduleTreatmentsInput) => Promise<number>;
  /** Deletes a treatment — the whole booking or one animal's row; returns how many fell. */
  deleteTreatment: (id: string, scope?: "one" | "batch") => Promise<number>;
  /** Opens a manejo session and returns its id (for the run screen). */
  startManejoSession: (input: NewManejoSession) => Promise<string>;
  /**
   * Applies the session's effects to one animal and marks it done. False when
   * nothing was saved: the pass was refused (409) — the bull out of doses, an
   * animal that had a baixa meanwhile, or a stale screen.
   */
  completeManejoAnimal: (
    sessionId: string,
    earTag: string,
    data?: ManejoPassData
  ) => Promise<boolean>;
  /** Marks one animal as skipped (did not pass the chute). */
  skipManejoAnimal: (sessionId: string, earTag: string, notes?: string) => Promise<void>;
  /**
   * A venda's animal set apart at the brete: refugo (stays on the farm) or
   * dúvida (decided before closing). The weight read becomes a pesagem. False
   * when refused (409) — the animal had a baixa meanwhile, or a stale screen.
   */
  setAsideManejoAnimal: (
    sessionId: string,
    earTag: string,
    input: { list: "rejected" | "held"; weightKg?: number; notes?: string }
  ) => Promise<boolean>;
  /**
   * A baixa at the brete: the animal leaves the herd and its pass is skipped,
   * with the baixa as its note, in one server transaction. False when the pass
   * was refused (409): it already left the queue, or the animal already had a
   * baixa — the herd is then reloaded.
   */
  baixaManejoAnimal: (sessionId: string, earTag: string, input: NewBaixa) => Promise<boolean>;
  /**
   * Undo: reverts one animal to pending, removing the effects it created. An
   * inseminação pass whose cobertura was diagnosed is refused; the toast offers
   * to clear that diagnosis and undo again. So is an animal that had a baixa.
   */
  reopenManejoAnimal: (sessionId: string, earTag: string) => Promise<void>;
  /**
   * Sets the rendimento de carcaça of an open venda per arroba (the modal
   * before the chute); passes already recorded are repriced by the server.
   */
  setSaleCarcassYield: (sessionId: string, carcassYieldPct: number) => Promise<void>;
  /** Closes the session (remaining animals stay recorded as they are). */
  closeManejoSession: (sessionId: string) => Promise<void>;
  /**
   * Deletes a manejo and puts the herd back where it was. Returns null when it
   * went through, or the animals that blocked it when the server refused — a
   * diagnosed cow of an inseminação with the `breedingId` to clear.
   */
  deleteManejoSession: (sessionId: string) => Promise<BlockedAnimal[] | null>;
  /**
   * Registers one animal arriving in an entry session (compra): it joins the
   * herd in the session's destination lot, already handled. False when the ear
   * tag is already in use.
   */
  registerEntryAnimal: (sessionId: string, animal: EntryAnimal) => Promise<boolean>;
  recordWeighing: (earTag: string, w: Weighing) => Promise<void>;
  /** Deletes the weight readings of one day (a "Pesagem" row of the history). */
  deleteWeighingGroup: (date: string, earTags: string[]) => Promise<number>;
  /**
   * Corrects one weighing of an animal. A weighing a manejo wrote keeps the
   * session's day; its kg, and the value of a venda priced by the arroba, reach
   * that session's entry too.
   */
  editWeighing: (earTag: string, weighingId: number, w: Weighing) => Promise<void>;
  /** Removes one weighing no manejo wrote (a manejo's goes by reopening the animal). */
  removeWeighing: (earTag: string, weighingId: number) => Promise<void>;
  addBreed: (name: string) => Promise<void>;
  /** Removes the breed via the API; false when an active animal uses it. */
  removeBreed: (name: string) => Promise<boolean>;
  /** Creates a logical lot and its initial invernada placement atomically. */
  addLot: (l: NewLot) => Promise<Lot>;
  /** Removes the lot via the API; false when an active animal occupies it. */
  removeLot: (id: string) => Promise<boolean>;
  /** Edits the logical lot's registration fields. */
  updateLot: (id: string, patch: LotPatch) => Promise<void>;
  /** Moves the whole logical lot to another invernada in one transaction. */
  moveLot: (id: string, input: MoveLotInput) => Promise<void>;
  /** Ends an empty logical lot and closes its current placement. */
  archiveLot: (id: string, input: ArchiveLotInput) => Promise<void>;
  /** Creates a fixed physical invernada. */
  addInvernada: (input: Omit<Invernada, "id">) => Promise<Invernada>;
  /** Edits an invernada's physical registration or boundary. */
  updateInvernada: (id: string, patch: InvernadaPatch) => Promise<void>;
  /** Removes an unused invernada; false when current/history references it. */
  removeInvernada: (id: string) => Promise<boolean>;
  /** Saves the registration fields; the sede is left as it is. */
  saveFarm: (d: Omit<FarmData, "headquarters">) => Promise<void>;
  /** Saves where and how close the farm map opens. */
  saveHeadquarters: (
    view: NonNullable<FarmData["headquarters"]>
  ) => Promise<void>;
  addProtocol: (p: Omit<HealthProtocol, "id">, generateSchedule: boolean) => Promise<void>;
  removeProtocol: (id: string) => Promise<void>;
  /**
   * Lança a despesa or receita — with `repeat`, the whole parcelamento or
   * recorrência — and resolves every row created, first position first.
   */
  addExpense: (e: Omit<Expense, "id">, repeat?: SeriesRepeat) => Promise<Expense[]>;
  /**
   * Saves the sent fields of a lançamento and keeps the server's row. On a row
   * of a série, "following"/"all" rewrite its other rows too, so the herd is
   * re-read.
   */
  updateExpense: (id: string, patch: ExpensePatch, scope?: SeriesScope) => Promise<void>;
  /**
   * Marks a lançamento paid/received on `paidAt` from `bankAccountId` ("Pago
   * por"), or pendente again with null (which clears the conta).
   */
  markExpensePaid: (id: string, paidAt: string | null, bankAccountId?: string | null) => Promise<void>;
  /** Removes a lançamento; on a row of a série "following"/"all" remove the unpaid rows in scope. */
  removeExpense: (id: string, scope?: SeriesScope) => Promise<void>;
  /**
   * Whether this environment stores anexos (a Blob token is configured); null
   * when the check itself failed (no signal), so the UI waits instead of
   * saying "indisponíveis".
   */
  attachmentsEnabled: () => Promise<boolean | null>;
  /** The anexos of a lançamento, oldest first. */
  listAttachments: (expenseId: string) => Promise<Attachment[]>;
  /**
   * Uploads a file straight to the Blob store with a token from our API, then
   * registers it on the lançamento. `onProgress` gets 0–100.
   */
  uploadAttachment: (
    expenseId: string,
    file: File,
    onProgress?: (percentage: number) => void
  ) => Promise<Attachment>;
  removeAttachment: (attachment: Attachment) => Promise<void>;
  /** Creates a conta; null when its grupo already has that name (409). */
  addAccount: (input: { group: AccountGroup; name: string }) => Promise<Account | null>;
  /** Renames, archives or restores a conta; false when the name is taken (409). */
  updateAccount: (id: string, patch: { name?: string; archived?: boolean }) => Promise<boolean>;
  /** Creates the standard contas the farm lacks; resolves how many were created. */
  seedDefaultAccounts: () => Promise<number>;
  /** "Nova conta"; one marked principal (or the farm's first) takes the place of the current one. */
  addBankAccount: (input: NewBankAccount) => Promise<BankAccount>;
  updateBankAccount: (id: string, patch: BankAccountPatch) => Promise<BankAccount>;
  /** Archives or restores a conta; false when it is the conta principal (409). */
  archiveBankAccount: (id: string, archived: boolean) => Promise<boolean>;
  /** Deletes an unused conta; "in_use" or "is_main" when the server keeps it. */
  removeBankAccount: (id: string) => Promise<"deleted" | "in_use" | "is_main">;
  addTransfer: (input: Omit<Transfer, "id">) => Promise<Transfer>;
  updateTransfer: (id: string, patch: Partial<Omit<Transfer, "id" | "notes">> & { notes?: string | null }) => Promise<Transfer>;
  removeTransfer: (id: string) => Promise<void>;
  /** The Extrato's "Conta" on a venda or compra (its session id, or a legacy movement id). */
  setMovementBankAccount: (id: string, bankAccountId: string | null) => Promise<void>;
  /**
   * Imports an extrato into a conta corrente and re-reads the herd (the conta's
   * pending count). A refusal the dialog shows comes back as `{ error }`:
   * `nothing_new`, `mapping_required` or a parser code.
   */
  importStatement: (
    bankAccountId: string,
    file: { fileName: string; content: string; mapping?: CsvMapping }
  ) => Promise<ImportResult | { error: string }>;
  /** One import with its lines and the records already paired; null when it is not on this farm. */
  loadImport: (importId: string) => Promise<ImportView | null>;
  /**
   * Decides one line and merges what changed (the lançamento paid or created,
   * the venda's conta, the transferência). Null when the server refused with a
   * reason the toast explains (paid by another conta, already decided, …).
   */
  resolveStatementLine: (line: StatementLine, decision: LineDecision) => Promise<Resolved | null>;
  /** "Confirmar as N de confiança alta". */
  confirmHighMatches: (
    importId: string,
    pairs: ({ lineId: string } & MatchTarget)[]
  ) => Promise<{ resolved: Resolved[]; refused: number }>;
  /** Creates a custom category; false when the name is already in use. */
  addCustomCategory: (c: Omit<CustomCategory, "id">) => Promise<boolean>;
  /** Removes a custom category; false when an active animal still uses it. */
  removeCustomCategory: (id: string) => Promise<boolean>;
  /**
   * Records a breeding of one female (herd bull, external semen code or a dose
   * of a registered semen bull). False when that bull has no dose left (409
   * out_of_stock): the toast is shown here, nothing is written and the herd is
   * reloaded so the doses on screen match the server.
   */
  recordBreeding: (earTag: string, input: NewBreeding) => Promise<boolean>;
  /** Records (or corrects) the pregnancy diagnosis of one breeding. */
  recordDiagnosis: (earTag: string, input: PregnancyDiagnosis) => Promise<void>;
  /** Removes the pregnancy diagnosis of one breeding — the undo of an Ultrassom tap. */
  clearDiagnosis: (earTag: string, breedingId: string) => Promise<void>;
  /**
   * Registers a semen bull; its first purchase, when sent, also lands in
   * Financeiro as an expense. "duplicate" when the farm already has that name.
   */
  addSemenBull: (input: NewSemenBull) => Promise<SemenBull | "duplicate">;
  /** Edits a semen bull's registration; false when the new name is already in use. */
  updateSemenBull: (id: string, patch: SemenBullPatch) => Promise<boolean>;
  /** Records a purchase of doses of a bull, and merges the expense it wrote. */
  addSemenPurchase: (bullId: string, input: NewSemenPurchase) => Promise<void>;
  /**
   * Deletes a purchase and its expense. False when the other purchases would
   * not cover the doses already used (409 stock_negative); the herd is then
   * reloaded, since the store's count was behind the server's.
   */
  removeSemenPurchase: (bullId: string, purchaseId: string) => Promise<boolean>;
  /**
   * Deletes a bull with its purchases and their expenses. Null once it is
   * gone; otherwise what the server found holding it (409), after which the
   * herd is reloaded, since the store's picture was behind the server's.
   */
  removeSemenBull: (id: string) => Promise<BullRemovalBlock | null>;
  /** Records a calving; false when the calf's ear tag is already in use. */
  recordCalving: (earTag: string, input: NewCalving) => Promise<boolean>;
  /** Edits an animal's registration fields (category/breed/birth/lot). */
  /** False when the new ear tag is already taken (409). */
  updateAnimal: (earTag: string, patch: AnimalPatch) => Promise<boolean>;
  /**
   * Gives an animal a baixa: why it left, when, and what happened. A sale never
   * comes through here — it is a manejo de venda.
   */
  deactivateAnimal: (earTag: string, input: NewBaixa) => Promise<void>;
  /**
   * Takes back a baixa entered by mistake: the animal returns to the active
   * herd in its lot. Throws, after a toast, when the server refuses (a venda,
   * or a lot deleted since).
   */
  reactivateAnimal: (earTag: string) => Promise<void>;
}

/** Editable fields of an animal (only sent ones change). */
export interface AnimalPatch {
  /** New ear tag; must stay unique within the farm. */
  earTag?: string;
  category?: Animal["category"];
  customCategoryId?: string | null;
  breed?: string;
  birthDate?: string;
  lotId?: string;
}

/**
 * Editable fields of a logical lot. Its invernada is deliberately absent:
 * placement changes must go through `moveLot` so history cannot be bypassed.
 */
export interface LotPatch {
  name?: string;
  /** Clears the migration-review flag after the farmer confirms the group. */
  needsReview?: boolean;
}

/**
 * Signals an unexpected API failure and throws. A 403 is not a plain failure:
 * `not_a_member` means the caller was removed from the farm, so the stored
 * choice goes and the page reloads onto their default farm; `forbidden` means
 * their levels changed while the page was open, so the farm list and the herd
 * are re-read and the buttons follow. Anything else shows an error toast
 * (important actions only reach here). `action` is the pt-BR verb phrase shown
 * to the user, e.g. "cadastrar o animal".
 */
/** Refusals of the contas bancárias the farmer can act on, whatever the action. */
const BANK_REFUSALS: Record<string, string> = {
  same_account: "Escolha contas diferentes.",
  invalid_bank_account:
    "Essa conta não serve aqui: um cartão só paga despesas e uma conta arquivada não recebe lançamentos.",
  amount_differs: "O valor do lançamento é diferente do banco. Ajuste o valor antes de conciliar.",
  card_days: "Informe o dia de fechamento e o de vencimento do cartão.",
  card_cannot_be_main: "Um cartão não pode ser a conta principal.",
  invalid_pays_from: "A fatura só pode ser paga por uma conta corrente ativa.",
  main_required: "Marque outra conta como principal antes de desmarcar esta.",
  archived: "Essa conta está arquivada. Desarquive-a antes.",
  card_from: "Um cartão só recebe o pagamento da fatura: escolha outra conta em De.",
};

/** True when a linha do extrato confirms the record (`pairKey`: a transferência per side). */
function isReconciled(reconciledIds: string[], id: string): boolean {
  return reconciledIds.some((key) => key === id || key.startsWith(`${id}:`));
}

function apiFail(action: string, error: { status: number; value?: unknown }): never {
  const code = (error.value as { error?: string } | null | undefined)?.error;
  if (error.status === 403 && code === "not_a_member") {
    clearActiveFarmId();
    window.location.reload();
  } else if (error.status === 403 && code === "forbidden") {
    // One id: several uploads refused at once show a single toast.
    toast.error("Seu acesso a esta fazenda mudou.", { id: "access-changed" });
    void useHerdStore.getState().refreshAccess().catch(() => {});
  } else {
    const known = code === undefined ? undefined : BANK_REFUSALS[code];
    toast.error(known ?? `Não foi possível ${action}. Tente novamente.`);
  }
  throw new Error(`${action} failed (status ${error.status})`);
}

/** A scoped edit or removal was saved but the re-read of the other rows failed. */
const SCOPED_RELOAD_FAILED = "Alteração salva. Recarregue para ver as outras parcelas.";

/** What a refused DELETE /farms/:id tells the Dono. */
const DELETE_FARM_ERRORS: Record<string, string> = {
  farm_not_found: "Esta fazenda já foi excluída.",
  not_owner: "Só o dono pode excluir a fazenda.",
  last_farm: "Crie ou entre em outra fazenda antes de excluir esta.",
};

/** Default repository; swap the implementation here to change the backend. */
const repository: HerdRepository = new ApiHerdRepository();

/**
 * Re-fetches the whole herd after a write the server already settled — an
 * import, or a refusal that proves the store's copy stale (a bull's doses).
 * Best-effort: a failed refresh never masks the write's own outcome, and the
 * store refreshes on the next successful load. A success means the API is
 * back: the store leaves offline mode and the phone keeps the fresh snapshot.
 */
async function reloadHerd(set: StoreApi<HerdStore>["setState"]): Promise<boolean> {
  try {
    const fresh = await repository.load();
    set({ ...fresh, loaded: true, offline: false, snapshotAt: null });
  } catch {
    // best-effort: keep what the store has
    return false;
  }
  await persistSnapshot(useHerdStore.getState);
  return true;
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
    bankAccounts: s.bankAccounts,
    transfers: s.transfers,
    reconciledIds: s.reconciledIds,
    customCategories: s.customCategories,
    semenBulls: s.semenBulls,
    farm: s.farm,
  };
}

/**
 * Who this page's session belongs to, read from the server by rememberUser.
 * persistSnapshot keys by it, never by the meta lastUser, so a stale lastUser
 * never receives another user's herd; null until the session answers.
 */
let sessionUserId: string | null = null;

/** Signed out in this page: queued ops never fall back to the last user. */
let signedOut = false;

/**
 * Asks who is signed in; null when no one is. Throws when the session read
 * itself failed (no network).
 */
async function readSessionUser(): Promise<string | null> {
  const { data, error } = await authClient.getSession();
  if (error) throw error;
  return data?.user.id ?? null;
}

/** Makes userId this page's user and remembers it for an offline boot. */
async function rememberUser(userId: string | null): Promise<void> {
  sessionUserId = userId;
  if (!userId) return;
  signedOut = false;
  await metaStore()
    .put(LAST_USER_KEY, userId)
    .catch(() => {}); // no IndexedDB: no offline boot, the page still works
}

/** How long a failed session read waits before the next try. */
const CONFIRM_RETRY_MS = 30_000;

let userRetry: ReturnType<typeof setTimeout> | undefined;

/**
 * After an online load, or back in a loaded tab after a sign-in: asks who is
 * signed in and hands the fila to them. When it is not `previous`, nothing of
 * the previous user's stays: a clean reload. A failed read tries again in 30 s.
 */
async function adoptSessionUser(previous: string | undefined): Promise<void> {
  let userId: string | null;
  try {
    userId = await readSessionUser();
  } catch {
    userRetry ??= setTimeout(() => {
      userRetry = undefined;
      void adoptSessionUser(previous);
    }, CONFIRM_RETRY_MS);
    return;
  }
  if (previous !== undefined && userId !== null && userId !== previous) {
    clearActiveFarmId();
    window.location.reload();
    return;
  }
  await rememberUser(userId);
  setSyncUser(userId ?? undefined);
  if (userId) await persistSnapshot(useHerdStore.getState);
}

/** The last signed-in user's snapshot of the stored active farm, if the phone has one. */
async function bootSnapshot(): Promise<{ userId: string; snap: Snapshot } | undefined> {
  try {
    const userId = await metaStore().get(LAST_USER_KEY);
    const farmId = getActiveFarmId();
    if (!userId || farmId === null) return undefined;
    const snap = await loadSnapshot(snapshotStore(), snapshotKey(userId, farmId));
    return snap && { userId, snap };
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
    if (!sessionUserId || s.activeFarmId === null) return;
    await saveSnapshot(snapshotStore(), snapshotKey(sessionUserId, s.activeFarmId), {
      data: herdDataOf(s),
      farms: s.farms,
      activeFarmId: s.activeFarmId,
      savedAt: s.offline && s.snapshotAt ? s.snapshotAt : new Date().toISOString(),
    });
  } catch {
    // best-effort: the app runs without a snapshot
  }
}

/** Semen bulls keep the snapshot's order (by name) after a create or a rename. */
const compareByName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, "pt-BR");

/** A toast the farmer has to act on ("Limpar diagnóstico") stays long enough to reach. */
export const ACTION_TOAST_MS = 10_000;

/** Resolves the editable ear tag to the stable id used by API path segments. */
function animalIdByEarTag(animals: Animal[], earTag: string): string {
  const animalId = animals.find((animal) => animal.earTag === earTag)?.id;
  if (animalId === undefined) throw new Error(`Animal ${earTag} not found in herd store`);
  return animalId;
}

/**
 * Conflict statuses a manejo pass can hit (stale UI); treated as a no-op —
 * except a bull out of doses or a diagnosed cow, which the farmer is told about.
 */
const CONFLICT = 409;

/** Toast of a cobertura refused because the semen bull has no dose left. */
const OUT_OF_STOCK_MESSAGE = "Esse touro não tem mais doses.";

/** Toast of a pass refused because the animal had a baixa (409 animal_inactive). */
const inactiveAnimalMessage = (earTag: string) =>
  `O animal ${earTag} teve baixa e não passa mais no brete.`;

/** A new conta principal unmarks the one before it. */
function withoutMain(accounts: BankAccount[], saved: BankAccount): BankAccount[] {
  return saved.isMain ? accounts.map((a) => (a.isMain && a.id !== saved.id ? { ...a, isMain: false } : a)) : accounts;
}

/** A write answers the conta without its linhas' figures; the store keeps the ones it has. */
function keepLines(current: BankAccount, saved: BankAccount): BankAccount {
  return {
    ...saved,
    pendingLines: current.pendingLines,
    reconciledUntil: current.reconciledUntil,
    pendingImportId: current.pendingImportId,
    lastImportId: current.lastImportId,
  };
}

/** Refusals of a decision on a linha do extrato the farmer can act on. */
const LINE_REFUSALS: Record<string, string> = {
  paid_by_other: "Esse lançamento foi pago por outra conta.",
  already_paired: "Esse lançamento já confere com outra linha do extrato.",
  not_pending: "Essa linha já foi resolvida. Recarregue a página.",
  wrong_side: "Uma entrada só confere com receita, venda ou transferência recebida (e a saída, com o contrário).",
  target_not_found: "Esse lançamento não existe mais. Recarregue a página.",
  due_before_date: "O vencimento não pode ser antes da data",
  amount_differs: BANK_REFUSALS.amount_differs,
  card_from: "Um cartão só recebe o pagamento da fatura: escolha outra conta.",
  same_account: BANK_REFUSALS.same_account,
};

/**
 * Merges decided lines into the store: the lançamento paid or created, the
 * venda's conta, the new transferência, what is conciliado, and the conta's
 * pending count. `unpaired` is the record an undo released.
 */
function mergeResolved(
  s: HerdStore,
  resolved: Resolved[],
  unpaired: string | undefined,
  statusBefore: StatementLine["status"]
): Partial<HerdStore> {
  let expenses = s.expenses;
  let movements = s.movements;
  let manejoSessions = s.manejoSessions;
  let transfers = s.transfers;
  const reconciled = new Set(s.reconciledIds);
  if (unpaired) reconciled.delete(unpaired);
  const pendingDelta = new Map<string, number>();
  for (const r of resolved) {
    if (r.expense) {
      const e = r.expense;
      expenses = expenses.some((x) => x.id === e.id) ? expenses.map((x) => (x.id === e.id ? e : x)) : [...expenses, e];
    }
    if (r.movement) {
      const { id, bankAccountId } = r.movement;
      movements = movements.map((m) => (m.id === id ? { ...m, bankAccountId } : m));
      manejoSessions = manejoSessions.map((m) => (m.id === id ? { ...m, bankAccountId } : m));
    }
    const t = r.transfer;
    if (t && !transfers.some((x) => x.id === t.id)) transfers = [...transfers, t];
    const paired = pairKey(r.line);
    if (paired) reconciled.add(paired);
    const delta = Number(r.line.status === "pending") - Number(statusBefore === "pending");
    pendingDelta.set(r.line.bankAccountId, (pendingDelta.get(r.line.bankAccountId) ?? 0) + delta);
  }
  // ponytail: "conciliado até" and the pending import stay as loaded until the next load.
  const bankAccounts = s.bankAccounts.map((a) =>
    pendingDelta.has(a.id) ? { ...a, pendingLines: Math.max(0, a.pendingLines + pendingDelta.get(a.id)!) } : a
  );
  return { expenses, movements, manejoSessions, transfers, bankAccounts, reconciledIds: [...reconciled] };
}

/** Immutably updates one semen bull's purchases. */
function withPurchases(
  bulls: SemenBull[],
  bullId: string,
  update: (purchases: SemenPurchase[]) => SemenPurchase[]
): SemenBull[] {
  return bulls.map((b) => (b.id === bullId ? { ...b, purchases: update(b.purchases) } : b));
}

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
  if ((await queueUser()) === undefined) return false;
  if (!navigator.onLine || Date.now() - lastNetworkFailureAt < NETWORK_FAILURE_WINDOW_MS) {
    return true;
  }
  // No IndexedDB (private mode): no fila either, so the online path stays as it was.
  return sessionId !== undefined && getOutbox().hasPending(sessionId).catch(() => false);
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
  const signedIn = sessionUserId;
  // Nothing more is saved or queued for them in this page.
  sessionUserId = null;
  signedOut = true;
  bootedAs = undefined;
  bootSignedOut = false;
  try {
    const userId = signedIn ?? (await metaStore().get(LAST_USER_KEY));
    // The next user's offline passes never fall back to this one.
    await metaStore().delete(LAST_USER_KEY);
    if (userId) await clearUserSnapshots(snapshotStore(), userId);
  } catch {
    // no IndexedDB: nothing was saved
  }
  // The next load runs in full and asks the server who signed in.
  useHerdStore.setState(useHerdStore.getInitialState(), true);
}

/**
 * Whose fila a queued op joins: the sync user, or on a page booted from the
 * snapshot before any session read, the last user. None after a sign-out here:
 * the action then goes online and fails as it always did.
 */
async function queueUser(): Promise<string | undefined> {
  const user = getSyncUser();
  if (user !== undefined || signedOut) return user;
  return metaStore()
    .get(LAST_USER_KEY)
    .catch(() => undefined);
}

/** A network failure the fila can take over (it needs a known user). */
async function queueAfter(error: { status: number }): Promise<boolean> {
  return networkFailed(error) && (await queueUser()) !== undefined;
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
  const userId = await queueUser();
  // mustQueue and queueAfter only let an action here with a known user.
  if (userId === undefined) throw new Error("no user to queue for");
  // An op of no farm would never be sent nor shown.
  const farmId = useHerdStore.getState().activeFarmId;
  if (farmId === null) throw new Error("no farm to queue for");
  const op = await getOutbox().enqueue({
    id: crypto.randomUUID(),
    userId,
    farmId,
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
 * out, with its provisional records, and nothing is sent; otherwise (already
 * on its way, or a conflito) the undo itself waits in the fila behind the pass.
 */
async function queueReopen(sessionId: string, earTag: string): Promise<void> {
  const opId = useHerdStore
    .getState()
    .manejoSessions.find((m) => m.id === sessionId)
    ?.animals.find((a) => a.earTag === earTag)?.localOpId;
  if (opId === undefined || !(await getOutbox().removeIfQueued(opId))) {
    await queueOp("reopen", sessionId, {}, earTag);
    return;
  }
  useHerdStore.setState((s) => stripLocal(s, opId));
  await persistSnapshot(useHerdStore.getState);
  void getEngine()?.kick("enqueue");
}

/** The toast and refusal of an entrada without signal: it creates animals on the server. */
function entradaNeedsSignal(): never {
  toast.error("Entrada precisa de sinal");
  throw new Error("entrada without signal");
}

/** The snapshot's user after an offline boot, until the server confirms the session's. */
let bootedAs: string | undefined;
/** The check found no session: nothing is asked again until load runs (a sign-in). */
let bootSignedOut = false;
let confirming: Promise<void> | undefined;
let confirmRetry: ReturnType<typeof setTimeout> | undefined;


/**
 * With signal again after an offline boot, asks who is really signed in; the
 * fila stays held (see holdSync) until it is the booted user.
 */
function confirmBootUser(): Promise<void> {
  if (bootedAs === undefined || bootSignedOut || !navigator.onLine) return Promise.resolve();
  return (confirming ??= checkBootUser().finally(() => {
    confirming = undefined;
  }));
}

async function checkBootUser(): Promise<void> {
  let userId: string | null;
  try {
    userId = await readSessionUser();
  } catch {
    confirmRetry ??= setTimeout(() => {
      confirmRetry = undefined;
      void confirmBootUser();
    }, CONFIRM_RETRY_MS);
    return;
  }
  if (userId === null) {
    // Signed out meanwhile: the fila stays held and nothing more is queued.
    bootSignedOut = true;
    signedOut = true;
    sessionUserId = null;
    setSyncUser(undefined);
    toast.error("Entre de novo para enviar");
    return;
  }
  if (userId !== bootedAs) {
    // Another user: none of the previous user's farms or names stay on screen.
    clearActiveFarmId();
    window.location.reload();
    return;
  }
  await rememberUser(userId);
  // Leaves the snapshot for the server's herd before the fila moves, so nothing races the reload.
  await reloadUnderFila();
  bootedAs = undefined;
  setSyncUser(userId);
}

/** The server's herd with what is still in the fila on top: the phone's passes stay on screen. */
async function reloadUnderFila(): Promise<void> {
  // A failed reload kept the store as it was, fila effects included: nothing to put back.
  if (!(await reloadHerd(useHerdStore.setState))) return;
  const ops = await getOutbox().list(getSyncUser() ?? "", activeFarm() ?? -1);
  useHerdStore.setState((s) =>
    ops.reduce<HerdStore>((acc, op) => ({ ...acc, ...applyLocally(acc, op) }), s)
  );
  await persistSnapshot(useHerdStore.getState);
}

/** The active farm, for the fila: another farm's ops wait until it is active. */
const activeFarm = () => useHerdStore.getState().activeFarmId ?? undefined;

/** Hooks the fila's engine to this store (the first call builds it; see wireOffline). */
function startOffline(): void {
  wireOffline({
    holdSync: () => bootedAs !== undefined,
    farmId: activeFarm,
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
    onBatchResolved: reloadUnderFila,
    onAuthRequired: () => {
      toast.error("Entre de novo para enviar");
    },
    onChange: (sync, ops) => {
      useHerdStore.setState({ sync, ops, outboxCount: ops.length });
      void confirmBootUser();
    },
  });
}

export const useHerdStore = create<HerdStore>()((set, get) => ({
  animals: [],
  treatments: [],
  lots: [],
  invernadas: [],
  removedInvernadas: [],
  lotPlacements: [],
  movements: [],
  breeds: [],
  protocols: [],
  manejoSessions: [],
  expenses: [],
  accounts: [],
  bankAccounts: [],
  transfers: [],
  reconciledIds: [],
  customCategories: [],
  semenBulls: [],
  farm: { name: "", municipality: "", stateRegistration: "", manager: "" },
  loaded: false,
  offline: false,
  snapshotAt: null,
  farms: [],
  activeFarmId: null,
  pendingInvites: [],
  // Until the engine reports (first load), nothing is waiting and nothing says "Sem conexão".
  sync: { online: true, phase: "idle", counts: { queued: 0, conflict: 0, failed: 0 } },
  outboxCount: 0,
  ops: [],

  load: async () => {
    if (get().loaded) {
      // Back after a sign-in in this tab: confirm who it is before anything is sent.
      bootSignedOut = false;
      if (bootedAs !== undefined) {
        await confirmBootUser();
      } else {
        // Maybe someone else signed in after the session expired: hold the fila until the server says.
        const previous = getSyncUser() ?? sessionUserId ?? undefined;
        setSyncUser(undefined);
        await adoptSessionUser(previous);
      }
      startOffline();
      return;
    }
    startOffline();
    const results = await Promise.all([
      // AppShell shows its own screen when this first load fails and the
      // phone has no snapshot to boot from.
      repository.load({ quiet: true }),
      api.farms.get(),
      api.invites.get(),
    ]).catch(async (error: unknown) => {
      // Only without network: a server answer (401, 403, 409, 500) keeps its
      // redirect or failure screen and never flashes a stored farm.
      if (!isNetworkFailure(error)) throw error;
      const boot = await bootSnapshot();
      if (!boot) throw error;
      const { snap } = boot;
      set({
        ...snap.data,
        farms: snap.farms,
        activeFarmId: snap.activeFarmId,
        loaded: true,
        offline: true,
        snapshotAt: snap.savedAt,
      });
      // No session to ask offline: the page, its snapshot and the fila work for
      // the snapshot's user until the server confirms who is signed in.
      sessionUserId = boot.userId;
      bootedAs = boot.userId;
      setSyncUser(boot.userId);
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
    void adoptSessionUser(undefined);
  },

  refreshAccess: async () => {
    const [data, farmsRes] = await Promise.all([repository.load(), api.farms.get()]);
    const activeFarmId = farmsRes.data?.activeFarmId;
    // Same pin as load (see its comment) — refreshAccess runs after deleteFarm
    // clears the stored farm, after an accepted convite and after a forbidden
    // answer, so it must pin too.
    if (getActiveFarmId() === null && activeFarmId != null) setActiveFarmId(activeFarmId);
    set({
      ...data,
      farms: farmsRes.data?.farms ?? get().farms,
      activeFarmId: activeFarmId ?? get().activeFarmId,
      offline: false,
      snapshotAt: null,
    });
    void persistSnapshot(get);
  },

  refreshInvites: async () => {
    const { data } = await api.invites.get();
    set({ pendingInvites: data?.invites ?? [] });
  },

  switchFarm: async (farmId) => {
    if (farmId === get().activeFarmId) return;
    setActiveFarmId(farmId);
    set({ loaded: false });
    const data = await repository.load();
    set({ ...data, activeFarmId: farmId, loaded: true, offline: false, snapshotAt: null });
    void persistSnapshot(get);
    // That farm's fila, if any, goes now.
    void getEngine()?.kick("enqueue");
  },

  createFarm: async ({ name, municipality, copy }) => {
    const source = get().activeFarmId;
    const { data, error } = await api.farms.post({
      name,
      municipality,
      copyFromFarmId: copy && source !== null ? source : undefined,
    });
    if (error || !data) {
      toast.error("Não foi possível criar a fazenda.");
      throw new Error(`create farm failed (status ${error?.status})`);
    }
    setActiveFarmId(data.farmId);
    set({ loaded: false });
    const [herd, farmsRes] = await Promise.all([repository.load(), api.farms.get()]);
    set({
      ...herd,
      farms: farmsRes.data?.farms ?? get().farms,
      activeFarmId: data.farmId,
      loaded: true,
    });
    return data.farmId;
  },

  deleteFarm: async (farmId) => {
    const { error } = await api.farms({ id: farmId }).delete();
    if (error) {
      const code = (error.value as { error?: string } | null | undefined)?.error ?? "";
      toast.error(DELETE_FARM_ERRORS[code] ?? "Não foi possível excluir a fazenda.");
      if (code === "farm_not_found") await get().refreshAccess();
      throw new Error(`delete farm failed (status ${error.status})`);
    }
    // Without a stored choice the server answers with the default farm, and
    // refreshAccess takes the herd and the list from there.
    if (farmId === get().activeFarmId) clearActiveFarmId();
    await get().refreshAccess();
  },

  addAnimal: async (a) => {
    const earTag = a.earTag.trim();
    if (get().animals.some((animal) => animal.earTag === earTag)) return false;
    const { data, error } = await api.animals.post({ ...a, earTag });
    if (error) {
      if (error.status === 409) return false;
      apiFail("cadastrar o animal", error);
    }
    const animal = data as Animal;
    set((s) => ({ animals: [...s.animals, animal] }));
    return true;
  },

  addAnimals: async (list) => {
    const { data, error } = await api.animals.batch.post({
      animals: list.map((animal) => ({ ...animal, earTag: animal.earTag.trim() })),
    });
    if (error) {
      if (error.status === 409) {
        const detail = error.value as { earTags?: string[] };
        return { duplicates: detail.earTags ?? [] };
      }
      apiFail("cadastrar os animais", error);
    }
    const created = data as Animal[];
    set((s) => ({ animals: [...s.animals, ...created] }));
    return { added: created.length };
  },

  importHerd: async (rows) => {
    const { data, error } = await api.animals.import.post({ animals: rows });
    if (error) {
      const detail = error.value as {
        error?: string;
        codes?: string[];
        lots?: string[];
      };
      if (detail.error === "invernada_not_found") {
        toast.error(
          `Invernada não cadastrada: ${detail.codes?.join(", ") || "código desconhecido"}.`
        );
        throw new Error("importar o rebanho failed: invernada_not_found");
      }
      if (detail.error === "lot_invernada_conflict") {
        toast.error(
          `Confira a invernada ${detail.lots?.length === 1 ? "do lote" : "dos lotes"}: ${detail.lots?.join(", ") || "cadastro divergente"}.`
        );
        throw new Error("importar o rebanho failed: lot_invernada_conflict");
      }
      apiFail("importar o rebanho", error);
    }
    const result = data as {
      imported: Animal[];
      skipped: { earTag: string; reason: string }[];
      createdBreeds: string[];
      createdLots: { id: string; name: string }[];
    };
    const summary: ImportSummary = {
      imported: result.imported.length,
      skipped: result.skipped.length,
      createdBreeds: result.createdBreeds,
      createdLots: result.createdLots.map((lot) => lot.name),
    };
    // The import already committed on the server. Re-fetch the whole herd so
    // animals plus any new raças/lots/placements stay consistent; the summary is
    // the server's and comes back regardless of the refresh.
    await reloadHerd(set);
    return summary;
  },

  importBirths: async (rows) => {
    const { data, error } = await api.births.import.post({ births: rows });
    if (error) {
      const detail = error.value as { error?: string };
      if (detail.error === "lot_not_found") {
        toast.error("Um dos lotes escolhidos não está mais numa invernada. Escolha de novo.");
        throw new Error("importar os nascimentos failed: lot_not_found");
      }
      apiFail("importar os nascimentos", error);
    }
    const summary = data as ImportBirthsSummary;
    // Same as importHerd: the write already committed, so a failed refresh must
    // not hide the summary.
    await reloadHerd(set);
    return summary;
  },

  markTreatmentDone: async (id) => {
    await get().completeTreatments([id]);
  },

  completeTreatments: async (ids) => {
    const { data, error } = await api.treatments.complete.post({ ids });
    if (error) apiFail("concluir os tratamentos", error);
    const idSet = new Set(data.ids);
    set((s) => ({
      treatments: s.treatments.map((t) =>
        idSet.has(t.id) ? { ...t, status: "done" as const } : t
      ),
    }));
  },

  scheduleTreatments: async (input) => {
    const { data, error } = await api.treatments.schedule.post(input);
    if (error) apiFail("agendar os tratamentos", error);
    const created = data.treatments as Treatment[];
    set((s) => ({ treatments: [...s.treatments, ...created] }));
    return created.length;
  },

  deleteTreatment: async (id, scope = "batch") => {
    const { data, error } = await api.treatments({ id }).delete(undefined, { query: { scope } });
    if (error) apiFail("excluir o tratamento", error);
    const removed = new Set((data as { ids: string[] }).ids);
    set((s) => ({ treatments: s.treatments.filter((t) => !removed.has(t.id)) }));
    return removed.size;
  },

  startManejoSession: async (input) => {
    // An entrada creates animals on the server: it never starts on the phone.
    const entrada = input.kind === "entry";
    if (entrada && !navigator.onLine) entradaNeedsSignal();
    // The phone names the session: a queued retry of a start the server did get
    // finds the same session (the id is idempotent) instead of a second one.
    const id = crypto.randomUUID();
    if (!entrada && (await mustQueue())) return (await queueOp("start", id, input)).sessionId;
    const { data, error } = await api.manejo.post({ ...input, id });
    if (error) {
      if (entrada && networkFailed(error)) entradaNeedsSignal();
      if (!entrada && (await queueAfter(error))) {
        return (await queueOp("start", id, input)).sessionId;
      }
      apiFail("iniciar o manejo", error);
    }
    const session = data as ManejoSession;
    set((s) => mergeStart(s, session));
    return session.id;
  },

  completeManejoAnimal: async (sessionId, earTag, data = {}) => {
    if (await mustQueue(sessionId)) return queuePass("complete", sessionId, earTag, data);
    const animalId = animalIdByEarTag(get().animals, earTag);
    const response = await api.manejo({ id: sessionId }).animals({ animalId }).complete.post(data);
    if (response.error) {
      if (await queueAfter(response.error)) return queuePass("complete", sessionId, earTag, data);
      if (response.error.status === CONFLICT) {
        const detail = response.error.value as { error?: string };
        if (detail.error === "out_of_stock") {
          // The bull's last dose went meanwhile (another pass, another screen):
          // reload so the chips show the doses the server counts.
          toast.error(OUT_OF_STOCK_MESSAGE);
          await reloadHerd(set);
        } else if (detail.error === "animal_inactive") {
          // A baixa given elsewhere while the session ran: reload so the brete
          // sees the animal out of the herd.
          toast.error(inactiveAnimalMessage(earTag));
          await reloadHerd(set);
        }
        return false; // otherwise stale UI: pass already recorded
      }
      apiFail("concluir o animal no manejo", response.error);
    }
    const result = response.data as CompleteResult;
    set((s) => mergeCompleteResult(s, sessionId, earTag, result));
    return true;
  },

  skipManejoAnimal: async (sessionId, earTag, notes) => {
    if (await mustQueue(sessionId)) {
      await queuePass("skip", sessionId, earTag, { notes });
      return;
    }
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).skip.post({ notes });
    if (error) {
      if (await queueAfter(error)) {
        await queuePass("skip", sessionId, earTag, { notes });
        return;
      }
      if (error.status === CONFLICT) return;
      apiFail("pular o animal no manejo", error);
    }
    const entry = data as ManejoSessionAnimal;
    set((s) => mergeSkipResult(s, sessionId, earTag, entry));
  },

  setAsideManejoAnimal: async (sessionId, earTag, input) => {
    if (await mustQueue(sessionId)) return queuePass("set-aside", sessionId, earTag, input);
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api
      .manejo({ id: sessionId })
      .animals({ animalId })["set-aside"]
      .post(input);
    if (error) {
      if (await queueAfter(error)) return queuePass("set-aside", sessionId, earTag, input);
      if (error.status === CONFLICT) {
        const detail = error.value as { error?: string };
        if (detail.error === "animal_inactive") {
          toast.error(inactiveAnimalMessage(earTag));
          await reloadHerd(set);
        }
        return false;
      }
      apiFail("apartar o animal", error);
    }
    const result = data as SetAsideResult;
    set((s) => mergeSetAsideResult(s, sessionId, earTag, result));
    return true;
  },

  baixaManejoAnimal: async (sessionId, earTag, input) => {
    const notes = input.notes?.trim();
    const body = { reason: input.reason, date: input.date, notes: notes ? notes : undefined };
    if (await mustQueue(sessionId)) return queuePass("baixa", sessionId, earTag, body);
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).baixa.post(body);
    if (error) {
      if (await queueAfter(error)) return queuePass("baixa", sessionId, earTag, body);
      if (error.status === CONFLICT) {
        const detail = error.value as { error?: string };
        if (detail.error === "animal_inactive") toast.error(inactiveAnimalMessage(earTag));
        await reloadHerd(set);
        return false;
      }
      apiFail("dar baixa no animal", error);
    }
    const result = data as { entry: ManejoSessionAnimal; animal: BaixaAnimalPatch };
    set((s) => mergeBaixaResult(s, sessionId, earTag, result));
    return true;
  },

  reopenManejoAnimal: async (sessionId, earTag) => {
    if (await mustQueue(sessionId)) return queueReopen(sessionId, earTag);
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).reopen.post();
    if (error) {
      if (await queueAfter(error)) return queueReopen(sessionId, earTag);
      if (error.status === CONFLICT) {
        const detail = error.value as { error?: string; breedingId?: string };
        if (detail.error === "has_diagnosis") {
          // The cobertura of that pass was already diagnosed: clearing the
          // diagnosis is what lets the undo through, so the toast offers it to
          // whoever may edit Reprodução.
          const clearAndRetry = async (breedingId: string) => {
            try {
              await get().clearDiagnosis(earTag, breedingId);
              await get().reopenManejoAnimal(sessionId, earTag);
            } catch {
              // The store already told the farmer.
            }
          };
          const breedingId = detail.breedingId;
          const canClear = can(
            selectActivePermissions(get().farms, get().activeFarmId),
            "reproduction",
            "edit"
          );
          toast.error(
            "Essa vaca já tem diagnóstico.",
            breedingId === undefined || !canClear
              ? undefined
              : {
                  duration: ACTION_TOAST_MS,
                  action: {
                    label: "Limpar diagnóstico",
                    onClick: () => void clearAndRetry(breedingId),
                  },
                }
          );
        } else if (detail.error === "animal_inactive") {
          toast.error(inactiveAnimalMessage(earTag));
        }
        return; // otherwise stale UI: pass already reverted
      }
      apiFail("desfazer o registro do animal", error);
    }
    const result = data as ReopenResult;
    set((s) => mergeReopenResult(s, sessionId, earTag, result));
  },

  setSaleCarcassYield: async (sessionId, carcassYieldPct) => {
    if (await mustQueue(sessionId)) {
      await queueOp("carcass-yield", sessionId, { carcassYieldPct });
      return;
    }
    const { data, error } = await api
      .manejo({ id: sessionId })["carcass-yield"]
      .post({ carcassYieldPct });
    if (error) {
      if (await queueAfter(error)) {
        await queueOp("carcass-yield", sessionId, { carcassYieldPct });
        return;
      }
      apiFail("definir o rendimento de carcaça", error);
    }
    const result = data as CarcassYieldResult;
    set((s) => mergeCarcassYield(s, sessionId, result));
  },

  closeManejoSession: async (sessionId) => {
    if (await mustQueue(sessionId)) {
      await queueOp("close", sessionId, {});
      return;
    }
    const { error } = await api.manejo({ id: sessionId }).close.post();
    if (error) {
      if (await queueAfter(error)) {
        await queueOp("close", sessionId, {});
        return;
      }
      if (error.status === CONFLICT) {
        const detail = error.value as { error?: string };
        if (detail.error === "held_pending") {
          toast.error("Decida as dúvidas antes de encerrar a venda.");
          // A dúvida set on another device: reload so it shows and Encerrar
          // disables until it is decided.
          await reloadHerd(set);
          return;
        }
      }
      apiFail("encerrar o manejo", error);
    }
    set((s) => mergeClose(s, sessionId));
  },

  deleteManejoSession: async (sessionId) => {
    const sessionDate = get().manejoSessions.find((m) => m.id === sessionId)?.date;
    const response = await api.manejo({ id: sessionId }).delete();
    if (response.error) {
      if (response.error.status === CONFLICT) {
        return (response.error.value as { blocked: BlockedAnimal[] }).blocked;
      }
      apiFail("excluir o manejo", response.error);
    }
    const result = response.data as DeletedManejo;
    const removedTreatments = new Set(result.treatmentIds);
    const weighed = new Set(result.weighedEarTags);
    const restored = new Map(result.restored.map((r) => [r.earTag, r]));
    const removed = new Set(result.removedEarTags);
    const removedBreedingIds = new Set(result.removedBreedings.map((b) => b.breedingId));
    const bred = new Set(result.removedBreedings.map((b) => b.earTag));
    set((s) => ({
      manejoSessions: s.manejoSessions.filter((m) => m.id !== sessionId),
      treatments: s.treatments.filter((t) => !removedTreatments.has(t.id)),
      animals: s.animals
        .filter((a) => !removed.has(a.earTag))
        .map((a) => {
          const back = restored.get(a.earTag);
          // The session wrote at most one reading per animal, on its own date.
          const dropsWeighing = weighed.has(a.earTag) && sessionDate !== undefined;
          // An inseminação's coberturas go with it; their doses are back in stock.
          const reproduction = bred.has(a.earTag) ? a.reproduction : undefined;
          if (!back && !dropsWeighing && !reproduction) return a;
          return {
            ...a,
            ...(back
              ? {
                  ...(back.lotId !== null ? { lotId: back.lotId } : {}),
                  ...(back.active
                    ? { active: true, inactiveReason: undefined, inactiveDate: undefined }
                    : {}),
                }
              : {}),
            ...(dropsWeighing
              ? { weighings: a.weighings.filter((w) => w.date !== sessionDate) }
              : {}),
            ...(reproduction
              ? {
                  reproduction: {
                    ...reproduction,
                    breedings: reproduction.breedings.filter(
                      (b) => !removedBreedingIds.has(b.id)
                    ),
                  },
                }
              : {}),
          };
        }),
    }));
    return null;
  },

  recordWeighing: async (earTag, w) => {
    const id = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.animals({ id }).weighings.post(w);
    if (error) apiFail("registrar a pesagem", error);
    const weighing = data as Weighing;
    set((s) => ({
      animals: s.animals.map((a) =>
        a.earTag === earTag
          ? { ...a, weighings: [...a.weighings, weighing].sort(compareByDate) }
          : a
      ),
    }));
  },

  registerEntryAnimal: async (sessionId, animal) => {
    // An entrada creates the animal on the server; the fila never holds one.
    if (!navigator.onLine) {
      toast.error("Entrada precisa de sinal");
      return false;
    }
    const { data, error } = await api.manejo({ id: sessionId }).animals.post(animal);
    if (error) {
      if (error.status === CONFLICT) return false; // ear tag already in use
      apiFail("registrar o animal na entrada", error);
    }
    const result = data as { entry: ManejoSessionAnimal; animal: Animal };
    set((s) => ({
      animals: [...s.animals, result.animal],
      manejoSessions: s.manejoSessions.map((session) =>
        session.id === sessionId
          ? { ...session, animals: [...session.animals, result.entry] }
          : session
      ),
    }));
    return true;
  },

  deleteWeighingGroup: async (date, earTags) => {
    const { data, error } = await api.weighings.delete({ date, earTags });
    if (error) apiFail("excluir a pesagem", error);
    const affected = new Set(earTags);
    set((s) => ({
      animals: s.animals.map((a) =>
        affected.has(a.earTag)
          ? { ...a, weighings: a.weighings.filter((w) => w.date !== date) }
          : a
      ),
    }));
    return (data as { count: number }).count;
  },

  editWeighing: async (earTag, weighingId, w) => {
    const id = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.animals({ id }).weighings({ weighingId }).patch(w);
    if (error) apiFail("corrigir a pesagem", error);
    const result = data as {
      weighing: Weighing;
      manejo: { sessionId: string; weightKg: number; amountBrl?: number } | null;
    };
    const manejo = result.manejo;
    set((s) => ({
      animals: s.animals.map((a) =>
        a.earTag === earTag
          ? {
              ...a,
              weighings: a.weighings
                .map((existing) => (existing.id === weighingId ? result.weighing : existing))
                .sort(compareByDate),
            }
          : a
      ),
      ...(manejo
        ? {
            manejoSessions: s.manejoSessions.map((m) =>
              m.id === manejo.sessionId
                ? {
                    ...m,
                    animals: m.animals.map((entry) =>
                      entry.weighingId === weighingId
                        ? {
                            ...entry,
                            weightKg: manejo.weightKg,
                            ...(manejo.amountBrl !== undefined
                              ? { amountBrl: manejo.amountBrl }
                              : {}),
                          }
                        : entry
                    ),
                  }
                : m
            ),
          }
        : {}),
    }));
  },

  removeWeighing: async (earTag, weighingId) => {
    const id = animalIdByEarTag(get().animals, earTag);
    const { error } = await api.animals({ id }).weighings({ weighingId }).delete();
    if (error) apiFail("excluir a pesagem", error);
    set((s) => ({
      animals: s.animals.map((a) =>
        a.earTag === earTag
          ? { ...a, weighings: a.weighings.filter((w) => w.id !== weighingId) }
          : a
      ),
    }));
  },

  addBreed: async (name) => {
    const { error } = await api.breeds.post({ name });
    if (error) apiFail("cadastrar a raça", error);
    set((s) => (s.breeds.includes(name) ? s : { breeds: [...s.breeds, name] }));
  },

  removeBreed: async (name) => {
    const { error } = await api.breeds({ name }).delete();
    if (error) {
      if (error.status === 409) return false;
      apiFail("remover a raça", error);
    }
    set((s) => ({ breeds: s.breeds.filter((b) => b !== name) }));
    return true;
  },

  addLot: async (l) => {
    const { data, error } = await api.lots.post(l);
    if (error) {
      if (error.status === CONFLICT) throw new Error("duplicate_lot_name");
      apiFail("criar o lote", error);
    }
    const result = data as { lot: Lot; placement: LotPlacement };
    set((s) => ({
      lots: [...s.lots, result.lot],
      lotPlacements: [...s.lotPlacements, result.placement],
    }));
    return result.lot;
  },

  updateLot: async (id, patch) => {
    const { data, error } = await api.lots({ id }).patch(patch);
    if (error) {
      if (error.status === CONFLICT) throw new Error("duplicate_lot_name");
      apiFail("salvar o lote", error);
    }
    // The API returns the complete logical group after applying the patch.
    const lot = data as Lot;
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? lot : l)) }));
  },

  removeLot: async (id) => {
    const { data, error } = await api.lots({ id }).delete();
    if (error) {
      if (error.status === CONFLICT) return false;
      apiFail("excluir o lote", error);
    }
    // The lot stays in the store carrying deletedAt: history still needs its
    // name. Every list and picker filters it out from here on.
    const result = data as {
      lot: Lot;
      closedPlacement?: LotPlacement;
      removedPlacementId?: string;
    };
    set((s) => ({
      lots: s.lots.map((l) => (l.id === id ? result.lot : l)),
      lotPlacements: s.lotPlacements
        .filter((placement) => placement.id !== result.removedPlacementId)
        .map((placement) =>
          placement.id === result.closedPlacement?.id
            ? result.closedPlacement
            : placement
        ),
    }));
    return true;
  },

  moveLot: async (id, input) => {
    const { data, error } = await api.lots({ id }).placements.post(input);
    if (error) apiFail("mover o lote", error);
    const result = data as {
      placement: LotPlacement;
      previousPlacement: LotPlacement;
    };
    set((s) => {
      const retained = s.lotPlacements
        .filter(
          (placement) =>
            placement.id !== result.previousPlacement.id &&
            placement.id !== result.placement.id
        )
        .map((placement) =>
          placement.lotId === result.placement.lotId && !placement.endedOn
            ? { ...placement, endedOn: result.previousPlacement.startedOn }
            : placement
        );
      return {
        lotPlacements: [
          ...retained,
          result.previousPlacement,
          result.placement,
        ],
      };
    });
  },

  archiveLot: async (id, input) => {
    const { data, error } = await api.lots({ id }).archive.post(input);
    if (error) apiFail("encerrar o lote", error);
    const result = data as { previousPlacement: LotPlacement };
    set((s) => {
      const retained = s.lotPlacements
        .filter((placement) => placement.id !== result.previousPlacement.id)
        .map((placement) =>
          placement.lotId === result.previousPlacement.lotId && !placement.endedOn
            ? { ...placement, endedOn: result.previousPlacement.startedOn }
            : placement
        );
      return {
        lotPlacements: [...retained, result.previousPlacement],
      };
    });
  },

  addInvernada: async (input) => {
    const { data, error } = await api.invernadas.post(input);
    if (error) apiFail("cadastrar a invernada", error);
    const invernada = data as Invernada;
    set((s) => ({ invernadas: [...s.invernadas, invernada] }));
    return invernada;
  },

  updateInvernada: async (id, patch) => {
    const { data, error } = await api.invernadas({ id }).patch(patch);
    if (error) apiFail("salvar a invernada", error);
    const invernada = data as Invernada;
    set((s) => ({
      invernadas: s.invernadas.map((item) => (item.id === id ? invernada : item)),
    }));
  },

  removeInvernada: async (id) => {
    const { data, error } = await api.invernadas({ id }).delete();
    if (error) {
      if (error.status === 409) return false;
      apiFail("remover a invernada", error);
    }
    const removed = data as Invernada;
    // One kept for the lot history moves to removedInvernadas; one no lote ever
    // grazed is simply gone.
    set((s) => ({
      invernadas: s.invernadas.filter((item) => item.id !== id),
      removedInvernadas: removed.removedAt
        ? [...(s.removedInvernadas ?? []), removed]
        : s.removedInvernadas,
    }));
    return true;
  },

  saveFarm: async (d) => {
    // No `headquarters` key: the server keeps the saved map view.
    const { data, error } = await api.farm.put(d);
    if (error) apiFail("salvar os dados da fazenda", error);
    set({ farm: { ...(data as FarmData) } });
  },

  saveHeadquarters: async (view) => {
    const { data, error } = await api.farm.headquarters.put({ headquarters: view });
    if (error) apiFail("salvar a sede no mapa", error);
    set({ farm: { ...(data as FarmData) } });
  },

  addProtocol: async (p, generateSchedule) => {
    const { data, error } = await api.protocols.post({ protocol: p, generateSchedule });
    if (error) apiFail("criar o protocolo", error);
    const { protocol, treatments } = data as {
      protocol: HealthProtocol;
      treatments: Treatment[];
    };
    set((s) => ({
      protocols: [...s.protocols, protocol],
      treatments: [...s.treatments, ...treatments],
    }));
  },

  removeProtocol: async (id) => {
    const { error } = await api.protocols({ id }).delete();
    if (error) apiFail("remover o protocolo", error);
    set((s) => ({ protocols: s.protocols.filter((p) => p.id !== id) }));
  },

  addExpense: async (e, repeat) => {
    const { data, error } = await api.expenses.post(repeat ? { ...e, repeat } : e);
    if (error) {
      if ((error.value as { error?: string } | null)?.error === "starts_too_old") {
        toast.error("A recorrência não pode começar há mais de 12 meses.");
        throw new Error("lançar a despesa failed (starts_too_old)");
      }
      apiFail("lançar a despesa", error);
    }
    const created = data as Expense[];
    set((s) => ({ expenses: [...s.expenses, ...created] }));
    return created;
  },

  updateExpense: async (id, patch, scope = "one") => {
    const { data, error } = await api.expenses({ id }).patch({ ...patch, scope });
    if (error) apiFail("salvar o lançamento", error);
    if (scope !== "one") {
      if (!(await reloadHerd(set))) toast.info(SCOPED_RELOAD_FAILED);
      return;
    }
    // The PATCH answers the full row, série fields and anexo count included.
    const expense = data as Expense;
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? expense : e)) }));
    // The server may have unpaired its linha do extrato (pago, conta, valor or tipo changed).
    const unpairs = ["paidAt", "bankAccountId", "amountBrl", "kind"].some((key) => key in patch);
    if (unpairs && isReconciled(get().reconciledIds, id)) await reloadHerd(set);
  },

  markExpensePaid: (id, paidAt, bankAccountId) =>
    get().updateExpense(id, { paidAt, bankAccountId: paidAt === null ? null : (bankAccountId ?? null) }),

  removeExpense: async (id, scope = "one") => {
    const { error } = await api.expenses({ id }).delete(undefined, { query: { scope } });
    if (error) apiFail("remover a despesa", error);
    if (scope !== "one") {
      if (!(await reloadHerd(set))) toast.info(SCOPED_RELOAD_FAILED);
      return;
    }
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
    // Its linha do extrato went back to pending: the conta's figures change.
    if (isReconciled(get().reconciledIds, id)) await reloadHerd(set);
  },

  attachmentsEnabled: async () => {
    try {
      const { data, error } = await api.attachments.status.get();
      return error ? null : data.enabled;
    } catch {
      return null;
    }
  },

  listAttachments: async (expenseId) => {
    const { data, error } = await api.expenses({ id: expenseId }).attachments.get();
    if (error) apiFail("carregar os anexos", error);
    return data as Attachment[];
  },

  uploadAttachment: async (expenseId, file, onProgress) => {
    const farmId = get().activeFarmId;
    if (farmId === null) throw new Error("no active farm for the upload");
    const { upload } = await import("@vercel/blob/client");
    let pathname: string;
    try {
      const blob = await upload(
        attachmentPathname(farmId, expenseId, crypto.randomUUID(), file.name),
        file,
        {
          access: "private",
          handleUploadUrl: "/api/herd/attachments/upload-token",
          headers: { "x-farm-id": String(farmId) },
          contentType: attachmentContentType(file.name, file.type),
          onUploadProgress: ({ percentage }) => onProgress?.(percentage),
        }
      );
      pathname = blob.pathname;
    } catch (error) {
      // A refused token reaches us only as "Failed to retrieve the client token":
      // ask the farm check again so a lost membership or access gets apiFail's 403 handling.
      if (error instanceof Error && error.message.includes("client token")) {
        const check = await api.attachments.status.get().catch(() => null);
        if (check?.error?.status === 403) apiFail(`enviar ${file.name}`, check.error);
      }
      toast.error(`Não foi possível enviar ${file.name}. Tente novamente.`);
      throw error;
    }
    const { data, error } = await api
      .expenses({ id: expenseId })
      .attachments.post({ pathname, fileName: file.name });
    let saved = data as Attachment;
    if (error?.status === CONFLICT) {
      // The pathname is registered already, so the anexo is saved: answer it as saved.
      const list = await get().listAttachments(expenseId);
      const match = list.filter((a) => a.fileName === file.name).at(-1);
      if (!match) apiFail("salvar o anexo", error);
      saved = match;
    } else if (error) apiFail("salvar o anexo", error);
    set((s) => ({
      expenses: s.expenses.map((e) =>
        e.id === expenseId ? { ...e, attachmentCount: (e.attachmentCount ?? 0) + 1 } : e
      ),
    }));
    return saved;
  },

  removeAttachment: async (attachment) => {
    const { error } = await api.attachments({ id: attachment.id }).delete();
    if (error) apiFail("remover o anexo", error);
    set((s) => ({
      expenses: s.expenses.map((e) =>
        e.id === attachment.expenseId
          ? { ...e, attachmentCount: Math.max(0, (e.attachmentCount ?? 0) - 1) }
          : e
      ),
    }));
  },

  addAccount: async (input) => {
    const { data, error } = await api.accounts.post(input);
    if (error) {
      if (error.status === CONFLICT) return null;
      apiFail("criar a conta", error);
    }
    const account = data as Account;
    set((s) => ({ accounts: [...s.accounts, account] }));
    return account;
  },

  updateAccount: async (id, patch) => {
    const { data, error } = await api.accounts({ id }).patch(patch);
    if (error) {
      if (error.status === CONFLICT) return false;
      apiFail("salvar a conta", error);
    }
    const account = data as Account;
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? account : a)) }));
    return true;
  },

  seedDefaultAccounts: async () => {
    const { data, error } = await api.accounts.defaults.post();
    if (error) apiFail("criar as contas padrão", error);
    const { created } = data as { created: Account[] };
    set((s) => ({ accounts: [...s.accounts, ...created] }));
    return created.length;
  },

  addBankAccount: async (input) => {
    const { data, error } = await api["bank-accounts"].post(input);
    if (error) apiFail("criar a conta", error);
    const account = data as BankAccount;
    set((s) => ({ bankAccounts: [...withoutMain(s.bankAccounts, account), account] }));
    return account;
  },

  updateBankAccount: async (id, patch) => {
    const { data, error } = await api["bank-accounts"]({ id }).patch(patch);
    if (error) apiFail("salvar a conta", error);
    const saved = data as BankAccount;
    set((s) => ({
      bankAccounts: withoutMain(s.bankAccounts, saved).map((a) => (a.id === id ? keepLines(a, saved) : a)),
    }));
    return saved;
  },

  archiveBankAccount: async (id, archived) => {
    const { data, error } = await api["bank-accounts"]({ id }).archive.post({ archived });
    if (error) {
      if (error.status === CONFLICT) {
        toast.error("Marque outra conta como principal antes de arquivar esta.");
        return false;
      }
      apiFail("arquivar a conta", error);
    }
    const saved = data as BankAccount;
    set((s) => ({ bankAccounts: s.bankAccounts.map((a) => (a.id === id ? keepLines(a, saved) : a)) }));
    return true;
  },

  removeBankAccount: async (id) => {
    const { error } = await api["bank-accounts"]({ id }).delete();
    if (error) {
      const code = (error.value as { error?: string } | null)?.error;
      if (error.status === CONFLICT && (code === "in_use" || code === "is_main")) return code;
      apiFail("excluir a conta", error);
    }
    set((s) => ({ bankAccounts: s.bankAccounts.filter((a) => a.id !== id) }));
    return "deleted";
  },

  addTransfer: async (input) => {
    const { data, error } = await api.transfers.post({ ...input, notes: input.notes || undefined });
    if (error) apiFail("registrar a transferência", error);
    const transfer = data as Transfer;
    set((s) => ({ transfers: [...s.transfers, transfer] }));
    return transfer;
  },

  updateTransfer: async (id, patch) => {
    const { data, error } = await api.transfers({ id }).patch(patch);
    if (error) apiFail("salvar a transferência", error);
    const transfer = data as Transfer;
    set((s) => ({ transfers: s.transfers.map((t) => (t.id === id ? transfer : t)) }));
    const unpairs = patch.fromId !== undefined || patch.toId !== undefined || patch.amountBrl !== undefined;
    if (unpairs && isReconciled(get().reconciledIds, id)) await reloadHerd(set);
    return transfer;
  },

  removeTransfer: async (id) => {
    const { error } = await api.transfers({ id }).delete();
    if (error) apiFail("remover a transferência", error);
    set((s) => ({ transfers: s.transfers.filter((t) => t.id !== id) }));
    if (isReconciled(get().reconciledIds, id)) await reloadHerd(set);
  },

  setMovementBankAccount: async (id, bankAccountId) => {
    const { error } = await api.movements({ id })["bank-account"].patch({ bankAccountId });
    if (error) apiFail("salvar a conta da venda", error);
    const conta = bankAccountId ?? undefined;
    set((s) => ({
      movements: s.movements.map((m) => (m.id === id ? { ...m, bankAccountId: conta } : m)),
      manejoSessions: s.manejoSessions.map((m) => (m.id === id ? { ...m, bankAccountId: conta } : m)),
    }));
    if (isReconciled(get().reconciledIds, id)) await reloadHerd(set);
  },

  importStatement: async (bankAccountId, file) => {
    const { data, error } = await api["bank-accounts"]({ id: bankAccountId }).imports.post(file);
    if (error) {
      const code = (error.value as { error?: string } | null)?.error;
      if ((error.status === 400 || error.status === CONFLICT) && code) return { error: code };
      apiFail("importar o extrato", error);
    }
    if (!(await reloadHerd(set))) toast.info("Extrato importado. Recarregue para ver as contas.");
    return data as ImportResult;
  },

  loadImport: async (importId) => {
    const { data, error } = await api.imports({ id: importId }).get();
    if (error) {
      if (error.status === 404) return null;
      apiFail("carregar o extrato", error);
    }
    return data as ImportView;
  },

  resolveStatementLine: async (line, decision) => {
    const lines = api["statement-lines"]({ id: line.id });
    const response =
      decision.type === "match"
        ? await lines.match.post(decision.target)
        : decision.type === "create"
          ? await lines.create.post(decision.entry)
          : decision.type === "transfer"
            ? await lines.transfer.post({ otherAccountId: decision.otherAccountId })
            : decision.type === "ignore"
              ? await lines.ignore.post({ reason: decision.reason })
              : await lines.undo.post();
    if (response.error) {
      const code = (response.error.value as { error?: string } | null)?.error ?? "";
      const message = LINE_REFUSALS[code];
      if (message) {
        toast.error(message);
        return null;
      }
      apiFail("conciliar a linha", response.error);
    }
    const resolved = response.data as Resolved;
    const pairedBefore = pairKey(line);
    set((s) => mergeResolved(s, [resolved], decision.type === "undo" ? pairedBefore : undefined, line.status));
    return resolved;
  },

  confirmHighMatches: async (importId, pairs) => {
    const { data, error } = await api.imports({ id: importId })["confirm-high"].post({ pairs });
    if (error) apiFail("confirmar as sugestões", error);
    const result = data as { resolved: Resolved[]; refused: number };
    set((s) => mergeResolved(s, result.resolved, undefined, "pending"));
    return result;
  },

  addCustomCategory: async (c) => {
    const { data, error } = await api.categories.post(c);
    if (error) {
      if (error.status === 409) return false;
      apiFail("criar a categoria", error);
    }
    const category = data as CustomCategory;
    set((s) => ({ customCategories: [...s.customCategories, category] }));
    return true;
  },

  removeCustomCategory: async (id) => {
    const { error } = await api.categories({ id }).delete();
    if (error) {
      if (error.status === 409) return false;
      apiFail("remover a categoria", error);
    }
    set((s) => ({ customCategories: s.customCategories.filter((c) => c.id !== id) }));
    return true;
  },

  recordBreeding: async (earTag, input) => {
    const id = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.animals({ id }).breedings.post(input);
    if (error) {
      const detail = error.value as { error?: string };
      if (error.status === CONFLICT && detail.error === "out_of_stock") {
        // The registered bull's last dose is gone: reload so the select shows it.
        toast.error(OUT_OF_STOCK_MESSAGE);
        await reloadHerd(set);
        return false;
      }
      apiFail("registrar a cobertura", error);
    }
    // With a semen bull the server replaced bullEarTag: keep its record, not the input.
    const breeding = data as Breeding;
    set((s) => ({
      animals: withReproduction(s.animals, earTag, (r) => ({
        ...r,
        breedings: [...r.breedings, breeding],
      })),
    }));
    return true;
  },

  recordDiagnosis: async (earTag, input) => {
    const id = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.animals({ id }).diagnoses.post(input);
    if (error) apiFail("registrar o diagnóstico", error);
    const diagnosis = data as PregnancyDiagnosis;
    set((s) => ({
      animals: withReproduction(s.animals, earTag, (r) => ({
        ...r,
        // One diagnosis per breeding: a re-exam replaces the previous result.
        diagnoses: [
          ...r.diagnoses.filter((d) => d.breedingId !== diagnosis.breedingId),
          diagnosis,
        ],
      })),
    }));
  },

  clearDiagnosis: async (earTag, breedingId) => {
    const id = animalIdByEarTag(get().animals, earTag);
    const { error } = await api.animals({ id }).diagnoses({ breedingId }).delete();
    if (error) apiFail("desfazer o diagnóstico", error);
    set((s) => ({
      animals: withReproduction(s.animals, earTag, (r) => ({
        ...r,
        diagnoses: r.diagnoses.filter((d) => d.breedingId !== breedingId),
      })),
    }));
  },

  addSemenBull: async (input) => {
    const { data, error } = await api["semen-bulls"].post(input);
    if (error) {
      if (error.status === CONFLICT) return "duplicate";
      apiFail("cadastrar o touro", error);
    }
    const result = data as { bull: SemenBull; expense?: Expense };
    const expense = result.expense;
    set((s) => ({
      semenBulls: [...s.semenBulls, result.bull].sort(compareByName),
      ...(expense ? { expenses: [...s.expenses, expense] } : {}),
    }));
    return result.bull;
  },

  updateSemenBull: async (id, patch) => {
    const { data, error } = await api["semen-bulls"]({ id }).patch(patch);
    if (error) {
      if (error.status === CONFLICT) return false;
      apiFail("salvar o touro", error);
    }
    // The API returns the whole bull, purchases included.
    const bull = data as SemenBull;
    set((s) => ({
      semenBulls: s.semenBulls.map((b) => (b.id === id ? bull : b)).sort(compareByName),
    }));
    return true;
  },

  addSemenPurchase: async (bullId, input) => {
    const { data, error } = await api["semen-bulls"]({ id: bullId }).purchases.post(input);
    if (error) apiFail("registrar a compra de sêmen", error);
    const { purchase, expense } = data as { purchase: SemenPurchase; expense: Expense };
    set((s) => ({
      semenBulls: withPurchases(s.semenBulls, bullId, (purchases) =>
        [...purchases, purchase].sort(compareByDate)
      ),
      expenses: [...s.expenses, expense],
    }));
  },

  removeSemenPurchase: async (bullId, purchaseId) => {
    const { data, error } = await api["semen-bulls"]({ id: bullId })
      .purchases({ purchaseId })
      .delete();
    if (error) {
      const detail = error.value as { error?: string };
      if (error.status === CONFLICT && detail.error === "stock_negative") {
        // Its doses were already used, more than the store counted: catch up.
        await reloadHerd(set);
        return false;
      }
      apiFail("excluir a compra de sêmen", error);
    }
    // The purchase's expense went with it, unless it had been removed before.
    const { expenseId } = data as { id: string; expenseId: string | null };
    set((s) => ({
      semenBulls: withPurchases(s.semenBulls, bullId, (purchases) =>
        purchases.filter((p) => p.id !== purchaseId)
      ),
      ...(expenseId !== null
        ? { expenses: s.expenses.filter((e) => e.id !== expenseId) }
        : {}),
    }));
    return true;
  },

  removeSemenBull: async (id) => {
    const { data, error } = await api["semen-bulls"]({ id }).delete();
    if (error) {
      const detail = error.value as { error?: string };
      if (
        error.status === CONFLICT &&
        (detail.error === "doses_used" || detail.error === "open_insemination")
      ) {
        await reloadHerd(set);
        return detail.error;
      }
      apiFail("excluir o touro", error);
    }
    const { expenseIds } = data as { id: string; expenseIds: string[] };
    set((s) => ({
      semenBulls: s.semenBulls.filter((b) => b.id !== id),
      expenses: s.expenses.filter((e) => !expenseIds.includes(e.id)),
    }));
    return null;
  },

  recordCalving: async (earTag, input) => {
    const calfEarTag = input.calfEarTag.trim();
    if (get().animals.some((a) => a.earTag === calfEarTag)) return false;
    const id = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api
      .animals({ id })
      .calvings.post({ ...input, calfEarTag });
    if (error) {
      if (error.status === 409) return false;
      apiFail("registrar o parto", error);
    }
    const { calving, calf } = data as { calving: Calving; calf: Animal };
    set((s) => ({
      animals: [
        ...withReproduction(s.animals, earTag, (r) => ({
          ...r,
          calvings: [...r.calvings, calving],
        })),
        calf,
      ],
    }));
    return true;
  },

  updateAnimal: async (earTag, patch) => {
    const id = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.animals({ id }).patch(patch);
    if (error) {
      if (error.status === CONFLICT) return false;
      apiFail("salvar o animal", error);
    }
    const { changes } = data as { earTag: string; changes: Partial<Animal> };
    const newTag = changes.earTag ?? earTag;
    set((s) => ({
      animals: s.animals.map((a) => (a.earTag === earTag ? { ...a, ...changes } : a)),
      // A renamed ear tag must follow the animal into its history, which the
      // server joins by internal id — mirror that here without a refetch.
      ...(newTag !== earTag
        ? {
            treatments: s.treatments.map((t) =>
              t.animalEarTag === earTag ? { ...t, animalEarTag: newTag } : t
            ),
            manejoSessions: s.manejoSessions.map((session) => ({
              ...session,
              animals: session.animals.map((a) =>
                a.earTag === earTag ? { ...a, earTag: newTag } : a
              ),
            })),
          }
        : {}),
    }));
    return true;
  },

  reactivateAnimal: async (earTag) => {
    const id = animalIdByEarTag(get().animals, earTag);
    const { error } = await api.animals({ id }).reactivate.post();
    if (error) {
      const code = (error.value as { error?: string } | null | undefined)?.error;
      if (code === "lot_deleted") {
        toast.error(`O lote do animal ${earTag} foi excluído: ele não tem para onde voltar.`);
        throw new Error("reactivate animal failed (lot_deleted)");
      }
      apiFail("desfazer a baixa do animal", error);
    }
    set((s) => ({
      animals: s.animals.map((a) =>
        a.earTag === earTag
          ? {
              ...a,
              active: true,
              inactiveReason: undefined,
              inactiveDate: undefined,
              inactiveNotes: undefined,
            }
          : a
      ),
    }));
  },

  deactivateAnimal: async (earTag, input) => {
    const notes = input.notes?.trim();
    const id = animalIdByEarTag(get().animals, earTag);
    const { error } = await api.animals({ id }).deactivate.post({
      reason: input.reason,
      date: input.date,
      notes: notes ? notes : undefined,
    });
    if (error) apiFail("dar baixa no animal", error);
    set((s) => ({
      animals: s.animals.map((a) =>
        a.earTag === earTag
          ? {
              ...a,
              active: false,
              inactiveReason: input.reason,
              inactiveDate: input.date,
              inactiveNotes: notes ? notes : undefined,
            }
          : a
      ),
    }));
  },
}));
