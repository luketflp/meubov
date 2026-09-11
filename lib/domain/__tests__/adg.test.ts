import { describe, expect, it } from "vitest";
import { calculateAdg, herdAdgSamples, herdAverageAdg, monthlyAdg } from "@/lib/domain/adg";
import { makeAnimal } from "./fixtures";

describe("calculateAdg", () => {
  it("returns null with fewer than 2 weighings", () => {
    expect(calculateAdg([])).toBeNull();
    expect(calculateAdg([{ date: "2026-07-01", weightKg: 300 }])).toBeNull();
  });

  it("returns null with 0 days between weighings", () => {
    expect(
      calculateAdg([
        { date: "2026-07-01", weightKg: 300 },
        { date: "2026-07-01", weightKg: 310 },
      ])
    ).toBeNull();
  });

  it("computes (last - first) / days", () => {
    expect(
      calculateAdg([
        { date: "2026-05-01", weightKg: 300 },
        { date: "2026-06-30", weightKg: 360 },
      ])
    ).toBe(1);
  });
});

describe("monthlyAdg", () => {
  const adg1Weighings = [
    { date: "2026-05-01", weightKg: 300 },
    { date: "2026-06-30", weightKg: 360 },
  ];

  it("generates the labels of the last months up to the reference", () => {
    const series = monthlyAdg([], 3, "2026-07-24");
    expect(series.map((p) => p.month)).toEqual(["mai/26", "jun/26", "jul/26"]);
  });

  it("averages across animals with a computable ADG", () => {
    const animalA = makeAnimal({ weighings: adg1Weighings });
    const animalB = makeAnimal({
      earTag: "BR-002",
      weighings: [
        { date: "2026-05-01", weightKg: 300 },
        { date: "2026-06-30", weightKg: 330 },
      ],
    });
    const series = monthlyAdg([animalA, animalB], 1, "2026-07-24");
    expect(series[0].month).toBe("jul/26");
    expect(series[0].averageAdg).toBeCloseTo(0.75, 5);
  });

  it("returns null in a month without animals with 2 weighings in the window", () => {
    const oneWeighing = makeAnimal({ weighings: [{ date: "2026-07-01", weightKg: 300 }] });
    const series = monthlyAdg([oneWeighing], 1, "2026-07-24");
    expect(series[0].averageAdg).toBeNull();
  });

  it("ignores weighings outside the 120-day lookback window", () => {
    const animal = makeAnimal({
      weighings: [
        { date: "2026-01-10", weightKg: 250 },
        { date: "2026-07-01", weightKg: 400 },
      ],
    });
    const series = monthlyAdg([animal], 1, "2026-07-24");
    expect(series[0].averageAdg).toBeNull();
  });

  it("ignores inactive animals", () => {
    const inactive = makeAnimal({ active: false, weighings: adg1Weighings });
    const series = monthlyAdg([inactive], 1, "2026-07-24");
    expect(series[0].averageAdg).toBeNull();
  });
});

describe("herdAdgSamples / herdAverageAdg", () => {
  const today = "2026-09-10";
  const animals = [
    makeAnimal({
      id: "a1",
      weighings: [
        { date: "2026-05-15", weightKg: 300 },
        { date: "2026-08-28", weightKg: 360 },
      ],
    }),
    makeAnimal({
      id: "a2",
      weighings: [
        { date: "2026-06-01", weightKg: 200 },
        { date: "2026-07-01", weightKg: 230 },
      ],
    }),
    makeAnimal({ id: "a3", weighings: [{ date: "2026-08-01", weightKg: 250 }] }),
    makeAnimal({
      id: "a4",
      active: false,
      weighings: [
        { date: "2026-06-01", weightKg: 200 },
        { date: "2026-07-01", weightKg: 300 },
      ],
    }),
    makeAnimal({
      id: "a5",
      weighings: [
        { date: "2026-01-01", weightKg: 200 },
        { date: "2026-08-01", weightKg: 300 },
      ],
    }),
  ];

  it("lists one ADG per active animal with two weighings inside the window", () => {
    const samples = herdAdgSamples(animals, today);
    expect(samples).toHaveLength(2);
    expect(samples[0]).toBeCloseTo(60 / 105, 6);
    expect(samples[1]).toBe(1);
  });

  it("is what herdAverageAdg averages", () => {
    expect(herdAverageAdg(animals, today)).toBeCloseTo((60 / 105 + 1) / 2, 6);
    expect(herdAverageAdg([animals[2]], today)).toBeNull();
    expect(herdAdgSamples([animals[2]], today)).toEqual([]);
  });
});
