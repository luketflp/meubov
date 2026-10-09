/**
 * Deterministic seed of the Fazenda Boa Vista herd (fixed seed 42).
 * Two calls of generateInitialData() produce deeply equal structures;
 * all noise comes from the rng in @/lib/data/rng, never from Math.random.
 *
 * Temporal anchor: SEED_TODAY_ISO (2026-07-24). Ages, weighings, health
 * campaigns and calving forecasts are consistent with this date.
 */
import type {
  Account,
  Animal,
  Breeding,
  Expense,
  FarmData,
  HerdData,
  Invernada,
  Lot,
  LotPlacement,
  ManejoSession,
  Movement,
  PlanGroup,
  Weighing,
  Sex,
  TreatmentStatus,
  BreedingType,
  Treatment,
} from "@/lib/types";
import { addDays, daysBetween } from "@/lib/domain/dates";

/**
 * Fixed temporal anchor of the demo herd. The app's "today" is the real
 * clock; the SEED stays anchored so generation is deterministic (ages,
 * weighings and schedules never change between runs).
 */
export const SEED_TODAY_ISO = "2026-07-24";
const TODAY_ISO = SEED_TODAY_ISO;
import { GESTATION_DAYS } from "@/lib/domain/reproduction";
import { type Rng, createRng, pick, intBetween } from "@/lib/data/rng";

const SEED = 42;

/** Registered breeds; Hereford exists in the registry but has no animal in use. */
const BREEDS: readonly string[] = [
  "Angus",
  "Brangus",
  "Cruzado Angus x Nelore",
  "Hereford",
  "Nelore",
  "Senepol",
];

/**
 * Demo pasture outlines: adjacent rectangles in a rural grid north of Uberaba,
 * sized to roughly match each invernada's declared hectares. Open rings of
 * [lng, lat] (GeoJSON axis order).
 */
const INVERNADAS: readonly Invernada[] = [
  {
    id: "invernada-1", code: "01", name: "Sede", grass: "Brachiaria brizantha", hectares: 42,
    boundary: [
      [-47.91, -19.72], [-47.90332, -19.72], [-47.90332, -19.71459], [-47.91, -19.71459],
    ],
  },
  {
    id: "invernada-2", code: "02", name: "Rio", grass: "Mombaça", hectares: 35,
    boundary: [
      [-47.90294, -19.72], [-47.89626, -19.72], [-47.89626, -19.71549], [-47.90294, -19.71549],
    ],
  },
  {
    id: "invernada-3", code: "03", name: "Alta", grass: "Tifton 85", hectares: 28,
    boundary: [
      [-47.89588, -19.72], [-47.89054, -19.72], [-47.89054, -19.71549], [-47.89588, -19.71549],
    ],
  },
  {
    id: "invernada-4", code: "04", name: "Piquete Norte", grass: "Humidícola", hectares: 18,
    boundary: [
      [-47.91, -19.71423], [-47.90571, -19.71423], [-47.90571, -19.71062], [-47.91, -19.71062],
    ],
  },
  {
    id: "invernada-5", code: "05", name: "Reserva do Ipê", grass: "Andropogon", hectares: 55,
    boundary: [
      [-47.90533, -19.71423], [-47.89579, -19.71423], [-47.89579, -19.70927], [-47.90533, -19.70927],
    ],
  },
];

/** Logical groups: animals remain members while the groups rotate through pastures. */
const LOTS: readonly Lot[] = [
  { id: "lot-1", name: "Matrizes com cria" },
  { id: "lot-2", name: "Recém-chegados" },
  { id: "lot-3", name: "Garrotes" },
  { id: "lot-4", name: "Recria" },
  { id: "lot-5", name: "Matrizes solteiras" },
];

/** Pasture rotation history; every logical lot has exactly one open placement. */
const LOT_PLACEMENTS: readonly LotPlacement[] = [
  {
    id: "placement-1-old", lotId: "lot-1", invernadaId: "invernada-3",
    startedOn: "2025-07-24", endedOn: "2026-01-15", notes: "Rotação das águas",
  },
  {
    id: "placement-1-current", lotId: "lot-1", invernadaId: "invernada-1",
    startedOn: "2026-01-15",
  },
  {
    id: "placement-2-current", lotId: "lot-2", invernadaId: "invernada-2",
    startedOn: "2026-02-01",
  },
  {
    id: "placement-3-current", lotId: "lot-3", invernadaId: "invernada-2",
    startedOn: "2026-01-15",
  },
  {
    id: "placement-4-old", lotId: "lot-4", invernadaId: "invernada-5",
    startedOn: "2025-10-01", endedOn: "2026-05-01",
  },
  {
    id: "placement-4-current", lotId: "lot-4", invernadaId: "invernada-4",
    startedOn: "2026-05-01", notes: "Descanso da Reserva do Ipê",
  },
  {
    id: "placement-5-current", lotId: "lot-5", invernadaId: "invernada-5",
    startedOn: "2026-05-01",
  },
];

/** What the seeded treatments apply: name, type and carência. */
type TreatmentTemplate = Pick<Treatment, "name" | "type" | "withdrawalDays">;

const TREATMENT_TEMPLATES: readonly TreatmentTemplate[] = [
  { name: "Vacina aftosa", type: "vaccine", withdrawalDays: 0 },
  { name: "Vermifugação", type: "deworming", withdrawalDays: 30 },
  { name: "Vacina clostridiose", type: "vaccine", withdrawalDays: 21 },
  { name: "Vacina botulismo", type: "vaccine", withdrawalDays: 21 },
  { name: "Controle de ectoparasitas", type: "medication", withdrawalDays: 15 },
];

const FARM: FarmData = {
  name: "Fazenda Boa Vista",
  municipality: "Uberaba - MG",
  stateRegistration: "12.345.678-0001",
  manager: "Lucas Alexandre",
  headquarters: { lat: -19.721, lng: -47.911 },
  safraStartMonth: 10,
};

const BREEDING_TYPES: readonly BreedingType[] = ["timedAI", "naturalMating"];

/** Entry date of the second bull into the herd (registered purchase). */
const BULL_2_PURCHASE_DATE = "2026-02-01";

/** Session name of each kind that moves the herd (same as lib/domain/manejo). */
const MOVEMENT_SESSION_NAME: Record<"transfer" | "sale" | "entry", string> = {
  transfer: "Troca de lote",
  sale: "Venda",
  entry: "Entrada",
};

/** Breeds by position — Angus predominant, all others used at least once. */
const COW_BREEDS: readonly string[] = [
  "Angus", "Angus", "Nelore", "Angus", "Brangus", "Angus", "Cruzado Angus x Nelore",
  "Angus", "Nelore", "Angus", "Senepol", "Angus", "Brangus",
];
const HEIFER_BREEDS: readonly string[] = ["Angus", "Brangus", "Angus", "Nelore", "Angus", "Senepol"];
const STEER_BREEDS: readonly string[] = [
  "Angus", "Cruzado Angus x Nelore", "Angus", "Nelore", "Angus",
  "Cruzado Angus x Nelore", "Angus", "Brangus", "Angus",
];

/** Historical calvings: the dams are the cows at index 0..4 (all in lot-1). */
const CALVINGS: readonly { date: string; sex: Sex; breed: string }[] = [
  { date: "2025-09-10", sex: "male", breed: "Angus" },
  { date: "2025-10-05", sex: "female", breed: "Angus" },
  { date: "2025-11-08", sex: "female", breed: "Cruzado Angus x Nelore" },
  { date: "2026-03-12", sex: "male", breed: "Angus" },
  { date: "2026-04-02", sex: "male", breed: "Brangus" },
];

const WEANED_SEXES: readonly Sex[] = ["female", "male", "male", "female"];
const WEANED_BREEDS: readonly string[] = ["Angus", "Nelore", "Angus", "Cruzado Angus x Nelore"];

/** Breedings of the 7 pregnant cows: calvings expected between Aug and Nov/2026. */
const PREGNANT_BREEDINGS: readonly string[] = [
  "2025-11-05", "2025-11-22", "2025-12-10", "2025-12-28", "2026-01-15", "2026-01-30", "2026-02-12",
];
const PREGNANT_COW_INDICES: readonly number[] = [0, 1, 5, 6, 7, 8, 9];

// ---- Expenses (12 months ending at the seed anchor) -------------------------

/** Month keys of the 12 months ending at SEED_TODAY_ISO's month (asc). */
const EXPENSE_MONTHS: readonly string[] = [
  "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01",
  "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
];

/** Feed/mineral cost per month — heavier in the dry season (Aug–Oct). */
const NUTRITION_BY_MONTH: readonly number[] = [
  5400, 5600, 5200, 4300, 3800, 3400, 3200, 3300, 3600, 4100, 4800, 5200,
];

const LABOR_MONTHLY = 2600;
const ADMIN_MONTHLY = 480;

/** The eleven default grupos (DEFAULT_GROUPS in lib/domain/groups.ts), with fixed ids the seed points at. */
export const SEED_GROUPS: readonly PlanGroup[] = [
  { id: "grp-receitas", kind: "revenue", name: "Receitas", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-nutricao", kind: "expense", name: "Nutrição", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-pastagem", kind: "expense", name: "Pastagem", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-mao-de-obra", kind: "expense", name: "Mão de obra", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-sanidade", kind: "expense", name: "Sanidade", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-reproducao", kind: "expense", name: "Reprodução", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-administrativo", kind: "expense", name: "Administrativo", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-outros", kind: "expense", name: "Outros", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-investimentos", kind: "investment", name: "Investimentos", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-financiamentos", kind: "financing", name: "Financiamentos", createdAt: "2025-07-01T12:00:00.000Z" },
  { id: "grp-socios", kind: "partners", name: "Sócios", createdAt: "2025-07-01T12:00:00.000Z" },
];

/**
 * The farm's plano de contas: the standard list, with fixed ids so the seed
 * expenses can point at them. Mirrors DEFAULT_ACCOUNTS in lib/domain/accounts.ts.
 */
const SEED_ACCOUNTS: readonly Account[] = [
  { id: "acc-revenue-aluguel-de-pasto", group: "grp-receitas", name: "Aluguel de pasto" },
  { id: "acc-revenue-venda-de-esterco", group: "grp-receitas", name: "Venda de esterco" },
  { id: "acc-revenue-outras-receitas", group: "grp-receitas", name: "Outras receitas" },
  { id: "acc-nutrition-sal-mineral", group: "grp-nutricao", name: "Sal mineral" },
  { id: "acc-nutrition-racao-e-suplemento", group: "grp-nutricao", name: "Ração e suplemento" },
  { id: "acc-nutrition-silagem", group: "grp-nutricao", name: "Silagem" },
  { id: "acc-pasture-adubo", group: "grp-pastagem", name: "Adubo" },
  { id: "acc-pasture-sementes", group: "grp-pastagem", name: "Sementes" },
  { id: "acc-pasture-herbicida", group: "grp-pastagem", name: "Herbicida" },
  { id: "acc-pasture-rocada", group: "grp-pastagem", name: "Roçada" },
  { id: "acc-labor-salarios", group: "grp-mao-de-obra", name: "Salários" },
  { id: "acc-labor-encargos", group: "grp-mao-de-obra", name: "Encargos" },
  { id: "acc-labor-diarias", group: "grp-mao-de-obra", name: "Diárias" },
  { id: "acc-health-vacinas", group: "grp-sanidade", name: "Vacinas" },
  { id: "acc-health-vermifugos", group: "grp-sanidade", name: "Vermífugos" },
  { id: "acc-health-medicamentos", group: "grp-sanidade", name: "Medicamentos" },
  { id: "acc-health-veterinario", group: "grp-sanidade", name: "Veterinário" },
  { id: "acc-breeding-semen", group: "grp-reproducao", name: "Sêmen" },
  { id: "acc-breeding-iatf-e-hormonios", group: "grp-reproducao", name: "IATF e hormônios" },
  { id: "acc-breeding-touros", group: "grp-reproducao", name: "Touros" },
  { id: "acc-admin-energia", group: "grp-administrativo", name: "Energia" },
  { id: "acc-admin-combustivel", group: "grp-administrativo", name: "Combustível" },
  { id: "acc-admin-manutencao", group: "grp-administrativo", name: "Manutenção" },
  { id: "acc-admin-impostos-e-taxas", group: "grp-administrativo", name: "Impostos e taxas" },
  { id: "acc-admin-contabilidade", group: "grp-administrativo", name: "Contabilidade" },
  { id: "acc-investment-benfeitorias", group: "grp-investimentos", name: "Benfeitorias" },
  { id: "acc-investment-maquinas-e-implementos", group: "grp-investimentos", name: "Máquinas e implementos" },
  { id: "acc-investment-equipamentos", group: "grp-investimentos", name: "Equipamentos" },
  { id: "acc-partners-distribuicao-de-lucro", group: "grp-socios", name: "Distribuição de lucro" },
];

/** A despesa paid on its own date: kind and paidAt are filled by buildExpenses. */
type PaidExpense = Omit<Expense, "id" | "kind" | "paidAt">;

/** One-off expenses: pasture upkeep, breeding, extra health and misc. */
const ONE_OFF_EXPENSES: readonly PaidExpense[] = [
  { date: "2025-09-15", category: "grp-pastagem", amountBrl: 2900, notes: "Adubação das pastagens", accountId: "acc-pasture-adubo" },
  { date: "2026-01-20", category: "grp-pastagem", amountBrl: 1400, notes: "Sementes de braquiária", accountId: "acc-pasture-sementes" },
  { date: "2026-03-18", category: "grp-pastagem", amountBrl: 1650, notes: "Roçada e reparo de cercas", accountId: "acc-pasture-rocada" },
  { date: "2026-06-10", category: "grp-pastagem", amountBrl: 900 },
  { date: "2025-11-05", category: "grp-reproducao", amountBrl: 2100, notes: "Protocolo IATF", accountId: "acc-breeding-iatf-e-hormonios", lotId: "lot-1" },
  { date: "2026-01-15", category: "grp-reproducao", amountBrl: 1300, notes: "Doses de sêmen", accountId: "acc-breeding-semen", lotId: "lot-1" },
  { date: "2025-10-12", category: "grp-sanidade", amountBrl: 850, notes: "Consulta veterinária", accountId: "acc-health-veterinario", lotId: "lot-3" },
  { date: "2026-02-08", category: "grp-sanidade", amountBrl: 620 },
  { date: "2026-05-11", category: "grp-sanidade", amountBrl: 1200, notes: "Campanha de aftosa", accountId: "acc-health-vacinas" },
  { date: "2025-12-18", category: "grp-outros", amountBrl: 700, notes: "Combustível" },
  { date: "2026-04-22", category: "grp-outros", amountBrl: 540 },
];

/**
 * Receitas typed by hand and contas still open at the real "today" of the
 * demo (September 2026): Sal mineral is vencida, Salários and Energia a pagar.
 */
const OPEN_AND_REVENUE_ENTRIES: readonly Omit<Expense, "id">[] = [
  {
    kind: "revenue", date: "2026-08-12", category: "grp-receitas", amountBrl: 1800,
    paidAt: "2026-08-12", accountId: "acc-revenue-venda-de-esterco",
  },
  {
    kind: "revenue", date: "2026-09-05", category: "grp-receitas", amountBrl: 6400,
    paidAt: "2026-09-05", accountId: "acc-revenue-aluguel-de-pasto",
  },
  {
    kind: "expense", date: "2026-09-10", dueDate: "2026-09-30", category: "grp-mao-de-obra",
    amountBrl: 8400, accountId: "acc-labor-salarios",
  },
  {
    kind: "expense", date: "2026-09-18", dueDate: "2026-09-18", category: "grp-nutricao",
    amountBrl: 4850, accountId: "acc-nutrition-sal-mineral",
  },
  {
    kind: "expense", date: "2026-09-20", dueDate: "2026-09-28", category: "grp-administrativo",
    amountBrl: 1320, accountId: "acc-admin-energia",
  },
];

/** Deterministic expense book: monthly recurring rows + one-offs, date asc. */
function buildExpenses(): Expense[] {
  const rows: PaidExpense[] = [];
  EXPENSE_MONTHS.forEach((month, i) => {
    rows.push({
      date: `${month}-05`,
      category: "grp-nutricao",
      amountBrl: NUTRITION_BY_MONTH[i],
      notes: "Ração e sal mineral",
      accountId: "acc-nutrition-racao-e-suplemento",
    });
    rows.push({
      date: `${month}-01`,
      category: "grp-mao-de-obra",
      amountBrl: LABOR_MONTHLY,
      notes: "Diárias e encargos",
      accountId: "acc-labor-diarias",
    });
    rows.push({ date: `${month}-10`, category: "grp-administrativo", amountBrl: ADMIN_MONTHLY });
  });
  rows.push(...ONE_OFF_EXPENSES);
  const entries: Omit<Expense, "id">[] = [
    ...rows.map((row) => ({ ...row, kind: "expense" as const, paidAt: row.date })),
    ...OPEN_AND_REVENUE_ENTRIES,
  ];
  return entries
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((row, i) => ({ ...row, id: `expense-${i + 1}` }));
}

function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Generates `quantity` unique 4-digit numeric ear tags. */
function generateUniqueEarTags(rng: Rng, quantity: number): string[] {
  const used = new Set<string>();
  while (used.size < quantity) used.add(String(intBetween(rng, 1000, 9999)));
  return [...used];
}

/** Date of the last weighing: a few days before today. */
function defaultEnd(rng: Rng): string {
  return addDays(TODAY_ISO, -intBetween(rng, 2, 15));
}

interface WeighingParams {
  finalWeightKg: number;
  targetAdg: number;
  spanDays: number;
  endIso: string;
}

/**
 * Series of 4 to 8 ascending weighings covering spanDays and ending at endIso.
 * The extremes are exact (resulting ADG = targetAdg, save rounding of
 * up to 1 kg); the intermediate points get date and weight noise.
 */
function generateWeighingSeries(rng: Rng, p: WeighingParams): Weighing[] {
  const maxPoints = Math.floor(p.spanDays / 18) + 1;
  const n = Math.max(4, Math.min(intBetween(rng, 4, 8), maxPoints));
  const startIso = addDays(p.endIso, -p.spanDays);
  const initialWeight = p.finalWeightKg - p.targetAdg * p.spanDays;
  const weighings: Weighing[] = [];
  for (let i = 0; i < n; i++) {
    const base = Math.round((i * p.spanDays) / (n - 1));
    const intermediate = i > 0 && i < n - 1;
    const offset = intermediate ? base + intBetween(rng, -4, 4) : base;
    const noise = intermediate ? (rng() * 2 - 1) * p.finalWeightKg * 0.015 : 0;
    weighings.push({
      date: addDays(startIso, offset),
      weightKg: Math.round(initialWeight + p.targetAdg * offset + noise),
    });
  }
  return weighings;
}

function cowWeighings(rng: Rng, endIso?: string): Weighing[] {
  const end = endIso ?? defaultEnd(rng);
  const finalWeightKg = intBetween(rng, 430, 515);
  const targetAdg = range(rng, 0.15, 0.35);
  const spanDays = Math.min(intBetween(rng, 270, 420), Math.floor((finalWeightKg - 380) / targetAdg));
  return generateWeighingSeries(rng, { finalWeightKg, targetAdg, spanDays, endIso: end });
}

function heiferWeighings(rng: Rng, spanMaxDays = 420): Weighing[] {
  const end = defaultEnd(rng);
  const finalWeightKg = intBetween(rng, 270, 375);
  const targetAdg = range(rng, 0.45, 0.75);
  const spanDays = Math.min(intBetween(rng, 240, 420), spanMaxDays, Math.floor((finalWeightKg - 160) / targetAdg));
  return generateWeighingSeries(rng, { finalWeightKg, targetAdg, spanDays, endIso: end });
}

function steerWeighings(rng: Rng, endIso?: string): Weighing[] {
  const end = endIso ?? defaultEnd(rng);
  const finalWeightKg = intBetween(rng, 410, 570);
  const targetAdg = range(rng, 0.55, 0.85);
  const spanDays = Math.min(intBetween(rng, 240, 420), Math.floor((finalWeightKg - 250) / targetAdg));
  return generateWeighingSeries(rng, { finalWeightKg, targetAdg, spanDays, endIso: end });
}

function bullWeighings(rng: Rng, spanMaxDays = 420): Weighing[] {
  const end = defaultEnd(rng);
  const finalWeightKg = intBetween(rng, 760, 940);
  const targetAdg = range(rng, 0.12, 0.27);
  const spanDays = Math.min(intBetween(rng, 270, 420), spanMaxDays, Math.floor((finalWeightKg - 700) / targetAdg));
  return generateWeighingSeries(rng, { finalWeightKg, targetAdg, spanDays, endIso: end });
}

/** Current weight consistent with age; series always start after birth. */
function calfWeighings(rng: Rng, birthIso: string): Weighing[] {
  const end = defaultEnd(rng);
  const ageDays = daysBetween(birthIso, TODAY_ISO);
  const minWeight = Math.max(92, Math.round(35 + 0.45 * ageDays));
  const maxWeight = Math.min(228, Math.round(35 + 0.95 * ageDays));
  const finalWeightKg = intBetween(rng, minWeight, maxWeight);
  const targetAdg = range(rng, 0.65, 0.95);
  const spanDays = Math.min(
    daysBetween(birthIso, end) - 10,
    Math.floor((finalWeightKg - 38) / targetAdg),
    280
  );
  return generateWeighingSeries(rng, { finalWeightKg, targetAdg, spanDays, endIso: end });
}

/** Generates all the initial app data, always identical (seed 42). */
export function generateInitialData(): HerdData {
  const rng = createRng(SEED);
  const earTags = generateUniqueEarTags(rng, 41);
  let nextEarTag = 0;
  const takeEarTag = (): string => earTags[nextEarTag++];
  const takeAnimalIdentity = (): Pick<Animal, "id" | "earTag"> => {
    const earTag = takeEarTag();
    return { id: `animal-${earTag}`, earTag };
  };

  // ---- Animals ----------------------------------------------------------
  const bulls: Animal[] = [
    {
      ...takeAnimalIdentity(), category: "bull", breed: "Angus", sex: "male",
      birthDate: addDays(TODAY_ISO, -2200), lotId: "lot-1", active: true,
      weighings: bullWeighings(rng),
    },
    {
      // Bought in Feb/2026 (purchase movement); weighings only after arrival.
      ...takeAnimalIdentity(), category: "bull", breed: "Angus", sex: "male",
      birthDate: addDays(TODAY_ISO, -1650), lotId: "lot-2", active: true,
      weighings: bullWeighings(rng, 160),
    },
  ];

  const cows: Animal[] = COW_BREEDS.map((breed, i) => ({
    ...takeAnimalIdentity(), category: "cow", breed, sex: "female",
    birthDate: addDays(TODAY_ISO, -intBetween(rng, 1250, 3200)),
    lotId: i < 7 ? "lot-1" : "lot-5", active: true,
    weighings: cowWeighings(rng),
  }));

  const heifers: Animal[] = HEIFER_BREEDS.map((breed, i) => ({
    ...takeAnimalIdentity(), category: "heifer", breed, sex: "female",
    // heifer 0 older (fit for reproduction); 4 and 5 bought in Mar/2026.
    birthDate: addDays(TODAY_ISO, i === 0 ? -980 : -intBetween(rng, 430, 1000)),
    lotId: i >= 4 ? "lot-2" : "lot-4", active: true,
    weighings: heiferWeighings(rng, i >= 4 ? 130 : undefined),
  }));

  const steers: Animal[] = STEER_BREEDS.map((breed, i) => ({
    ...takeAnimalIdentity(), category: "steer", breed, sex: "male",
    birthDate: addDays(TODAY_ISO, -intBetween(rng, 460, 950)),
    lotId: i < 7 ? "lot-3" : "lot-2", active: true,
    weighings: steerWeighings(rng),
  }));

  const calfOffspring: Animal[] = CALVINGS.map((calving) => ({
    ...takeAnimalIdentity(), category: "calf", breed: calving.breed, sex: calving.sex,
    birthDate: calving.date, lotId: "lot-1", active: true,
    weighings: calfWeighings(rng, calving.date),
  }));

  const weanedCalves: Animal[] = WEANED_SEXES.map((sex, i) => {
    const birthDate = addDays(TODAY_ISO, -intBetween(rng, 150, 330));
    return {
      ...takeAnimalIdentity(), category: "calf", breed: WEANED_BREEDS[i], sex,
      birthDate, lotId: "lot-4", active: true,
      weighings: calfWeighings(rng, birthDate),
    };
  });

  const soldSteer: Animal = {
    ...takeAnimalIdentity(), category: "steer", breed: "Nelore", sex: "male",
    birthDate: addDays(TODAY_ISO, -880), lotId: "lot-3", active: false,
    weighings: steerWeighings(rng, "2026-03-30"),
  };
  const soldCow: Animal = {
    ...takeAnimalIdentity(), category: "cow", breed: "Angus", sex: "female",
    birthDate: addDays(TODAY_ISO, -2600), lotId: "lot-1", active: false,
    weighings: cowWeighings(rng, "2026-05-05"),
  };

  // ---- Reproduction (adult females) -------------------------------------
  const bullForDate = (dateIso: string): string =>
    dateIso >= BULL_2_PURCHASE_DATE ? bulls[1].earTag : bulls[0].earTag;

  PREGNANT_COW_INDICES.forEach((index, i) => {
    const cow = cows[index];
    const date = PREGNANT_BREEDINGS[i];
    const breeding: Breeding = {
      id: `breeding-${cow.earTag}-current`, date,
      type: i % 2 === 0 ? "timedAI" : "naturalMating",
      bullEarTag: bullForDate(date),
    };
    cow.reproduction = {
      breedings: [breeding],
      diagnoses: [
        { breedingId: breeding.id, result: "pregnant", date: addDays(date, intBetween(rng, 35, 55)) },
      ],
      calvings: [],
    };
  });

  const pending: readonly { cow: Animal; date: string }[] = [
    { cow: cows[3], date: "2026-05-25" },
    { cow: cows[4], date: "2026-06-10" },
    { cow: cows[10], date: "2026-06-22" },
  ];
  for (const { cow, date } of pending) {
    cow.reproduction = {
      breedings: [
        {
          id: `breeding-${cow.earTag}-current`, date,
          type: pick(rng, BREEDING_TYPES), bullEarTag: bullForDate(date),
        },
      ],
      diagnoses: [],
      calvings: [],
    };
  }

  const open: readonly { female: Animal; date: string }[] = [
    { female: cows[2], date: "2026-01-08" },
    { female: cows[11], date: "2026-02-20" },
    { female: cows[12], date: "2026-03-15" },
    { female: heifers[0], date: "2026-04-05" },
  ];
  for (const { female, date } of open) {
    const breeding: Breeding = {
      id: `breeding-${female.earTag}-current`, date,
      type: pick(rng, BREEDING_TYPES), bullEarTag: bullForDate(date),
    };
    female.reproduction = {
      breedings: [breeding],
      diagnoses: [
        { breedingId: breeding.id, result: "open", date: addDays(date, intBetween(rng, 35, 50)) },
      ],
      calvings: [],
    };
  }

  CALVINGS.forEach((calving, i) => {
    const dam = cows[i];
    const calf = calfOffspring[i];
    const record = dam.reproduction;
    if (!record) throw new Error(`Cow ${dam.earTag} without a reproduction record to register calving`);
    const previousBreedingDate = addDays(calving.date, -GESTATION_DAYS);
    const previousId = `breeding-${dam.earTag}-previous`;
    record.breedings.unshift({
      id: previousId, date: previousBreedingDate, type: "naturalMating", bullEarTag: bulls[0].earTag,
    });
    record.diagnoses.unshift({
      breedingId: previousId, result: "pregnant", date: addDays(previousBreedingDate, 40),
    });
    record.calvings.push({ date: calving.date, calfEarTag: calf.earTag });
  });

  // ---- Health treatments ------------------------------------------------
  const [protFmd, protDeworming, protClostridiose, protBotulism, protEctoparasites] = TREATMENT_TEMPLATES;
  const treatments: Treatment[] = [];
  let treatmentSequence = 0;
  const recordTreatment = (
    animal: Animal,
    template: TreatmentTemplate,
    date: string,
    status: TreatmentStatus,
    notes?: string
  ): void => {
    treatmentSequence += 1;
    treatments.push({
      id: `treatment-${treatmentSequence}`, animalEarTag: animal.earTag,
      type: template.type, name: template.name, date, status,
      withdrawalDays: template.withdrawalDays,
      ...(notes === undefined ? {} : { notes }),
    });
  };

  // 25 historical done items (May/2026 foot-and-mouth campaign across most of the herd).
  const fmdVaccinated = [...cows.filter((_, i) => i !== 11), ...bulls, ...steers.slice(2, 6)];
  for (const animal of fmdVaccinated) {
    recordTreatment(animal, protFmd, addDays("2026-05-11", intBetween(rng, 0, 4)), "done", "Campanha de maio/2026");
  }
  const dewormedFebruary = [calfOffspring[0], calfOffspring[1], calfOffspring[2], weanedCalves[0]];
  for (const animal of dewormedFebruary) {
    recordTreatment(animal, protDeworming, addDays("2026-02-05", intBetween(rng, 0, 10)), "done");
  }
  recordTreatment(heifers[3], protClostridiose, "2025-10-20", "done");
  recordTreatment(heifers[4], protClostridiose, "2025-10-22", "done");
  recordTreatment(bulls[0], protBotulism, "2025-11-10", "done");

  // 6 overdue (derived status), across 6 distinct animals:
  // 4 foot-and-mouth doses missed in the May campaign + 2 expired dewormings.
  const missedFmd = [heifers[1], steers[0], weanedCalves[1], cows[11]];
  for (const animal of missedFmd) {
    recordTreatment(animal, protFmd, "2026-05-14", "scheduled", "Perdeu a campanha de maio — reagendar");
  }
  recordTreatment(steers[1], protDeworming, "2026-06-20", "scheduled");
  recordTreatment(heifers[2], protDeworming, "2026-07-05", "scheduled");

  // 10 scheduled in the next 45 days (6 of them within 30 days -> "attention").
  const schedule: readonly { animal: Animal; template: TreatmentTemplate; date: string }[] = [
    { animal: weanedCalves[2], template: protDeworming, date: "2026-08-03" },
    { animal: weanedCalves[3], template: protDeworming, date: "2026-08-06" },
    { animal: steers[2], template: protDeworming, date: "2026-08-11" },
    { animal: calfOffspring[3], template: protClostridiose, date: "2026-08-16" },
    { animal: heifers[5], template: protClostridiose, date: "2026-08-19" },
    { animal: cows[0], template: protEctoparasites, date: "2026-08-21" },
    { animal: steers[3], template: protClostridiose, date: "2026-08-27" },
    { animal: steers[4], template: protClostridiose, date: "2026-08-30" },
    { animal: cows[1], template: protEctoparasites, date: "2026-09-03" },
    { animal: cows[2], template: protEctoparasites, date: "2026-09-05" },
  ];
  for (const item of schedule) recordTreatment(item.animal, item.template, item.date, "scheduled");

  // ---- Manejo sessions that moved the herd (last 6 months) ---------------
  // Compras, vendas e transferências are closed sessions of the curral: every
  // animal below actually passed the chute, so the ledger derives its head
  // count, category and value from them (lib/domain/movements.ts).
  let nextSessionId = 0;
  const movementSession = (
    kind: "transfer" | "sale" | "entry",
    date: string,
    handled: readonly Animal[],
    fields: {
      /** Lot the animals were in before the pass (transferência/venda). */
      from?: string;
      destinationLotId?: string;
      counterparty?: string;
      totalAmountBrl?: number;
      notes?: string;
    } = {}
  ): ManejoSession => {
    const { from, ...session } = fields;
    return {
      id: `manejo-mov-${++nextSessionId}`,
      name: MOVEMENT_SESSION_NAME[kind],
      date,
      status: "closed",
      kind,
      weighing: false,
      animals: handled.map((animal) => ({
        earTag: animal.earTag,
        outcome: "done" as const,
        previousLotId: kind === "entry" ? undefined : from,
        createdAnimal: kind === "entry",
      })),
      ...session,
    };
  };

  const movementSessions: ManejoSession[] = [
    movementSession("entry", BULL_2_PURCHASE_DATE, [bulls[1]], {
      destinationLotId: "lot-2",
      counterparty: "Cabanha São Jorge",
      totalAmountBrl: 14000,
      notes: `Aquisição do touro ${bulls[1].earTag}`,
    }),
    movementSession("entry", "2026-03-10", [heifers[4], heifers[5]], {
      destinationLotId: "lot-2",
      counterparty: "Leilão Uberaba",
      totalAmountBrl: 7600,
    }),
    movementSession("transfer", "2026-03-18", steers.slice(0, 4), {
      from: "lot-2",
      destinationLotId: "lot-3",
    }),
    movementSession("sale", "2026-04-08", [soldSteer], {
      from: "lot-3",
      counterparty: "Frigorífico Boi Forte",
      totalAmountBrl: 8850,
      notes: `Venda do boi ${soldSteer.earTag} para frigorífico`,
    }),
    movementSession("sale", "2026-05-12", [soldCow], {
      from: "lot-1",
      counterparty: "Frigorífico Boi Forte",
      totalAmountBrl: 6200,
      notes: `Descarte da vaca ${soldCow.earTag}`,
    }),
    movementSession("transfer", "2026-05-30", heifers.slice(0, 3), {
      from: "lot-5",
      destinationLotId: "lot-4",
    }),
    movementSession("transfer", "2026-07-02", cows.slice(7), {
      from: "lot-1",
      destinationLotId: "lot-5",
    }),
  ];

  // ---- Legacy movement row ----------------------------------------------
  // Written by the old "Registrar movimentação" screen, before compras e vendas
  // became manejo sessions: a head count with no animal behind it. Kept in the
  // demo so the ledger keeps proving it still renders that history.
  const movements: Movement[] = [
    {
      id: "mov-legacy-1",
      type: "sale",
      date: "2026-06-02",
      quantity: 3,
      category: "calf",
      origin: "Piquete Norte",
      destination: "Externo",
      amountBrl: 8400,
      notes: "Bezerros desmamados vendidos em leilão (sem cadastro individual)",
    },
  ];

  return {
    animals: [
      ...cows, ...heifers, ...steers, ...calfOffspring, ...weanedCalves,
      ...bulls, soldSteer, soldCow,
    ],
    treatments,
    lots: LOTS.map((l) => ({ ...l })),
    invernadas: INVERNADAS.map((invernada) => ({
      ...invernada,
      boundary: invernada.boundary?.map(([lng, lat]) => [lng, lat]),
    })),
    lotPlacements: LOT_PLACEMENTS.map((placement) => ({ ...placement })),
    movements,
    breeds: [...BREEDS],
    manejoSessions: movementSessions,
    expenses: buildExpenses(),
    accounts: SEED_ACCOUNTS.map((account) => ({ ...account })),
    planGroups: SEED_GROUPS.map((group) => ({ ...group })),
    customCategories: [],
    semenBulls: [],
    farm: { ...FARM },
  };
}
