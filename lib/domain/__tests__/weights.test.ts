import { describe, expect, it } from "vitest";
import { KG_PER_ARROBA, kgToArroba, currentWeight, totalWeightKg } from "@/lib/domain/weights";
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
