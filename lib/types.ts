/**
 * MeuBov domain contracts.
 * Dates always travel as ISO strings "YYYY-MM-DD".
 */

/** Animal category in the beef herd. */
export type Category = "calf" | "heifer" | "steer" | "cow" | "bull";

/** Animal sex. */
export type Sex = "male" | "female";

/** Animal status derived from treatments and reproduction. */
export type AnimalStatus = "healthy" | "attention" | "overdue";

/** Status derived from a health treatment. */
export type TreatmentStatus = "scheduled" | "overdue" | "done";

/** Health treatment type. */
export type TreatmentType = "vaccine" | "deworming" | "medication" | "exam";

/** Breeding type. */
export type BreedingType = "timedAI" | "naturalMating";

/** Pregnancy diagnosis result. */
export type DiagnosisResult = "pregnant" | "open" | "pending";

/** Animal movement type. */
export type MovementType = "purchase" | "sale" | "transfer";

/** Stocking rate class of the lot (AU/ha). */
export type StockingRateClass = "high" | "good" | "light";

/** Weighing record of an animal. */
export interface Weighing {
  date: string;
  weightKg: number;
}

/** Breeding (timed AI or natural mating) of a female. */
export interface Breeding {
  id: string;
  date: string;
  type: BreedingType;
  bullEarTag: string;
}

/** Pregnancy diagnosis linked to a breeding. */
export interface PregnancyDiagnosis {
  breedingId: string;
  result: DiagnosisResult;
  date: string;
}

/** Calving record of a female. */
export interface Calving {
  date: string;
  calfEarTag: string;
}

/** Reproductive history of a female. */
export interface ReproductionRecord {
  breedings: Breeding[];
  diagnoses: PregnancyDiagnosis[];
  calvings: Calving[];
}

/** Why an animal left the active herd. */
export type InactiveReason = "sale" | "death" | "loss" | "other";

/**
 * User-defined herd category mapped to a canonical base category. Domain
 * rules always run on the base; the custom name is presentation.
 */
export interface CustomCategory {
  id: string;
  name: string;
  baseCategory: Category;
}

/** Herd animal. Weighings sorted asc by date; reproduction only for females. */
export interface Animal {
  earTag: string;
  /** Canonical category — the custom category's base when one is set. */
  category: Category;
  /** Optional user-defined category (see CustomCategory). */
  customCategoryId?: string;
  breed: string;
  sex: Sex;
  birthDate: string;
  lotId: string;
  active: boolean;
  /** Why the animal left the herd; absent while active. */
  inactiveReason?: InactiveReason;
  /** The day it left (morte, perda, venda); absent while active. */
  inactiveDate?: string;
  /** What happened, in the farmer's words: "encontrada morta no pasto". */
  inactiveNotes?: string;
  weighings: Weighing[];
  reproduction?: ReproductionRecord;
}

/** Health treatment applied or scheduled for an animal. */
export interface Treatment {
  id: string;
  animalEarTag: string;
  type: TreatmentType;
  name: string;
  date: string;
  status: TreatmentStatus;
  withdrawalDays: number;
  /** Applied dose, e.g.: "5 ml" (filled by the batch manejo). */
  dose?: string;
  /** Person who applied/supervised (veterinarian or handler). */
  responsible?: string;
  /** Cost of the application per animal, in BRL. */
  costBrl?: number;
  notes?: string;
}

/** Outcome of one animal inside a manejo session. */
export type ManejoOutcome = "pending" | "done" | "skipped";

/** Per-animal state of a manejo session (the chute line). */
export interface ManejoSessionAnimal {
  earTag: string;
  outcome: ManejoOutcome;
  /** Weight captured in this pass (kg), when the session weighs. */
  weightKg?: number;
  /** Note for this animal (e.g.: reação, brinco danificado). */
  notes?: string;
  /** Id of the done Treatment this pass created (for undo). */
  treatmentId?: string;
  /** Id of the scheduled booster this pass created (for undo). */
  boosterId?: string;
  /** What this animal was worth in a priced sale (R$/@ × its chute weight). */
  amountBrl?: number;
  /** Lot the animal came from, so undoing a transfer pass can restore it. */
  previousLotId?: string;
  /** True when an entry session registered this animal — undo deletes it. */
  createdAnimal?: boolean;
}

/** Sanitary action a manejo session applies to each animal that passes. */
export interface ManejoTreatmentPlan {
  type: TreatmentType;
  name: string;
  withdrawalDays: number;
  dose?: string;
  responsible?: string;
  costBrl?: number;
  notes?: string;
  /** When set, each completed animal also gets a booster scheduled on this date. */
  nextDate?: string;
}

/**
 * What a manejo session does to each animal at the chute. `health` and
 * `weighing` only record history; `transfer`, `sale` and `entry` also move the
 * herd — they are the compras, vendas e transferências of the farm.
 */
export type ManejoKind = "health" | "weighing" | "transfer" | "sale" | "entry";

/**
 * Manejo session: a curral working session that stays open while the animals
 * pass one by one through the chute. Effects (treatments, weighings, lot
 * changes, sales) are applied incrementally per animal, never as one atomic
 * batch.
 */
export interface ManejoSession {
  id: string;
  name: string;
  date: string;
  status: "open" | "closed";
  kind: ManejoKind;
  /** Capture one weight per animal during the pass. */
  weighing: boolean;
  treatment?: ManejoTreatmentPlan;
  animals: ManejoSessionAnimal[];
  /** Lot every animal lands in — transfer and entry sessions. */
  destinationLotId?: string;
  /** Buyer (sale) or seller (entry): they live outside the farm, so free text. */
  counterparty?: string;
  /** Sale priced per arroba: R$/@ applied to each animal's chute weight. */
  pricePerArroba?: number;
  /** Closed price in BRL: a sale sold as one lot, or an entry's purchase total. */
  totalAmountBrl?: number;
  notes?: string;
}

/** Lot (paddock) of the farm. */
export interface Lot {
  id: string;
  name: string;
  grass: string;
  hectares: number;
  /**
   * Pasture outline on the map: open ring of [lng, lat] pairs (GeoJSON axis
   * order, first point not repeated). Absent while the lot was never drawn.
   */
  boundary?: [number, number][];
}

/**
 * Animal movement (purchase, sale or transfer) — the farm's entry/exit ledger.
 *
 * Movements are no longer typed by hand: they are DERIVED from the manejo
 * sessions of kind transfer/sale/entry (lib/domain/movements.ts), so head count
 * and category always come from real animals. Rows recorded by the old
 * "Registrar movimentação" screen survive as legacy history and are the only
 * ones that may lack `quantity`/`category` linkage.
 */
export interface Movement {
  id: string;
  type: MovementType;
  date: string;
  /** Head count; absent on a legacy row that never carried one. */
  quantity?: number;
  /** Predominant category of the animals moved; absent on legacy rows. */
  category?: Category;
  origin: string;
  destination: string;
  /**
   * Total value in BRL. Present for purchase/sale (required on new records);
   * absent for transfers and legacy rows (excluded from aggregations).
   */
  amountBrl?: number;
  notes?: string;
}

/** Category of a farm expense. */
export type ExpenseCategory =
  | "nutrition"
  | "pasture"
  | "labor"
  | "health"
  | "breeding"
  | "admin"
  | "other";

/** Farm expense (cost outside the sanitary treatments). */
export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amountBrl: number;
  notes?: string;
}

/** Recurring health protocol of the farm. */
export interface HealthProtocol {
  id: string;
  name: string;
  type: TreatmentType;
  intervalMonths: number;
  withdrawalDays: number;
  mandatory: boolean;
}

/** Farm registration data. */
export interface FarmData {
  name: string;
  municipality: string;
  stateRegistration: string;
  manager: string;
  /** Farm HQ (sede) coordinates — map center before any lot is drawn. */
  headquarters?: { lat: number; lng: number };
}

/** Root of the herd data. */
export interface HerdData {
  animals: Animal[];
  treatments: Treatment[];
  lots: Lot[];
  movements: Movement[];
  breeds: string[];
  protocols: HealthProtocol[];
  manejoSessions: ManejoSession[];
  expenses: Expense[];
  customCategories: CustomCategory[];
  farm: FarmData;
}
