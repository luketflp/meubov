import { describe, expect, it } from "vitest";
import {
  KG_PER_ARROBA,
  kgToArroba,
  currentWeight,
  totalWeightKg,
  weighingError,
} from "@/lib/domain/weights";
import { makeAnimal } from "./fixtures";

describe("kgToArroba", () => {
  it("converts at 30 kg per arroba", () => {
    expect(KG_PER_ARROBA).toBe(30);
    expect(kgToArroba(450)).toBe(15);
  });
});

describe("currentWeight", () => {
  it("returns null without weighings", () => {
    expect(currentWeight(makeAnimal())).toBeNull();
  });

  it("returns the last weighing", () => {
    const animal = makeAnimal({
      weighings: [
        { date: "2026-05-01", weightKg: 300 },
        { date: "2026-07-01", weightKg: 512 },
      ],
    });
    expect(currentWeight(animal)).toBe(512);
  });
});

describe("totalWeightKg", () => {
  it("sums only active animals", () => {
    const active = makeAnimal({ weighings: [{ date: "2026-07-01", weightKg: 500 }] });
    const inactive = makeAnimal({
      earTag: "BR-002",
      active: false,
      weighings: [{ date: "2026-07-01", weightKg: 400 }],
    });
    expect(totalWeightKg([active, inactive])).toBe(500);
  });

  it("counts 0 for an active animal without weighings", () => {
    expect(totalWeightKg([makeAnimal()])).toBe(0);
  });
});

describe("weighingError", () => {
  const bounds = { birthDate: "2025-03-10", todayIso: "2026-09-13" };

  it("accepts a weight above zero dated between birth and today", () => {
    expect(weighingError({ date: "2026-05-01", weightKg: 312.5 }, bounds)).toBeNull();
    expect(weighingError({ date: "2025-03-10", weightKg: 31 }, bounds)).toBeNull();
    expect(weighingError({ date: "2026-09-13", weightKg: 420 }, bounds)).toBeNull();
  });

  it("refuses a weight of zero or less, or not a number", () => {
    expect(weighingError({ date: "2026-05-01", weightKg: 0 }, bounds)).toBe(
      "Informe um peso maior que zero."
    );
    expect(weighingError({ date: "2026-05-01", weightKg: Number.NaN }, bounds)).toBe(
      "Informe um peso maior que zero."
    );
  });

  it("refuses a date that is missing or malformed", () => {
    expect(weighingError({ date: "", weightKg: 300 }, bounds)).toBe("Informe uma data válida.");
    expect(weighingError({ date: "13/09/2026", weightKg: 300 }, bounds)).toBe(
      "Informe uma data válida."
    );
  });

  it("refuses a date in the future", () => {
    expect(weighingError({ date: "2026-09-14", weightKg: 300 }, bounds)).toBe(
      "A pesagem não pode ser no futuro."
    );
  });

  it("refuses a date before the animal was born", () => {
    expect(weighingError({ date: "2025-03-09", weightKg: 30 }, bounds)).toBe(
      "A pesagem não pode ser anterior ao nascimento do animal."
    );
  });
});
