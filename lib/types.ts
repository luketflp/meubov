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

/** Herd animal. Weighings sorted asc by date; reproduction only for females. */
export interface Animal {
  earTag: string;
  category: Category;
  breed: string;
  sex: Sex;
  birthDate: string;
  lotId: string;
  active: boolean;
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
 * Manejo session: a curral working session that stays open while the animals
 * pass one by one through the chute. Effects (treatments, weighings) are
 * applied incrementally per animal, never as one atomic batch.
 */
export interface ManejoSession {
  id: string;
  name: string;
  date: string;
  status: "open" | "closed";
  /** Capture one weight per animal during the pass. */
  weighing: boolean;
  treatment?: ManejoTreatmentPlan;
  animals: ManejoSessionAnimal[];
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
   * order, first point not repeated). Absent while the pasto was never drawn.
   */
  boundary?: [number, number][];
}

/** Animal movement (purchase, sale or transfer). */
export interface Movement {
  id: string;
  type: MovementType;
  date: string;
  quantity: number;
  origin: string;
  destination: string;
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
  /** Farm HQ (sede) coordinates — map center before any pasto is drawn. */
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
  farm: FarmData;
}
