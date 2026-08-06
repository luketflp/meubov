/**
 * Zustand herd store: extends HerdData with the hydration flag and the write
 * actions. All updates are immutable and the new ids are deterministic
 * (prefix + counter derived from the current collection size).
 */
import { create } from "zustand";
import type {
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
  Sex,
  Weighing,
  HealthProtocol,
  Treatment,
} from "@/lib/types";
import { toast } from "sonner";
import { type HerdRepository } from "@/lib/repository/HerdRepository";
import { ApiHerdRepository } from "@/lib/repository/ApiHerdRepository";
import { api } from "@/lib/api/client";
import { setActiveFarmId } from "@/lib/api/activeFarm";
import type { ImportAnimalPayload } from "@/lib/domain/herdImport";

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
  notes?: string;
}

/** Animal arriving in an entry session: registered and handled in one pass. */
export type EntryAnimal = Omit<NewAnimal, "lotId"> & { notes?: string };

/** Data captured for one animal at the chute. */
export interface ManejoPassData {
  weightKg?: number;
  notes?: string;
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

/** Breeding to record; the id comes from the server. */
export type NewBreeding = Omit<Breeding, "id">;

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

/** Summary of a bulk import, shown on the dialog's final screen. */
export interface ImportSummary {
  imported: number;
  skipped: number;
  createdBreeds: string[];
  /** Names of the lots auto-created by the import. */
  createdLots: string[];
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

/** A farm the user can switch to (from GET /farms). */
export interface FarmOption {
  id: number;
  name: string;
  role: "owner" | "member";
}

export interface HerdStore extends HerdData {
  loaded: boolean;
  /** Farms the user can access; the picker only renders with more than one. */
  farms: FarmOption[];
  activeFarmId: number | null;
  load: () => Promise<void>;
  /** Persists the choice and rehydrates the whole store from the new farm. */
  switchFarm: (farmId: number) => Promise<void>;
  /** Registers the animal via the API; false when the ear tag is taken. */
  addAnimal: (a: NewAnimal) => Promise<boolean>;
  /** Bulk-imports parsed rows, refreshes the herd, and returns a summary. */
  importHerd: (rows: ImportAnimalPayload[]) => Promise<ImportSummary>;
  markTreatmentDone: (id: string) => Promise<void>;
  completeTreatments: (ids: string[]) => Promise<void>;
  /** Opens a manejo session and returns its id (for the run screen). */
  startManejoSession: (input: NewManejoSession) => Promise<string>;
  /** Applies the session's effects to one animal and marks it done. */
  completeManejoAnimal: (
    sessionId: string,
    earTag: string,
    data?: ManejoPassData
  ) => Promise<void>;
  /** Marks one animal as skipped (did not pass the chute). */
  skipManejoAnimal: (sessionId: string, earTag: string, notes?: string) => Promise<void>;
  /** Undo: reverts one animal to pending, removing the effects it created. */
  reopenManejoAnimal: (sessionId: string, earTag: string) => Promise<void>;
  /**
   * Sets the rendimento de carcaça of an open venda per arroba (the modal
   * before the chute); passes already recorded are repriced by the server.
   */
  setSaleCarcassYield: (sessionId: string, carcassYieldPct: number) => Promise<void>;
  /** Closes the session (remaining animals stay recorded as they are). */
  closeManejoSession: (sessionId: string) => Promise<void>;
  /**
   * Registers one animal arriving in an entry session (compra): it joins the
   * herd in the session's destination lot, already handled. False when the ear
   * tag is already in use.
   */
  registerEntryAnimal: (sessionId: string, animal: EntryAnimal) => Promise<boolean>;
  recordWeighing: (earTag: string, w: Weighing) => Promise<void>;
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
  saveFarm: (d: FarmData) => Promise<void>;
  addProtocol: (p: Omit<HealthProtocol, "id">, generateSchedule: boolean) => Promise<void>;
  removeProtocol: (id: string) => Promise<void>;
  addExpense: (e: Omit<Expense, "id">) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  /** Creates a custom category; false when the name is already in use. */
  addCustomCategory: (c: Omit<CustomCategory, "id">) => Promise<boolean>;
  /** Removes a custom category; false when an active animal still uses it. */
  removeCustomCategory: (id: string) => Promise<boolean>;
  /** Records a breeding of one female (herd bull or external semen code). */
  recordBreeding: (earTag: string, input: NewBreeding) => Promise<void>;
  /** Records (or corrects) the pregnancy diagnosis of one breeding. */
  recordDiagnosis: (earTag: string, input: PregnancyDiagnosis) => Promise<void>;
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
 * Signals an unexpected API failure: shows an error toast (important actions
 * only reach here) and throws. `action` is the pt-BR verb phrase shown to the
 * user, e.g. "cadastrar o animal".
 */
function apiFail(action: string, status: number): never {
  toast.error(`Não foi possível ${action}. Tente novamente.`);
  throw new Error(`${action} failed (status ${status})`);
}

/** Default repository; swap the implementation here to change the backend. */
const repository: HerdRepository = new ApiHerdRepository();

const compareByDate = (a: Weighing, b: Weighing): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

/** Resolves the editable ear tag to the stable id used by API path segments. */
function animalIdByEarTag(animals: Animal[], earTag: string): string {
  const animalId = animals.find((animal) => animal.earTag === earTag)?.id;
  if (animalId === undefined) throw new Error(`Animal ${earTag} not found in herd store`);
  return animalId;
}

/** Conflict statuses a manejo pass can hit (stale UI); treated as a no-op. */
const CONFLICT = 409;

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
  lotPlacements: [],
  movements: [],
  breeds: [],
  protocols: [],
  manejoSessions: [],
  expenses: [],
  customCategories: [],
  farm: { name: "", municipality: "", stateRegistration: "", manager: "" },
  loaded: false,
  farms: [],
  activeFarmId: null,

  load: async () => {
    if (get().loaded) return;
    const [data, farmsRes] = await Promise.all([repository.load(), api.farms.get()]);
    set({
      ...data,
      farms: farmsRes.data?.farms ?? [],
      activeFarmId: farmsRes.data?.activeFarmId ?? null,
      loaded: true,
    });
  },

  switchFarm: async (farmId) => {
    if (farmId === get().activeFarmId) return;
    setActiveFarmId(farmId);
    set({ loaded: false });
    const data = await repository.load();
    set({ ...data, activeFarmId: farmId, loaded: true });
  },

  addAnimal: async (a) => {
    const earTag = a.earTag.trim();
    if (get().animals.some((animal) => animal.earTag === earTag)) return false;
    const { data, error } = await api.animals.post({ ...a, earTag });
    if (error) {
      if (error.status === 409) return false;
      apiFail("cadastrar o animal", error.status);
    }
    const animal = data as Animal;
    set((s) => ({ animals: [...s.animals, animal] }));
    return true;
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
      apiFail("importar o rebanho", error.status);
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
    // animals plus any new raças/lots/placements stay consistent, but never let a refresh
    // failure mask a successful import — return the server-reported summary
    // regardless; the store refreshes on the next successful load.
    try {
      const fresh = await repository.load();
      set({ ...fresh, loaded: true });
    } catch {
      // best-effort: keep the committed import's summary
    }
    return summary;
  },

  markTreatmentDone: async (id) => {
    await get().completeTreatments([id]);
  },

  completeTreatments: async (ids) => {
    const { data, error } = await api.treatments.complete.post({ ids });
    if (error) apiFail("concluir os tratamentos", error.status);
    const idSet = new Set(data.ids);
    set((s) => ({
      treatments: s.treatments.map((t) =>
        idSet.has(t.id) ? { ...t, status: "done" as const } : t
      ),
    }));
  },

  startManejoSession: async (input) => {
    const { data, error } = await api.manejo.post(input);
    if (error) apiFail("iniciar o manejo", error.status);
    const session = data as ManejoSession;
    set((s) => ({ manejoSessions: [...s.manejoSessions, session] }));
    return session.id;
  },

  completeManejoAnimal: async (sessionId, earTag, data = {}) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const response = await api.manejo({ id: sessionId }).animals({ animalId }).complete.post(data);
    if (response.error) {
      if (response.error.status === CONFLICT) return; // stale UI: pass already recorded
      apiFail("concluir o animal no manejo", response.error.status);
    }
    const result = response.data as {
      entry: ManejoSessionAnimal;
      treatments: Treatment[];
      weighing?: Weighing;
      animal?: PassAnimalPatch;
    };
    set((s) => {
      let animals = s.animals;
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
  },

  skipManejoAnimal: async (sessionId, earTag, notes) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).skip.post({ notes });
    if (error) {
      if (error.status === CONFLICT) return;
      apiFail("pular o animal no manejo", error.status);
    }
    const entry = data as ManejoSessionAnimal;
    set((s) => ({
      manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, entry),
    }));
  },

  reopenManejoAnimal: async (sessionId, earTag) => {
    const animalId = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.manejo({ id: sessionId }).animals({ animalId }).reopen.post();
    if (error) {
      if (error.status === CONFLICT) return;
      apiFail("desfazer o registro do animal", error.status);
    }
    const result = data as {
      entry: ManejoSessionAnimal;
      removedTreatmentIds: string[];
      removedWeighing?: Weighing;
      animal?: PassAnimalPatch;
      removedEarTag?: string;
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
    if (error) apiFail("definir o rendimento de carcaça", error.status);
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
    if (error) apiFail("encerrar o manejo", error.status);
    set((s) => ({
      manejoSessions: s.manejoSessions.map((m) =>
        m.id === sessionId ? { ...m, status: "closed" as const } : m
      ),
    }));
  },

  recordWeighing: async (earTag, w) => {
    const id = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.animals({ id }).weighings.post(w);
    if (error) apiFail("registrar a pesagem", error.status);
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
      apiFail("registrar o animal na entrada", error.status);
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

  addBreed: async (name) => {
    const { error } = await api.breeds.post({ name });
    if (error) apiFail("cadastrar a raça", error.status);
    set((s) => (s.breeds.includes(name) ? s : { breeds: [...s.breeds, name] }));
  },

  removeBreed: async (name) => {
    const { error } = await api.breeds({ name }).delete();
    if (error) {
      if (error.status === 409) return false;
      apiFail("remover a raça", error.status);
    }
    set((s) => ({ breeds: s.breeds.filter((b) => b !== name) }));
    return true;
  },

  addLot: async (l) => {
    const { data, error } = await api.lots.post(l);
    if (error) {
      if (error.status === CONFLICT) throw new Error("duplicate_lot_name");
      apiFail("criar o lote", error.status);
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
      apiFail("salvar o lote", error.status);
    }
    // The API returns the complete logical group after applying the patch.
    const lot = data as Lot;
    set((s) => ({ lots: s.lots.map((l) => (l.id === id ? lot : l)) }));
  },

  removeLot: async (id) => {
    const { error } = await api.lots({ id }).delete();
    if (error) {
      if (error.status === 409) return false;
      apiFail("remover o lote", error.status);
    }
    set((s) => ({
      lots: s.lots.filter((l) => l.id !== id),
      lotPlacements: s.lotPlacements.filter((placement) => placement.lotId !== id),
    }));
    return true;
  },

  moveLot: async (id, input) => {
    const { data, error } = await api.lots({ id }).placements.post(input);
    if (error) apiFail("mover o lote", error.status);
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
    if (error) apiFail("encerrar o lote", error.status);
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
    if (error) apiFail("cadastrar a invernada", error.status);
    const invernada = data as Invernada;
    set((s) => ({ invernadas: [...s.invernadas, invernada] }));
    return invernada;
  },

  updateInvernada: async (id, patch) => {
    const { data, error } = await api.invernadas({ id }).patch(patch);
    if (error) apiFail("salvar a invernada", error.status);
    const invernada = data as Invernada;
    set((s) => ({
      invernadas: s.invernadas.map((item) => (item.id === id ? invernada : item)),
    }));
  },

  removeInvernada: async (id) => {
    const { error } = await api.invernadas({ id }).delete();
    if (error) {
      if (error.status === 409) return false;
      apiFail("remover a invernada", error.status);
    }
    set((s) => ({ invernadas: s.invernadas.filter((item) => item.id !== id) }));
    return true;
  },

  saveFarm: async (d) => {
    const { data, error } = await api.farm.put(d);
    if (error) apiFail("salvar os dados da fazenda", error.status);
    set({ farm: { ...(data as FarmData) } });
  },

  addProtocol: async (p, generateSchedule) => {
    const { data, error } = await api.protocols.post({ protocol: p, generateSchedule });
    if (error) apiFail("criar o protocolo", error.status);
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
    if (error) apiFail("remover o protocolo", error.status);
    set((s) => ({ protocols: s.protocols.filter((p) => p.id !== id) }));
  },

  addExpense: async (e) => {
    const { data, error } = await api.expenses.post(e);
    if (error) apiFail("lançar a despesa", error.status);
    const expense = data as Expense;
    set((s) => ({ expenses: [...s.expenses, expense] }));
  },

  removeExpense: async (id) => {
    const { error } = await api.expenses({ id }).delete();
    if (error) apiFail("remover a despesa", error.status);
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
  },

  addCustomCategory: async (c) => {
    const { data, error } = await api.categories.post(c);
    if (error) {
      if (error.status === 409) return false;
      apiFail("criar a categoria", error.status);
    }
    const category = data as CustomCategory;
    set((s) => ({ customCategories: [...s.customCategories, category] }));
    return true;
  },

  removeCustomCategory: async (id) => {
    const { error } = await api.categories({ id }).delete();
    if (error) {
      if (error.status === 409) return false;
      apiFail("remover a categoria", error.status);
    }
    set((s) => ({ customCategories: s.customCategories.filter((c) => c.id !== id) }));
    return true;
  },

  recordBreeding: async (earTag, input) => {
    const id = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.animals({ id }).breedings.post(input);
    if (error) apiFail("registrar a cobertura", error.status);
    const breeding = data as Breeding;
    set((s) => ({
      animals: withReproduction(s.animals, earTag, (r) => ({
        ...r,
        breedings: [...r.breedings, breeding],
      })),
    }));
  },

  recordDiagnosis: async (earTag, input) => {
    const id = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api.animals({ id }).diagnoses.post(input);
    if (error) apiFail("registrar o diagnóstico", error.status);
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

  recordCalving: async (earTag, input) => {
    const calfEarTag = input.calfEarTag.trim();
    if (get().animals.some((a) => a.earTag === calfEarTag)) return false;
    const id = animalIdByEarTag(get().animals, earTag);
    const { data, error } = await api
      .animals({ id })
      .calvings.post({ ...input, calfEarTag });
    if (error) {
      if (error.status === 409) return false;
      apiFail("registrar o parto", error.status);
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
      apiFail("salvar o animal", error.status);
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

  deactivateAnimal: async (earTag, input) => {
    const notes = input.notes?.trim();
    const id = animalIdByEarTag(get().animals, earTag);
    const { error } = await api.animals({ id }).deactivate.post({
      reason: input.reason,
      date: input.date,
      notes: notes ? notes : undefined,
    });
    if (error) apiFail("dar baixa no animal", error.status);
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
