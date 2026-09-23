/**
 * The ficha of one animal as tables: its fields as Campo/Valor, its weighings
 * with the GMD since the previous one, its treatments and, for a female, its
 * coberturas and partos. The same rows and order the ficha draws.
 */
import type { Animal, CustomCategory, SemenBull, Treatment, TreatmentStatus, Weighing } from "@/lib/types";
import type { AnimalWithDerived } from "@/lib/store/selectors";
import { addDays, daysBetween, formatAge, formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { breedingOutcome, currentDiagnosis } from "@/lib/domain/reproduction";
import { deriveTreatmentStatus } from "@/lib/domain/status";
import {
  BREEDING_TYPE_LABEL,
  DIAGNOSIS_RESULT_LABEL,
  INACTIVE_REASON_LABEL,
  SEX_LABEL,
  TREATMENT_TYPE_LABEL,
  animalCategoryName,
} from "@/lib/domain/labels";
import { buildTable, type Cell, type ExportTable } from "@/lib/export/table";

const STATUS_LABEL = { healthy: "Saudável", attention: "Atenção", overdue: "Atrasado" } as const;

const TREATMENT_STATUS_LABEL: Record<TreatmentStatus, string> = {
  scheduled: "Agendado",
  overdue: "Atrasado",
  done: "Feito",
};

const newestFirst = <T extends { date: string }>(a: T, b: T): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : 0;

/**
 * The GMD (kg/dia) of each weighing since the one before it, in the order
 * given (ascending by date); null for the first and for a same-day weighing.
 */
export function weighingGains(weighings: readonly Weighing[]): (number | null)[] {
  return weighings.map((weighing, i) => {
    if (i === 0) return null;
    const previous = weighings[i - 1];
    const days = daysBetween(previous.date, weighing.date);
    return days === 0 ? null : (weighing.weightKg - previous.weightKg) / days;
  });
}

/** The weighings of one animal, oldest first, with the GMD since the previous one. */
export function animalWeighingsTable(animal: Animal, title = "Pesagens"): ExportTable {
  const gains = weighingGains(animal.weighings);
  const rows = animal.weighings.map((weighing, i) => ({ weighing, gain: gains[i] }));
  return buildTable(
    title,
    [
      { header: "Data", kind: "date", value: (r) => r.weighing.date },
      { header: "Peso (kg)", kind: "number", decimals: 1, value: (r) => r.weighing.weightKg },
      { header: "GMD desde a anterior (kg/dia)", kind: "number", decimals: 3, value: (r) => r.gain },
    ],
    rows
  );
}

export interface AnimalExportNames {
  lotName: string | null;
  /** "01 · Baixada", or null when the lot stands on no invernada. */
  invernadaName: string | null;
  customCategories: readonly CustomCategory[];
  semenBulls: readonly SemenBull[];
}

function dataTable(item: AnimalWithDerived, names: AnimalExportNames, todayIso: string): ExportTable {
  const { animal } = item;
  const text = (value: number | null, decimals: number, unit = ""): string | null =>
    value === null ? null : `${formatNumber(value, decimals)}${unit}`;
  const situation = animal.active
    ? "No rebanho"
    : [
        animal.inactiveReason ? INACTIVE_REASON_LABEL[animal.inactiveReason] : "Fora do rebanho",
        animal.inactiveDate ? formatDate(animal.inactiveDate) : "",
      ]
        .filter(Boolean)
        .join(" · ");

  const fields: [string, Cell][] = [
    ["Brinco", animal.earTag],
    ["Categoria", animalCategoryName(animal, names.customCategories)],
    ["Raça", animal.breed],
    ["Sexo", SEX_LABEL[animal.sex]],
    ["Nascimento", animal.birthDate ? formatDate(animal.birthDate) : null],
    ["Idade", animal.birthDate ? formatAge(animal.birthDate, todayIso) : null],
    ["Lote", names.lotName],
    ["Invernada atual", names.invernadaName],
    ["Peso atual (kg)", text(item.currentWeightKg, 1)],
    ["Última pesagem", animal.weighings.length > 0 ? formatDate(animal.weighings[animal.weighings.length - 1].date) : null],
    ["GMD (kg/dia)", text(item.adg, 3)],
    ["Status", STATUS_LABEL[item.status]],
    ["Motivo do status", item.reason],
    ["Situação", situation],
  ];
  if (animal.inactiveNotes) fields.push(["Observação da baixa", animal.inactiveNotes]);
  if (animal.sex === "female") {
    const current = animal.reproduction ? currentDiagnosis(animal.reproduction) : null;
    fields.push(["Diagnóstico atual", current ? DIAGNOSIS_RESULT_LABEL[current.result] : "Sem coberturas"]);
    const expected =
      current && animal.reproduction ? breedingOutcome(animal.reproduction, current.breeding).expectedCalvingDate : null;
    if (expected) fields.push(["Previsão de parto", formatDate(expected)]);
  }

  return buildTable(
    "Dados",
    [
      { header: "Campo", value: ([field]) => field },
      { header: "Valor", value: ([, value]) => value },
    ],
    fields
  );
}

/** The treatments of one animal, newest first, as the Histórico sanitário lists them. */
function healthTable(treatments: readonly Treatment[], todayIso: string): ExportTable {
  return buildTable(
    "Sanidade",
    [
      { header: "Data", kind: "date", value: (t) => t.date },
      { header: "Tipo", value: (t) => TREATMENT_TYPE_LABEL[t.type] },
      { header: "Produto", value: (t) => t.name },
      { header: "Dose", value: (t) => t.dose ?? null },
      { header: "Status", value: (t) => TREATMENT_STATUS_LABEL[deriveTreatmentStatus(t, todayIso)] },
      { header: "Carência (dias)", kind: "number", value: (t) => t.withdrawalDays },
      {
        header: "Fim da carência",
        kind: "date",
        value: (t) => (t.withdrawalDays > 0 ? addDays(t.date, t.withdrawalDays) : null),
      },
      { header: "Responsável", value: (t) => t.responsible ?? null },
      { header: "Custo (R$)", kind: "money", value: (t) => t.costBrl ?? null },
      { header: "Observação", value: (t) => t.notes ?? null },
    ],
    [...treatments].sort(newestFirst)
  );
}

interface ReproductionRow {
  date: string;
  event: "Cobertura" | "Parto";
  type: string | null;
  bull: string | null;
  diagnosis: string | null;
  diagnosisDate: string | null;
  expectedCalving: string | null;
  calf: string | null;
  notes: string | null;
}

/** Coberturas (with their diagnosis) and partos of a female, newest first. */
function reproductionTable(animal: Animal, semenBulls: readonly SemenBull[]): ExportTable {
  const record = animal.reproduction ?? { breedings: [], diagnoses: [], calvings: [] };
  const rows: ReproductionRow[] = [
    ...record.breedings.map((breeding): ReproductionRow => {
      const outcome = breedingOutcome(record, breeding);
      const bull =
        breeding.semenBullId === undefined
          ? undefined
          : semenBulls.find((item) => item.id === breeding.semenBullId);
      return {
        date: breeding.date,
        event: "Cobertura",
        type: BREEDING_TYPE_LABEL[breeding.type],
        bull: bull?.name ?? breeding.bullEarTag,
        diagnosis: DIAGNOSIS_RESULT_LABEL[outcome.result],
        diagnosisDate: outcome.diagnosis?.date ?? null,
        expectedCalving: outcome.expectedCalvingDate,
        calf: null,
        notes: outcome.diagnosis?.notes ?? null,
      };
    }),
    ...record.calvings.map(
      (calving): ReproductionRow => ({
        date: calving.date,
        event: "Parto",
        type: null,
        bull: null,
        diagnosis: null,
        diagnosisDate: null,
        expectedCalving: null,
        calf: calving.calfEarTag,
        notes: null,
      })
    ),
  ].sort(newestFirst);

  return buildTable(
    "Reprodução",
    [
      { header: "Data", kind: "date", value: (r) => r.date },
      { header: "Evento", value: (r) => r.event },
      { header: "Tipo", value: (r) => r.type },
      { header: "Touro", value: (r) => r.bull },
      { header: "Diagnóstico", value: (r) => r.diagnosis },
      { header: "Data do diagnóstico", kind: "date", value: (r) => r.diagnosisDate },
      { header: "Previsão de parto", kind: "date", value: (r) => r.expectedCalving },
      { header: "Bezerro", value: (r) => r.calf },
      { header: "Observação", value: (r) => r.notes },
    ],
    rows
  );
}

/**
 * The ficha of one animal: "Dados", "Pesagens", "Sanidade" and, for a female,
 * "Reprodução". `treatments` are the animal's own (animalTreatments).
 */
export function animalExportTables(
  item: AnimalWithDerived,
  treatments: readonly Treatment[],
  names: AnimalExportNames,
  todayIso: string
): ExportTable[] {
  const tables = [dataTable(item, names, todayIso), animalWeighingsTable(item.animal), healthTable(treatments, todayIso)];
  if (item.animal.sex === "female") tables.push(reproductionTable(item.animal, names.semenBulls));
  return tables;
}
