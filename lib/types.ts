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

/** Stocking rate class of a physical invernada (AU/ha). */
export type StockingRateClass = "high" | "good" | "light";

/** Weighing record of an animal. */
export interface Weighing {
  /**
   * Database id; tells a weighing a manejo pass wrote (its `weighingId`) from one
   * saved elsewhere. Optional so a weighing can be described before it is stored.
   */
  id?: number;
  date: string;
  weightKg: number;
  /**
   * Operation of the fila that created this weighing on the phone (its id is
   * then negative). Client-only: never leaves the phone.
   */
  localOpId?: string;
}

/** Breeding (timed AI or natural mating) of a female. */
export interface Breeding {
  id: string;
  date: string;
  type: BreedingType;
  bullEarTag: string;
  /** Registered semen bull whose dose this cobertura used; absent for any other bull. */
  semenBullId?: string;
  /**
   * Operation of the fila that created this cobertura on the phone (its id is
   * then `local:<uuid>`). Client-only: never leaves the phone.
   */
  localOpId?: string;
}

/** One purchase of semen doses of a bull; it also became a farm expense. */
export interface SemenPurchase {
  id: string;
  date: string;
  doses: number;
  /** Absent when the server stripped it for a member without Financeiro. */
  totalBrl?: number;
  seller?: string;
  /** Expense this purchase wrote in Financeiro; absent once that expense is gone. */
  expenseId?: string;
}

/**
 * Bull the farm buys semen from. Its stock is never stored: it derives from the
 * doses bought and the coberturas that used one (lib/domain/semen.ts).
 */
export interface SemenBull {
  id: string;
  name: string;
  /** Registro or central code, e.g.: "NEL-4471". */
  code?: string;
  breed?: string;
  /** Central de sêmen the doses come from. */
  central?: string;
  /** Sorted asc by date. */
  purchases: SemenPurchase[];
}

/** Pregnancy diagnosis linked to a breeding. */
export interface PregnancyDiagnosis {
  breedingId: string;
  result: DiagnosisResult;
  date: string;
  /** The vet's observação at the exam ("gestação de ~60 dias", "cisto no ovário"). */
  notes?: string;
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
  /** Stable internal identifier. Ear tags can be corrected or replaced. */
  id: string;
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
  /** Groups the treatments one scheduling action created for several animals. */
  batchId?: string;
  /**
   * Operation of the fila that created this treatment on the phone (its id is
   * then `local:<uuid>`). Client-only: never leaves the phone.
   */
  localOpId?: string;
}

/** Template or one-off details used to create scheduled calendar treatments. */
export type TreatmentScheduleSource =
  | { kind: "protocol"; protocolId: string }
  | {
      kind: "standalone";
      name: string;
      type: TreatmentType;
      withdrawalDays: number;
    };

/** One calendar action can schedule the same treatment for several animals. */
export interface ScheduleTreatmentsInput {
  date: string;
  animalIds: string[];
  source: TreatmentScheduleSource;
}

/**
 * `rejected` (refugo) and `held` (dúvida) exist only on a venda: the animal
 * passed the scale but was not sold — refugo stays in the herd, dúvida waits
 * to be decided before the venda closes.
 */
export type ManejoOutcome = "pending" | "done" | "skipped" | "rejected" | "held";

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
  /** Id of the weighing this pass wrote (for undo and for a session delete). */
  weighingId?: number;
  /** What this animal was worth in a priced sale (R$/@ × its chute weight). */
  amountBrl?: number;
  /**
   * Rendimento (%) this boiada pass was priced at, when the brete changed it
   * from the venda's padrão. Absent: the pass follows the padrão.
   */
  carcassYieldPct?: number;
  /** Lot the animal came from, so undoing a transfer pass can restore it. */
  previousLotId?: string;
  /** True when an entry session registered this animal — undo deletes it. */
  createdAnimal?: boolean;
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
 * `insemination` records an IATF cobertura per cow, each taking one dose of semen.
 */
export type ManejoKind = "health" | "weighing" | "transfer" | "sale" | "entry" | "insemination";

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
  /**
   * Rendimento de carcaça (%) of a venda per arroba: the R$/@ pays the carcass
   * arrobas (peso vivo × rendimento ÷ 15), not the live kg/30. Chosen on the
   * modal before the chute opens; absent on old sessions (50% assumed).
   */
  carcassYieldPct?: number;
  /** Closed price in BRL: a sale sold as one lot, or an entry's purchase total. */
  totalAmountBrl?: number;
  /**
   * Touros of an inseminação, in the order picked: the brete offers these and
   * no other, with the first one already marked for every cow.
   */
  semenBullIds?: string[];
  notes?: string;
  /**
   * Set by the server when it stripped the session's values for a member
   * without Financeiro, so "no price" and "a price you may not see" differ.
   */
  valuesHidden?: boolean;
  /** Venda or compra: the conta bancária its money went through. */
  bankAccountId?: string;
  /**
   * True for a manejo started on the phone without signal that the server has
   * not created yet. Client-only: never leaves the phone.
   */
  pending?: boolean;
}

/** Logical group of cattle, independent of the pasture it currently occupies. */
export interface Lot {
  id: string;
  name: string;
  /** Set on groups synthesized from the former lot/paddock model at cutover. */
  needsReview?: boolean;
  /**
   * ISO instant the lot was deleted. A deleted lot is gone from every list and
   * picker, but stays in the snapshot so past manejos, placements and sold
   * animals can still print the name of the group they belonged to.
   */
  deletedAt?: string;
}

/** Fixed physical pasture/paddock of the farm. */
export interface Invernada {
  id: string;
  /** Farm-local fixed number/code, such as "03" or "3A". */
  code: string;
  name?: string;
  grass: string;
  hectares: number;
  /**
   * Pasture outline on the map: open ring of [lng, lat] pairs (GeoJSON axis
   * order, first point not repeated). Absent while the invernada was never drawn.
   */
  boundary?: [number, number][];
  /** When it was removed; only the lot history still shows it, as "(removida)". */
  removedAt?: string;
}

/** Dated assignment of a logical lot to a physical invernada. */
export interface LotPlacement {
  id: string;
  lotId: string;
  invernadaId: string;
  startedOn: string;
  endedOn?: string;
  notes?: string;
  /** Marks the current-state record synthesized at migration cutover. */
  baseline?: boolean;
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
  /** Conta bancária the money of a venda or compra went through. */
  bankAccountId?: string;
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

/**
 * What the money of a lançamento is. Despesa and receita make the resultado;
 * investimento, financiamento and sócios move money outside it, each with a
 * `flow`; a rendimento is what an aplicação earned.
 */
export type EntryKind = "expense" | "revenue" | "investment" | "financing" | "partners" | "yield";

/** Direction of a lançamento: money in or out of the conta bancária. */
export type EntryFlow = "in" | "out";

/** The three groups outside the resultado that hold contas do plano. */
export type CapitalGroup = "investment" | "financing" | "partners";

/**
 * One line of money the farm typed ("lançamento"): a despesa, a receita, or
 * money outside the resultado. The table stays `expenses`; vendas, compras and
 * treatment costs are not lançamentos, they derive from the manejos.
 */
export interface Expense {
  id: string;
  kind: EntryKind;
  /** Movimento of an investment, financing or partners row; absent on the others. */
  flow?: EntryFlow;
  /** Competência. */
  date: string;
  /** Grupo of a despesa; the other kinds write "other" and nothing reads it. */
  category: ExpenseCategory;
  amountBrl: number;
  notes?: string;
  /** Vencimento; absent means `date`. */
  dueDate?: string;
  /** Day it was paid or received; absent means pendente. */
  paidAt?: string;
  /** Pago para / recebido de, free text. */
  counterparty?: string;
  /** "NF 4.812", free text. */
  document?: string;
  /** The conta (plano de contas). */
  accountId?: string;
  /** Centro de custo; absent means the whole farm. */
  lotId?: string;
  /** The conta bancária it was paid from or received into ("Pago por"); paid rows only. */
  bankAccountId?: string;
  /** The série (parcelamento or recorrência) this row belongs to. */
  seriesId?: string;
  /** 1-based position in its série: the "2" of "2/3". */
  seriesIndex?: number;
  /** Parcelas of its parcelamento: the "3" of "2/3". Recorrências leave it out. */
  seriesCount?: number;
  /** How its recorrência repeats. Parcelas leave it out. */
  seriesFrequency?: SeriesFrequency;
  /** Day of the month a monthly recorrência falls on ("todo dia 20"). */
  seriesDay?: number;
  /**
   * Anexos (photos, PDFs) attached to it. The API always sends it (0 when
   * none); optional so a new lançamento and test fixtures need not carry it.
   */
  attachmentCount?: number;
}

/** A parcelamento (N parcelas of one purchase) or a recorrência (the same bill again and again). */
export type SeriesMode = "installments" | "recurring";

/** Interval between two lançamentos of a série. */
export type SeriesFrequency = "monthly" | "weekly";

/** Which rows of a série an edit or a removal reaches: "Só esta", "Esta e as próximas", "Todas". */
export type SeriesScope = "one" | "following" | "all";

/** How a new lançamento repeats (POST /expenses `repeat`). */
export interface SeriesRepeat {
  mode: SeriesMode;
  /** Parcelas, 2–48; installments only. */
  count?: number;
  frequency: SeriesFrequency;
  /** 1–31, monthly only; a shorter month uses its last day. Defaults to the day of `startsOn`. */
  dayOfMonth?: number;
  /** First vencimento. */
  startsOn: string;
  /** Last day an ocorrência may fall on; recurring only, absent = sem fim. */
  endsOn?: string;
}

/** A photo or PDF attached to a lançamento. */
export interface Attachment {
  id: string;
  expenseId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** ISO timestamp. */
  createdAt: string;
}

/** Grupo of a conta: receitas, the seven expense categories and the three outside the resultado. */
export type AccountGroup = ExpenseCategory | "revenue" | CapitalGroup;

/** A farm-defined conta inside a grupo ("Sal mineral" in Nutrição). */
export interface Account {
  id: string;
  group: AccountGroup;
  name: string;
  /** ISO timestamp; an archived conta leaves the form and keeps its history. */
  archivedAt?: string;
  /** Financing only: saldo devedor at the end of `openingDate`. */
  openingBalanceBrl?: number;
  openingDate?: string;
}

/** Conta corrente (takes extratos), caixa (cash), cartão de crédito or aplicação. */
export type BankAccountKind = "checking" | "cash" | "card" | "investment";

/** How the columns of a bank's CSV map to a linha do extrato; stored on the conta. */
export interface CsvMapping {
  delimiter: string;
  /** 0-based column indexes. */
  dateColumn: number;
  descriptionColumn: number;
  /** Signed value in one column, or `inColumn` + `outColumn`. */
  amountColumn?: number;
  inColumn?: number;
  outColumn?: number;
  dateFormat: "dmy" | "ymd";
  decimal: "," | ".";
  /** Lines before the data (header included). */
  skipRows: number;
}

/** A place money sits: a bank account, the farm's cash or a credit card. */
export interface BankAccount {
  id: string;
  kind: BankAccountKind;
  name: string;
  /** "c/c 12.345-6", "final 4471". */
  label?: string;
  /** Saldo at the end of `openingDate`; 0 for a card. */
  openingBalanceBrl: number;
  openingDate: string;
  /** The conta "Pago por" defaults to; one per farm, never a card. */
  isMain: boolean;
  /** Card only: 1–31, a short month uses its last day. */
  closingDay?: number;
  dueDay?: number;
  /** Card only: the conta corrente that pays the fatura. */
  paysFromId?: string;
  csvMapping?: CsvMapping;
  /** ISO timestamp; archived contas leave "Pago por" and keep their rows. */
  archivedAt?: string;
  /** Linhas do extrato still waiting for a decision. */
  pendingLines: number;
  /** Every linha dated on or before this day is resolved. */
  reconciledUntil?: string;
  /** The oldest import still holding a pending linha. */
  pendingImportId?: string;
  /** The latest import: its Conciliar page keeps Desfazer reachable. */
  lastImportId?: string;
}

/** Money moving between two contas of the farm; never in the resultado. */
export interface Transfer {
  id: string;
  fromId: string;
  toId: string;
  date: string;
  amountBrl: number;
  notes?: string;
}

export type StatementFormat = "ofx" | "csv";

/** An extrato file imported into a conta corrente. */
export interface StatementImport {
  id: string;
  bankAccountId: string;
  fileName: string;
  format: StatementFormat;
  periodFrom: string;
  periodTo: string;
  /** OFX LEDGERBAL: the bank's saldo on `bankBalanceDate`. */
  bankBalanceBrl?: number;
  bankBalanceDate?: string;
  /** New lines stored by this import. */
  lineCount: number;
  /** Lines of the file already imported before. */
  skippedCount: number;
  /** ISO timestamp. */
  createdAt: string;
}

export type StatementLineStatus = "pending" | "matched" | "created" | "transfer" | "ignored";

/** One line of an extrato: + entrada, − saída. */
export interface StatementLine {
  id: string;
  importId: string;
  bankAccountId: string;
  date: string;
  description: string;
  amountBrl: number;
  status: StatementLineStatus;
  expenseId?: string;
  /** A venda or compra: a manejo session id, or a legacy movement row id. */
  movementId?: string;
  transferId?: string;
  ignoreReason?: string;
}

/** How the twelve months of an orçamento line were filled. */
export type BudgetDistribution = "equal" | "previous" | "manual";

/**
 * One month of one line of the orçamento: a grupo's own line (accountId absent)
 * or a conta's. It carries no safra: which safra a month falls in follows from
 * the farm's `safraStartMonth`.
 */
export interface Budget {
  id: string;
  category: ExpenseCategory;
  accountId?: string;
  /** First day of the calendar month, "YYYY-MM-01". */
  month: string;
  amountBrl: number;
  /** The mode last used for the line; the same on its twelve rows. */
  distribution: BudgetDistribution;
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
  /**
   * Saved map view of the farm (sede): where the map opens and how close.
   * Absent until the farmer saves one from the map.
   */
  headquarters?: { lat: number; lng: number; zoom?: number };
  /** 1–12; the safra starts on this month (10 = outubro). */
  safraStartMonth: number;
}

/** Root of the herd data. */
export interface HerdData {
  animals: Animal[];
  treatments: Treatment[];
  lots: Lot[];
  invernadas: Invernada[];
  /**
   * Invernadas removed while past lot placements still pointed at them: kept
   * only so the lot history can name them, never listed or drawn.
   */
  removedInvernadas?: Invernada[];
  lotPlacements: LotPlacement[];
  movements: Movement[];
  breeds: string[];
  protocols: HealthProtocol[];
  manejoSessions: ManejoSession[];
  expenses: Expense[];
  /** Plano de contas: the farm's contas, archived ones included. */
  accounts: Account[];
  /** Contas bancárias, caixa and cartões, archived ones included. */
  bankAccounts?: BankAccount[];
  transfers?: Transfer[];
  /**
   * What a linha do extrato confirms, as `pairKey`: lançamento and venda/compra
   * ids, and `${transferId}:${bankAccountId}` for a transferência (one per side).
   */
  reconciledIds?: string[];
  customCategories: CustomCategory[];
  semenBulls: SemenBull[];
  farm: FarmData;
}
