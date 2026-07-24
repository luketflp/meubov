/**
 * Zustand herd store: extends HerdData with the hydration flag and the write
 * actions. All updates are immutable and the new ids are deterministic
 * (prefix + counter derived from the current collection size).
 */
import { create } from "zustand";
import type {
  Animal,
  FarmData,
  HerdData,
  Lot,
  ManejoSession,
  ManejoSessionAnimal,
  ManejoTreatmentPlan,
  Movement,
  Weighing,
  HealthProtocol,
  Treatment,
} from "@/lib/types";
import { TODAY_ISO, addDays } from "@/lib/domain/dates";
import { type HerdRepository, MockHerdRepository } from "@/lib/repository/HerdRepository";

/** Movement to record; optional earTags apply sale/transfer to the animals. */
export type NewMovement = Omit<Movement, "id"> & { earTags?: string[] };

/** Animal to register; the optional initial weight becomes the first weighing. */
export type NewAnimal = Omit<Animal, "active" | "weighings" | "reproduction"> & {
  initialWeightKg?: number;
};

/**
 * New manejo session (curral working session). Opens with every selected
 * animal pending; effects (treatments, weighings) are applied one animal at a
 * time via completeManejoAnimal — a manejo takes hours, not one click.
 */
export interface NewManejoSession {
  date: string;
  earTags: string[];
  /** Capture one weight per animal as it passes the chute. */
  weighing: boolean;
  treatment?: ManejoTreatmentPlan;
  notes?: string;
}

/** Data captured for one animal at the chute. */
export interface ManejoPassData {
  weightKg?: number;
  notes?: string;
}

export interface HerdStore extends HerdData {
  loaded: boolean;
  load: () => Promise<void>;
  addAnimal: (a: NewAnimal) => boolean;
  markTreatmentDone: (id: string) => void;
  completeTreatments: (ids: string[]) => void;
  /** Opens a manejo session and returns its id (for the run screen). */
  startManejoSession: (input: NewManejoSession) => string;
  /** Applies the session's effects to one animal and marks it done. */
  completeManejoAnimal: (sessionId: string, earTag: string, data?: ManejoPassData) => void;
  /** Marks one animal as skipped (did not pass the chute). */
  skipManejoAnimal: (sessionId: string, earTag: string, notes?: string) => void;
  /** Undo: reverts one animal to pending, removing the effects it created. */
  reopenManejoAnimal: (sessionId: string, earTag: string) => void;
  /** Closes the session (remaining animals stay recorded as they are). */
  closeManejoSession: (sessionId: string) => void;
  recordWeighing: (earTag: string, w: Weighing) => void;
  recordMovement: (m: NewMovement) => void;
  addBreed: (name: string) => void;
  removeBreed: (name: string) => boolean;
  addLot: (l: Omit<Lot, "id">) => void;
  removeLot: (id: string) => boolean;
  saveFarm: (d: FarmData) => void;
  addProtocol: (p: Omit<HealthProtocol, "id">, generateSchedule: boolean) => void;
  removeProtocol: (id: string) => void;
}

/** Days between today and the scheduled date when generating the schedule of a new protocol. */
const DAYS_UNTIL_SCHEDULE = 14;

/** Default repository; swap the implementation here to use a real backend. */
const repository: HerdRepository = new MockHerdRepository();

const compareByDate = (a: Weighing, b: Weighing): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

/** Next free "treatment-N" id: max numeric suffix + 1 (robust to undo removals). */
function nextTreatmentId(treatments: Treatment[]): string {
  let max = 0;
  for (const t of treatments) {
    const n = Number(t.id.replace("treatment-", ""));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `treatment-${max + 1}`;
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
  movements: [],
  breeds: [],
  protocols: [],
  manejoSessions: [],
  farm: { name: "", municipality: "", stateRegistration: "", manager: "" },
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const data = await repository.load();
    set({ ...data, loaded: true });
  },

  addAnimal: (a) => {
    const { animals } = get();
    const earTag = a.earTag.trim();
    if (animals.some((animal) => animal.earTag === earTag)) return false;
    const { initialWeightKg, ...data } = a;
    const animal: Animal = {
      ...data,
      earTag,
      active: true,
      weighings:
        initialWeightKg === undefined ? [] : [{ date: TODAY_ISO, weightKg: initialWeightKg }],
    };
    set((s) => ({ animals: [...s.animals, animal] }));
    return true;
  },

  markTreatmentDone: (id) => {
    set((s) => ({
      treatments: s.treatments.map((t) =>
        t.id === id ? { ...t, status: "done" as const } : t
      ),
    }));
  },

  completeTreatments: (ids) => {
    const idSet = new Set(ids);
    set((s) => ({
      treatments: s.treatments.map((t) =>
        idSet.has(t.id) ? { ...t, status: "done" as const } : t
      ),
    }));
  },

  startManejoSession: (input) => {
    const id = `manejo-${get().manejoSessions.length + 1}`;
    const session: ManejoSession = {
      id,
      name: input.treatment ? input.treatment.name : "Pesagem",
      date: input.date,
      status: "open",
      weighing: input.weighing,
      treatment: input.treatment,
      animals: input.earTags.map(
        (earTag): ManejoSessionAnimal => ({ earTag, outcome: "pending" })
      ),
      notes: input.notes,
    };
    set((s) => ({ manejoSessions: [...s.manejoSessions, session] }));
    return id;
  },

  completeManejoAnimal: (sessionId, earTag, data = {}) => {
    set((s) => {
      const session = s.manejoSessions.find((m) => m.id === sessionId);
      if (!session || session.status !== "open") return s;
      const entry = session.animals.find((a) => a.earTag === earTag);
      if (!entry || entry.outcome !== "pending") return s;

      let treatments = s.treatments;
      let treatmentId: string | undefined;
      let boosterId: string | undefined;
      if (session.treatment) {
        const { nextDate, ...plan } = session.treatment;
        treatmentId = nextTreatmentId(treatments);
        treatments = [
          ...treatments,
          { id: treatmentId, animalEarTag: earTag, ...plan, date: session.date, status: "done" },
        ];
        if (nextDate) {
          boosterId = nextTreatmentId(treatments);
          treatments = [
            ...treatments,
            {
              id: boosterId,
              animalEarTag: earTag,
              type: plan.type,
              name: plan.name,
              date: nextDate,
              status: "scheduled",
              withdrawalDays: plan.withdrawalDays,
            },
          ];
        }
      }

      let animals = s.animals;
      const weightKg = session.weighing ? data.weightKg : undefined;
      if (weightKg !== undefined) {
        const weighing: Weighing = { date: session.date, weightKg };
        animals = animals.map((a) =>
          a.earTag === earTag
            ? { ...a, weighings: [...a.weighings, weighing].sort(compareByDate) }
            : a
        );
      }

      const notes = data.notes?.trim();
      const updated: ManejoSessionAnimal = {
        earTag,
        outcome: "done",
        weightKg,
        notes: notes ? notes : undefined,
        treatmentId,
        boosterId,
      };
      return {
        treatments,
        animals,
        manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, updated),
      };
    });
  },

  skipManejoAnimal: (sessionId, earTag, notes) => {
    set((s) => {
      const session = s.manejoSessions.find((m) => m.id === sessionId);
      if (!session || session.status !== "open") return s;
      const entry = session.animals.find((a) => a.earTag === earTag);
      if (!entry || entry.outcome !== "pending") return s;
      const trimmed = notes?.trim();
      const updated: ManejoSessionAnimal = {
        earTag,
        outcome: "skipped",
        notes: trimmed ? trimmed : undefined,
      };
      return { manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, updated) };
    });
  },

  reopenManejoAnimal: (sessionId, earTag) => {
    set((s) => {
      const session = s.manejoSessions.find((m) => m.id === sessionId);
      if (!session || session.status !== "open") return s;
      const entry = session.animals.find((a) => a.earTag === earTag);
      if (!entry || entry.outcome === "pending") return s;

      const removedIds = new Set(
        [entry.treatmentId, entry.boosterId].filter((id): id is string => id !== undefined)
      );
      const treatments =
        removedIds.size > 0 ? s.treatments.filter((t) => !removedIds.has(t.id)) : s.treatments;

      let animals = s.animals;
      if (entry.weightKg !== undefined) {
        animals = animals.map((a) => {
          if (a.earTag !== earTag) return a;
          // Remove the single weighing this pass appended (last date+value match).
          let index = -1;
          for (let i = a.weighings.length - 1; i >= 0; i--) {
            if (a.weighings[i].date === session.date && a.weighings[i].weightKg === entry.weightKg) {
              index = i;
              break;
            }
          }
          if (index === -1) return a;
          return { ...a, weighings: a.weighings.filter((_, i) => i !== index) };
        });
      }

      const reset: ManejoSessionAnimal = { earTag, outcome: "pending" };
      return {
        treatments,
        animals,
        manejoSessions: withSessionAnimal(s.manejoSessions, sessionId, earTag, reset),
      };
    });
  },

  closeManejoSession: (sessionId) => {
    set((s) => ({
      manejoSessions: s.manejoSessions.map((m) =>
        m.id === sessionId ? { ...m, status: "closed" as const } : m
      ),
    }));
  },

  recordWeighing: (earTag, w) => {
    set((s) => ({
      animals: s.animals.map((a) =>
        a.earTag === earTag
          ? { ...a, weighings: [...a.weighings, w].sort(compareByDate) }
          : a
      ),
    }));
  },

  recordMovement: (m) => {
    set((s) => {
      const { earTags, ...data } = m;
      const newMovement: Movement = { ...data, id: `mov-${s.movements.length + 1}` };
      let animals = s.animals;
      if (earTags && earTags.length > 0) {
        if (newMovement.type === "sale") {
          animals = s.animals.map((a) =>
            earTags.includes(a.earTag) ? { ...a, active: false } : a
          );
        } else if (newMovement.type === "transfer") {
          const destinationLot = s.lots.find((l) => l.name === newMovement.destination);
          if (destinationLot) {
            animals = s.animals.map((a) =>
              earTags.includes(a.earTag) ? { ...a, lotId: destinationLot.id } : a
            );
          }
        }
      }
      return { animals, movements: [...s.movements, newMovement] };
    });
  },

  addBreed: (name) => {
    set((s) => (s.breeds.includes(name) ? s : { breeds: [...s.breeds, name] }));
  },

  removeBreed: (name) => {
    const { animals, breeds } = get();
    if (animals.some((a) => a.active && a.breed === name)) return false;
    set({ breeds: breeds.filter((b) => b !== name) });
    return true;
  },

  addLot: (l) => {
    set((s) => ({ lots: [...s.lots, { ...l, id: `lot-${s.lots.length + 1}` }] }));
  },

  removeLot: (id) => {
    const { animals, lots } = get();
    if (animals.some((a) => a.active && a.lotId === id)) return false;
    set({ lots: lots.filter((l) => l.id !== id) });
    return true;
  },

  saveFarm: (d) => {
    set({ farm: { ...d } });
  },

  addProtocol: (p, generateSchedule) => {
    set((s) => {
      const protocol: HealthProtocol = { ...p, id: `protocol-${s.protocols.length + 1}` };
      const scheduled: Treatment[] = generateSchedule
        ? s.animals
            .filter((a) => a.active)
            .map((a, i) => ({
              id: `treatment-${s.treatments.length + i + 1}`,
              animalEarTag: a.earTag,
              type: protocol.type,
              name: protocol.name,
              date: addDays(TODAY_ISO, DAYS_UNTIL_SCHEDULE),
              status: "scheduled" as const,
              withdrawalDays: protocol.withdrawalDays,
            }))
        : [];
      return {
        protocols: [...s.protocols, protocol],
        treatments: [...s.treatments, ...scheduled],
      };
    });
  },

  removeProtocol: (id) => {
    set((s) => ({ protocols: s.protocols.filter((p) => p.id !== id) }));
  },
}));
