/**
 * Canonical pt-BR labels of the domain enums, reused by every screen.
 * Single source of truth for the UI text of each enum value; it holds no
 * business rule, only an enum -> text mapping.
 */
import type {
  Category,
  DiagnosisResult,
  Sex,
  BreedingType,
  MovementType,
  TreatmentType,
} from "@/lib/types";

/** Capitalized singular label of each category, e.g.: "Novilha". */
export const CATEGORY_LABEL: Record<Category, string> = {
  calf: "Bezerro",
  heifer: "Novilha",
  steer: "Boi",
  cow: "Vaca",
  bull: "Touro",
};

/** Plural (lowercase) forms of each category, e.g.: "bezerros". */
const CATEGORY_PLURAL: Record<Category, string> = {
  calf: "bezerros",
  heifer: "novilhas",
  steer: "bois",
  cow: "vacas",
  bull: "touros",
};

/**
 * Lowercase category name agreeing with the quantity: singular when
 * n === 1, plural otherwise. E.g.: pluralCategory("steer", 2) === "bois".
 */
export function pluralCategory(category: Category, n: number): string {
  return n === 1 ? category : CATEGORY_PLURAL[category];
}

/** Full sex label, e.g.: "Macho" / "Fêmea". */
export const SEX_LABEL: Record<Sex, string> = {
  male: "Macho",
  female: "Fêmea",
};

/** Short sex abbreviation shown in tables, e.g.: "M" / "F". */
export const SEX_LABEL_SHORT: Record<Sex, string> = {
  male: "M",
  female: "F",
};

/** Full label of each health treatment type, e.g.: "Vermifugação". */
export const TREATMENT_TYPE_LABEL: Record<TreatmentType, string> = {
  vaccine: "Vacina",
  deworming: "Vermifugação",
  medication: "Medicação",
  exam: "Exame",
};

/** Label of each breeding type, e.g.: "Monta natural". */
export const BREEDING_TYPE_LABEL: Record<BreedingType, string> = {
  timedAI: "IATF",
  naturalMating: "Monta natural",
};

/** Label of each pregnancy diagnosis result, e.g.: "Prenhe". */
export const DIAGNOSIS_RESULT_LABEL: Record<DiagnosisResult, string> = {
  pregnant: "Prenhe",
  open: "Vazia",
  pending: "Pendente",
};

/** Label of each animal movement type, e.g.: "Transferência". */
export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  purchase: "Compra",
  sale: "Venda",
  transfer: "Transferência",
};
