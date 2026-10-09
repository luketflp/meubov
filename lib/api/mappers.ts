/**
 * Row → domain converters for the herd API.
 *
 * The DB uses stable animal ids while ear tags remain editable identifiers.
 * Converters that touch animal children take the earTag resolved by the caller
 * (via join or map). Numeric columns already come back as numbers
 * (`numeric({ mode: "number" })` in the schema).
 */
import type {
  Account,
  Animal,
  Attachment,
  BankAccount,
  Breeding,
  Budget,
  Calving,
  CustomCategory,
  Expense,
  FarmData,
  Invernada,
  Lot,
  LotPlacement,
  ManejoSession,
  ManejoSessionAnimal,
  ManejoTreatmentPlan,
  Movement,
  PlanGroup,
  PregnancyDiagnosis,
  ReproductionRecord,
  SemenBull,
  SemenPurchase,
  StatementImport,
  StatementLine,
  Transfer,
  Treatment,
  Weighing,
} from "@/lib/types";
import type {
  AnimalRow,
  AttachmentRow,
  BankAccountRow,
  BreedingRow,
  BudgetRow,
  CalvingRow,
  CustomCategoryRow,
  ExpenseRow,
  ExpenseSeriesRow,
  FarmAccountRow,
  FarmRow,
  InvernadaRow,
  LotRow,
  LotPlacementRow,
  ManejoSessionAnimalRow,
  ManejoSessionRow,
  MovementRow,
  PlanGroupRow,
  PregnancyDiagnosisRow,
  SemenBullRow,
  SemenPurchaseRow,
  StatementImportRow,
  StatementLineRow,
  TransferRow,
  TreatmentRow,
  WeighingRow,
} from "@/lib/db/schema";
import { addDays } from "@/lib/domain/dates";

const orNothing = <T>(value: T | null): T | undefined =>
  value === null ? undefined : value;

export function toWeighing(row: WeighingRow): Weighing {
  return { id: row.id, date: row.date, weightKg: row.weightKg };
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
    batchId: orNothing(row.batchId),
  };
}

export function toBreeding(row: BreedingRow): Breeding {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    bullEarTag: row.bullEarTag,
    semenBullId: orNothing(row.semenBullId),
  };
}

export function toSemenPurchase(row: SemenPurchaseRow): SemenPurchase {
  return {
    id: row.id,
    date: row.date,
    doses: row.doses,
    totalBrl: row.totalBrl,
    seller: orNothing(row.seller),
  };
}

/** Purchases must already be sorted asc by date. */
export function toSemenBull(row: SemenBullRow, purchases: SemenPurchase[]): SemenBull {
  return {
    id: row.id,
    name: row.name,
    code: orNothing(row.code),
    breed: orNothing(row.breed),
    central: orNothing(row.central),
    purchases,
  };
}

export function toDiagnosis(row: PregnancyDiagnosisRow): PregnancyDiagnosis {
  return {
    breedingId: row.breedingId,
    result: row.result,
    date: row.date,
    ...(row.notes ? { notes: row.notes } : {}),
  };
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
    id: row.id,
    earTag: row.earTag,
    category: row.category,
    customCategoryId: orNothing(row.customCategoryId),
    breed: row.breed,
    sex: row.sex,
    birthDate: row.birthDate,
    lotId: row.lotId,
    active: row.active,
    inactiveReason: orNothing(row.inactiveReason),
    inactiveDate: orNothing(row.inactiveDate),
    inactiveNotes: orNothing(row.inactiveNotes),
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
    needsReview: row.needsReview || undefined,
    deletedAt: row.deletedAt?.toISOString(),
  };
}

export function toInvernada(row: InvernadaRow): Invernada {
  return {
    id: row.id,
    code: row.code,
    name: orNothing(row.name),
    grass: row.grass,
    hectares: row.hectares,
    boundary: orNothing(row.boundary),
    removedAt: row.removedAt ? row.removedAt.toISOString() : undefined,
  };
}

export function toLotPlacement(row: LotPlacementRow): LotPlacement {
  return {
    id: row.id,
    lotId: row.lotId,
    invernadaId: row.invernadaId,
    startedOn: row.startedOn,
    endedOn: orNothing(row.endedOn),
    notes: orNothing(row.notes),
    baseline: row.baseline || undefined,
  };
}

export function toMovement(row: MovementRow): Movement {
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    quantity: orNothing(row.quantity),
    category: orNothing(row.category),
    origin: row.origin,
    destination: row.destination,
    amountBrl: orNothing(row.amountBrl),
    notes: orNothing(row.notes),
    bankAccountId: orNothing(row.bankAccountId),
  };
}

/**
 * `series` is the row's série when it has one: a parcela gets the parcela
 * count ("2/3"), an ocorrência the frequency and day ("todo dia 20").
 */
export function toExpense(
  row: ExpenseRow,
  series?: ExpenseSeriesRow,
  attachmentCount = 0
): Expense {
  const recurring = series?.mode === "recurring";
  return {
    id: row.id,
    kind: row.kind,
    flow: orNothing(row.flow),
    date: row.date,
    category: orNothing(row.category),
    amountBrl: row.amountBrl,
    notes: orNothing(row.notes),
    dueDate: orNothing(row.dueDate),
    paidAt: orNothing(row.paidAt),
    history: orNothing(row.history),
    counterparty: orNothing(row.counterparty),
    document: orNothing(row.document),
    accountId: orNothing(row.accountId),
    lotId: orNothing(row.lotId),
    bankAccountId: orNothing(row.bankAccountId),
    seriesId: orNothing(row.seriesId),
    seriesIndex: orNothing(row.seriesIndex),
    seriesCount: series?.mode === "installments" ? orNothing(series.count) : undefined,
    seriesFrequency: recurring ? series.frequency : undefined,
    seriesDay: recurring && series.frequency === "monthly" ? orNothing(series.dayOfMonth) : undefined,
    attachmentCount,
  };
}

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    expenseId: row.expenseId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAccount(row: FarmAccountRow): Account {
  return {
    id: row.id,
    group: row.group,
    name: row.name,
    archivedAt: row.archivedAt?.toISOString(),
    openingBalanceBrl: orNothing(row.openingBalanceBrl),
    openingDate: orNothing(row.openingDate),
  };
}

export function toPlanGroup(row: PlanGroupRow): PlanGroup {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    archivedAt: row.archivedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Linhas do extrato of the conta, as the load counts them. */
export interface BankAccountLines {
  pending: number;
  firstDate: string | null;
  firstPendingDate: string | null;
  lastDate: string | null;
  pendingImportId: string | null;
  lastImportId: string | null;
}

/**
 * "Conciliado até": with nothing pending, the last linha; otherwise the day
 * before the oldest pending one (nothing when that is the very first linha).
 */
function reconciledUntil(lines: BankAccountLines | undefined): string | undefined {
  if (!lines || lines.lastDate === null) return undefined;
  if (lines.firstPendingDate === null) return lines.lastDate;
  if (lines.firstDate === null || lines.firstPendingDate <= lines.firstDate) return undefined;
  return addDays(lines.firstPendingDate, -1);
}

export function toBankAccount(row: BankAccountRow, lines?: BankAccountLines): BankAccount {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    label: orNothing(row.label),
    openingBalanceBrl: row.openingBalanceBrl,
    openingDate: row.openingDate,
    isMain: row.isMain,
    closingDay: orNothing(row.closingDay),
    dueDay: orNothing(row.dueDay),
    paysFromId: orNothing(row.paysFromId),
    csvMapping: orNothing(row.csvMapping),
    archivedAt: row.archivedAt?.toISOString(),
    pendingLines: lines?.pending ?? 0,
    reconciledUntil: reconciledUntil(lines),
    pendingImportId: orNothing(lines?.pendingImportId ?? null),
    lastImportId: orNothing(lines?.lastImportId ?? null),
  };
}

export function toTransfer(row: TransferRow): Transfer {
  return {
    id: row.id,
    fromId: row.fromId,
    toId: row.toId,
    date: row.date,
    amountBrl: row.amountBrl,
    notes: orNothing(row.notes),
  };
}

export function toStatementImport(row: StatementImportRow): StatementImport {
  return {
    id: row.id,
    bankAccountId: row.bankAccountId,
    fileName: row.fileName,
    format: row.format,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    bankBalanceBrl: orNothing(row.bankBalanceBrl),
    bankBalanceDate: orNothing(row.bankBalanceDate),
    lineCount: row.lineCount,
    skippedCount: row.skippedCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toStatementLine(row: StatementLineRow): StatementLine {
  return {
    id: row.id,
    importId: row.importId,
    bankAccountId: row.bankAccountId,
    date: row.date,
    description: row.description,
    amountBrl: row.amountBrl,
    status: row.status,
    expenseId: orNothing(row.expenseId),
    movementId: orNothing(row.movementId),
    transferId: orNothing(row.transferId),
    ignoreReason: orNothing(row.ignoreReason),
  };
}

export function toBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    category: row.category,
    accountId: orNothing(row.accountId),
    month: row.month,
    amountBrl: row.amountBrl,
    distribution: row.distribution,
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
        ? {
            lat: row.headquartersLat,
            lng: row.headquartersLng,
            ...(row.headquartersZoom === null
              ? {}
              : { zoom: row.headquartersZoom }),
          }
        : undefined,
    safraStartMonth: row.safraStartMonth,
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
    weighingId: orNothing(row.weighingId),
    amountBrl: orNothing(row.amountBrl),
    carcassYieldPct: orNothing(row.carcassYieldPct),
    previousLotId: orNothing(row.previousLotId),
    createdAnimal: row.createdAnimal,
    breedingId: orNothing(row.breedingId),
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
    kind: row.kind,
    weighing: row.weighing,
    treatment: toManejoPlan(row),
    animals,
    destinationLotId: orNothing(row.destinationLotId),
    counterparty: orNothing(row.counterparty),
    pricePerArroba: orNothing(row.pricePerArroba),
    carcassYieldPct: orNothing(row.carcassYieldPct),
    totalAmountBrl: orNothing(row.totalAmountBrl),
    semenBullIds: orNothing(row.semenBullIds),
    notes: orNothing(row.notes),
    bankAccountId: orNothing(row.bankAccountId),
  };
}
