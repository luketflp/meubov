import { describe, expect, it } from "vitest";
import {
  KG_PER_AU,
  classifyStockingRate,
  stockingRateAuPerHa,
  totalAu,
} from "@/lib/domain/stocking";
import { makeAnimal } from "./fixtures";

describe("totalAu", () => {
  it("converts live weight into AU at 450 kg", () => {
    expect(KG_PER_AU).toBe(450);
    const animal = makeAnimal({ weighings: [{ date: "2026-07-01", weightKg: 450 }] });
    expect(totalAu([animal])).toBe(1);
  });

  it("ignores inactive animals", () => {
    const inactive = makeAnimal({
      active: false,
      weighings: [{ date: "2026-07-01", weightKg: 450 }],
    });
    expect(totalAu([inactive])).toBe(0);
  });
});

describe("stockingRateAuPerHa", () => {
  it("divides total AU by hectares", () => {
    const animals = [
      makeAnimal({ weighings: [{ date: "2026-07-01", weightKg: 450 }] }),
      makeAnimal({ earTag: "BR-002", weighings: [{ date: "2026-07-01", weightKg: 450 }] }),
    ];
    expect(stockingRateAuPerHa(animals, 2)).toBe(1);
  });

  it("returns 0 for invalid hectares", () => {
    expect(stockingRateAuPerHa([makeAnimal()], 0)).toBe(0);
  });
});

describe("classifyStockingRate", () => {
  it("classifies high from 1.6 inclusive", () => {
    expect(classifyStockingRate(1.6)).toBe("high");
    expect(classifyStockingRate(2.2)).toBe("high");
    expect(classifyStockingRate(1.59)).toBe("good");
  });

  it("classifies good from 0.9 inclusive", () => {
    expect(classifyStockingRate(0.9)).toBe("good");
    expect(classifyStockingRate(0.89)).toBe("light");
  });

  it("classifies light below 0.9", () => {
    expect(classifyStockingRate(0.5)).toBe("light");
  });
});
