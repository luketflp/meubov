import { describe, expect, it } from "vitest";
import type {
  Category,
  DiagnosisResult,
  Sex,
  BreedingType,
  MovementType,
  TreatmentType,
} from "@/lib/types";
import {
  CATEGORY_LABEL,
  DIAGNOSIS_RESULT_LABEL,
  SEX_LABEL,
  SEX_LABEL_SHORT,
  BREEDING_TYPE_LABEL,
  MOVEMENT_TYPE_LABEL,
  TREATMENT_TYPE_LABEL,
  pluralCategory,
} from "@/lib/domain/labels";

describe("CATEGORY_LABEL", () => {
  it("maps each category to the capitalized singular label", () => {
    const expected: Record<Category, string> = {
      calf: "Bezerro",
      heifer: "Novilha",
      steer: "Boi",
      cow: "Vaca",
      bull: "Touro",
    };
    expect(CATEGORY_LABEL).toEqual(expected);
  });
});

describe("pluralCategory", () => {
  it("uses the singular when n === 1", () => {
    expect(pluralCategory("steer", 1)).toBe("steer");
    expect(pluralCategory("cow", 1)).toBe("cow");
  });

  it("uses the plural for n other than 1", () => {
    expect(pluralCategory("steer", 2)).toBe("bois");
    expect(pluralCategory("calf", 0)).toBe("bezerros");
    expect(pluralCategory("heifer", 3)).toBe("novilhas");
    expect(pluralCategory("bull", 5)).toBe("touros");
  });
});

describe("SEX_LABEL / SEX_LABEL_SHORT", () => {
  it("maps sex to the long form", () => {
    const expected: Record<Sex, string> = { male: "Macho", female: "Fêmea" };
    expect(SEX_LABEL).toEqual(expected);
  });

  it("maps sex to the short form", () => {
    const expected: Record<Sex, string> = { male: "M", female: "F" };
    expect(SEX_LABEL_SHORT).toEqual(expected);
  });
});

describe("TREATMENT_TYPE_LABEL", () => {
  it("maps each treatment type", () => {
    const expected: Record<TreatmentType, string> = {
      vaccine: "Vacina",
      deworming: "Vermifugação",
      medication: "Medicação",
      exam: "Exame",
    };
    expect(TREATMENT_TYPE_LABEL).toEqual(expected);
  });
});

describe("BREEDING_TYPE_LABEL", () => {
  it("maps each breeding type", () => {
    const expected: Record<BreedingType, string> = {
      timedAI: "IATF",
      naturalMating: "Monta natural",
    };
    expect(BREEDING_TYPE_LABEL).toEqual(expected);
  });
});

describe("DIAGNOSIS_RESULT_LABEL", () => {
  it("maps each diagnosis result", () => {
    const expected: Record<DiagnosisResult, string> = {
      pregnant: "Prenhe",
      open: "Vazia",
      pending: "Pendente",
    };
    expect(DIAGNOSIS_RESULT_LABEL).toEqual(expected);
  });
});

describe("MOVEMENT_TYPE_LABEL", () => {
  it("maps each movement type", () => {
    const expected: Record<MovementType, string> = {
      purchase: "Compra",
      sale: "Venda",
      transfer: "Transferência",
    };
    expect(MOVEMENT_TYPE_LABEL).toEqual(expected);
  });
});
