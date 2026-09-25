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
  Breeding,
  Calving,
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
  ReproductionRecord,
  ScheduleTreatmentsInput,
  SemenBull,
  SemenPurchase,
  Sex,
  Weighing,
  HealthProtocol,
  Treatment,
} from "@/lib/types";
import { toast } from "sonner";
import { type HerdRepository } from "@/lib/repository/HerdRepository";
import { ApiHerdRepository } from "@/lib/repository/ApiHerdRepository";
import { api } from "@/lib/api/client";
import { clearActiveFarmId, getActiveFarmId, setActiveFarmId } from "@/lib/api/activeFarm";
import { can, type FarmRole, type MemberPreset, type Permissions } from "@/lib/domain/permissions";
import type { BullRemovalBlock } from "@/lib/domain/semen";
import { selectActivePermissions } from "@/lib/store/selectors";
import type { MyInvite } from "@/lib/api/domains/invites/useCases/BrowseMine.useCase";
import type { ImportAnimalPayload } from "@/lib/domain/herdImport";
import type { ImportBirthPayload } from "@/lib/domain/birthImport";
import type { BlockedAnimal } from "@/lib/domain/manejoRevert";
import type { DeletedManejo } from "@/lib/api/domains/manejo/useCases/Delete.useCase";

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

/** Herd change a manejo pass applied to one animal (lot, herd membership). */
interface PassAnimalPatch {
  earTag: string;
  active: boolean;
  lotId: string;
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
  [K in "notes" | "dueDate" | "paidAt" | "counterparty" | "document" | "accountId" | "lotId"]?:
    | string
    | null;
};

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
  loaded: boolean;
  /** Farms the user can access; the switcher lists them all, even just one. */
  farms: FarmOption[];
  activeFarmId: number | null;
  /** Convites waiting for the signed-in e-mail (the Painel banner, the avatar dot). */
  pendingInvites: MyInvite[];
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
  addExpense: (e: Omit<Expense, "id">) => Promise<void>;
  /** Saves the sent fields of a lançamento and keeps the server's row. */
  updateExpense: (id: string, patch: ExpensePatch) => Promise<void>;
  /** Marks a lançamento paid/received on `paidAt`, or pendente again with null. */
  markExpensePaid: (id: string, paidAt: string | null) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  /** Creates a conta; null when its grupo already has that name (409). */
  addAccount: (input: { group: AccountGroup; name: string }) => Promise<Account | null>;
  /** Renames, archives or restores a conta; false when the name is taken (409). */
  updateAccount: (id: string, patch: { name?: string; archived?: boolean }) => Promise<boolean>;
  /** Creates the standard contas the farm lacks; resolves how many were created. */
  seedDefaultAccounts: () => Promise<number>;
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
function apiFail(action: string, error: { status: number; value?: unknown }): never {
  const code = (error.value as { error?: string } | null | undefined)?.error;
  if (error.status === 403 && code === "not_a_member") {
    clearActiveFarmId();
    window.location.reload();
  } else if (error.status === 403 && code === "forbidden") {
    toast.error("Seu acesso a esta fazenda mudou.");
    void useHerdStore.getState().refreshAccess().catch(() => {});
  } else {
    toast.error(`Não foi possível ${action}. Tente novamente.`);
  }
  throw new Error(`${action} failed (status ${error.status})`);
}

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

const compareByDate = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

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

/** Immutably updates one semen bull's purchases. */
function withPurchases(
  bulls: SemenBull[],
  bullId: string,
  update: (purchases: SemenPurchase[]) => SemenPurchase[]
): SemenBull[] {
  return bulls.map((b) => (b.id === bullId ? { ...b, purchases: update(b.purchases) } : b));
}

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
  customCategories: [],
  semenBulls: [],
  farm: { name: "", municipality: "", stateRegistration: "", manager: "" },
  loaded: false,
  farms: [],
  activeFarmId: null,
  pendingInvites: [],

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
    });
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
    set({ ...data, activeFarmId: farmId, loaded: true });
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
    const { data, error } = await api.manejo.post(input);
    if (error) apiFail("iniciar o manejo", error);
    const session = data as ManejoSession;
    set((s) => ({ manejoSessions: [...s.manejoSessions, session] }));
    return session.id;
  },

  completeManejoAnimal: async (sessionId, earTag, data = {}) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const response = await api.manejo({ id: sessionId }).animals({ animalId }).complete.post(data);
    if (response.error) {
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
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).skip.post({ notes });
    if (error) {
      if (error.status === CONFLICT) return;
      apiFail("pular o animal no manejo", error);
    }
    const entry = data as ManejoSessionAnimal;
    set((s) => ({
      manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, entry),
    }));
  },

  setAsideManejoAnimal: async (sessionId, earTag, input) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api
      .manejo({ id: sessionId })
      .animals({ animalId })["set-aside"]
      .post(input);
    if (error) {
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
  },

  baixaManejoAnimal: async (sessionId, earTag, input) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const notes = input.notes?.trim();
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).baixa.post({
      reason: input.reason,
      date: input.date,
      notes: notes ? notes : undefined,
    });
    if (error) {
      if (error.status === CONFLICT) {
        const detail = error.value as { error?: string };
        if (detail.error === "animal_inactive") toast.error(inactiveAnimalMessage(earTag));
        await reloadHerd(set);
        return false;
      }
      apiFail("dar baixa no animal", error);
    }
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
  },

  reopenManejoAnimal: async (sessionId, earTag) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).reopen.post();
    if (error) {
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
    const { data, error } = await api
      .manejo({ id: sessionId })["carcass-yield"]
      .post({ carcassYieldPct });
    if (error) apiFail("definir o rendimento de carcaça", error);
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

  closeManejoSession: async (sessionId) => {
    const { error } = await api.manejo({ id: sessionId }).close.post();
    if (error) {
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
    set((s) => ({
      manejoSessions: s.manejoSessions.map((m) =>
        m.id === sessionId ? { ...m, status: "closed" as const } : m
      ),
    }));
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

  addExpense: async (e) => {
    const { data, error } = await api.expenses.post(e);
    if (error) apiFail("lançar a despesa", error);
    const expense = data as Expense;
    set((s) => ({ expenses: [...s.expenses, expense] }));
  },

  updateExpense: async (id, patch) => {
    const { data, error } = await api.expenses({ id }).patch(patch);
    if (error) apiFail("salvar o lançamento", error);
    const expense = data as Expense;
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? expense : e)) }));
  },

  markExpensePaid: (id, paidAt) => get().updateExpense(id, { paidAt }),

  removeExpense: async (id) => {
    const { error } = await api.expenses({ id }).delete();
    if (error) apiFail("remover a despesa", error);
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
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
