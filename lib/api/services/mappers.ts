/**
 * Row → domain converters for the herd API.
 *
 * The DB uses surrogate animal ids; the domain (and every client) speaks ear
 * tags. Converters that touch animal children take the earTag resolved by the
 * caller (via join or map). Numeric columns already come back as numbers
 * (`numeric({ mode: "number" })` in the schema).
 */
import type {
  Animal,
  Breeding,
  Calving,
  CustomCategory,
  Expense,
  FarmData,
  HealthProtocol,
  Lot,
  ManejoSession,
  ManejoSessionAnimal,
  ManejoTreatmentPlan,
  Movement,
  PregnancyDiagnosis,
  ReproductionRecord,
  Treatment,
  Weighing,
} from "@/lib/types";
import type {
  AnimalRow,
  BreedingRow,
  CalvingRow,
  CustomCategoryRow,
  ExpenseRow,
  FarmRow,
  HealthProtocolRow,
  LotRow,
  ManejoSessionAnimalRow,
  ManejoSessionRow,
  MovementRow,
  PregnancyDiagnosisRow,
  TreatmentRow,
  WeighingRow,
} from "@/lib/db/schema";

const orNothing = <T>(value: T | null): T | undefined =>
  value === null ? undefined : value;

export function toWeighing(row: WeighingRow): Weighing {
  return { date: row.date, weightKg: row.weightKg };
}

export function toTreatment(row: TreatmentRow, earTag: string): Treatment {
  return {
    id: row.id,
    animalEarTag: earTag,
    type: row.type,
    name: row.name,
    date: row.date,
    status: row.status,
    withdrawalDays: row.withdrawalDays,
    dose: orNothing(row.dose),
    responsible: orNothing(row.responsible),
    costBrl: orNothing(row.costBrl),
    notes: orNothing(row.notes),
  };
}

export function toBreeding(row: BreedingRow): Breeding {
  return { id: row.id, date: row.date, type: row.type, bullEarTag: row.bullEarTag };
}

export function toDiagnosis(row: PregnancyDiagnosisRow): PregnancyDiagnosis {
  return { breedingId: row.breedingId, result: row.result, date: row.date };
}

export function toCalving(row: CalvingRow): Calving {
  return { date: row.date, calfEarTag: row.calfEarTag };
}

/**
 * Assembles a domain Animal. Weighings must already be sorted asc by date.
 * Reproduction is attached only when the female has at least one record,
 * mirroring the seed's shape (males and event-less females stay undefined).
 */
export function toAnimal(
  row: AnimalRow,
  weighings: Weighing[],
  reproduction: ReproductionRecord | undefined
): Animal {
  const hasReproduction =
    reproduction !== undefined &&
    (reproduction.breedings.length > 0 ||
      reproduction.diagnoses.length > 0 ||
      reproduction.calvings.length > 0);
  return {
    earTag: row.earTag,
    category: row.category,
    customCategoryId: orNothing(row.customCategoryId),
    breed: row.breed,
    sex: row.sex,
    birthDate: row.birthDate,
    lotId: row.lotId,
    active: row.active,
    inactiveReason: orNothing(row.inactiveReason),
    weighings,
    reproduction: hasReproduction ? reproduction : undefined,
  };
}

export function toCustomCategory(row: CustomCategoryRow): CustomCategory {
  return { id: row.id, name: row.name, baseCategory: row.baseCategory };
}

export function toLot(row: LotRow): Lot {
  return {
    id: row.id,
    name: row.name,
    grass: row.grass,
    hectares: row.hectares,
    boundary: orNothing(row.boundary),
  };
}

export function toMovement(row: MovementRow): Movement {
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    quantity: row.quantity,
    category: row.category,
    origin: row.origin,
    destination: row.destination,
    amountBrl: orNothing(row.amountBrl),
    notes: orNothing(row.notes),
  };
}

export function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    amountBrl: row.amountBrl,
    notes: orNothing(row.notes),
  };
}

export function toProtocol(row: HealthProtocolRow): HealthProtocol {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    intervalMonths: row.intervalMonths,
    withdrawalDays: row.withdrawalDays,
    mandatory: row.mandatory,
  };
}

export function toFarmData(row: FarmRow): FarmData {
  return {
    name: row.name,
    municipality: row.municipality,
    stateRegistration: row.stateRegistration,
    manager: row.manager,
    headquarters:
      row.headquartersLat !== null && row.headquartersLng !== null
        ? { lat: row.headquartersLat, lng: row.headquartersLng }
        : undefined,
  };
}

/** Folds the flattened `plan*` columns back into a ManejoTreatmentPlan. */
export function toManejoPlan(row: ManejoSessionRow): ManejoTreatmentPlan | undefined {
  if (row.planType === null || row.planName === null || row.planWithdrawalDays === null) {
    return undefined;
  }
  return {
    type: row.planType,
    name: row.planName,
    withdrawalDays: row.planWithdrawalDays,
    dose: orNothing(row.planDose),
    responsible: orNothing(row.planResponsible),
    costBrl: orNothing(row.planCostBrl),
    notes: orNothing(row.planNotes),
    nextDate: orNothing(row.planNextDate),
  };
}

export function toManejoSessionAnimal(
  row: ManejoSessionAnimalRow,
  earTag: string
): ManejoSessionAnimal {
  return {
    earTag,
    outcome: row.outcome,
    weightKg: orNothing(row.weightKg),
    notes: orNothing(row.notes),
    treatmentId: orNothing(row.treatmentId),
    boosterId: orNothing(row.boosterId),
  };
}

/** Entries must keep the insertion order of the session's chute line. */
export function toManejoSession(
  row: ManejoSessionRow,
  animals: ManejoSessionAnimal[]
): ManejoSession {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    status: row.status,
    weighing: row.weighing,
    treatment: toManejoPlan(row),
    animals,
    notes: orNothing(row.notes),
  };
}
