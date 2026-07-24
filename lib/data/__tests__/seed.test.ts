import { describe, expect, it } from "vitest";
import type { HerdData } from "@/lib/types";
import { TODAY_ISO } from "@/lib/domain/dates";
import { currentDiagnosis } from "@/lib/domain/reproduction";
import { deriveTreatmentStatus } from "@/lib/domain/status";
import { generateInitialData } from "@/lib/data/seed";

function reproductiveSituations(data: HerdData): Map<string, string> {
  const situations = new Map<string, string>();
  for (const animal of data.animals) {
    if (!animal.reproduction) continue;
    const current = currentDiagnosis(animal.reproduction);
    if (current) situations.set(animal.earTag, current.result);
  }
  return situations;
}

describe("generateInitialData", () => {
  const data = generateInitialData();

  it("is deterministic: two calls produce deeply equal data", () => {
    expect(generateInitialData()).toEqual(generateInitialData());
  });

  it("has 39 active animals and 2 inactive consistent with sales", () => {
    const active = data.animals.filter((a) => a.active);
    expect(active).toHaveLength(39);
    expect(data.animals.filter((a) => !a.active)).toHaveLength(2);
    expect(data.movements.filter((m) => m.type === "sale").length).toBeGreaterThanOrEqual(2);
  });

  it("has the expected composition by category among the active animals", () => {
    const active = data.animals.filter((a) => a.active);
    const byCategory = (category: string): number =>
      active.filter((a) => a.category === category).length;
    expect(byCategory("cow")).toBe(13);
    expect(byCategory("heifer")).toBe(6);
    expect(byCategory("steer")).toBe(9);
    expect(byCategory("calf")).toBe(9);
    expect(byCategory("bull")).toBe(2);
  });

  it("has 5 lots and every animal points to a valid lot", () => {
    expect(data.lots).toHaveLength(5);
    const ids = new Set(data.lots.map((l) => l.id));
    for (const animal of data.animals) expect(ids.has(animal.lotId)).toBe(true);
  });

  it("uses unique 4-digit numeric ear tags", () => {
    const earTags = data.animals.map((a) => a.earTag);
    expect(new Set(earTags).size).toBe(earTags.length);
    for (const earTag of earTags) expect(earTag).toMatch(/^\d{4}$/);
  });

  it("every used breed belongs to the breed list and Hereford is registered without use", () => {
    const list = new Set(data.breeds);
    for (const animal of data.animals) expect(list.has(animal.breed)).toBe(true);
    expect(list.has("Hereford")).toBe(true);
    expect(data.animals.some((a) => a.breed === "Hereford")).toBe(false);
  });

  it("every treatment references an existing animal", () => {
    const earTags = new Set(data.animals.map((a) => a.earTag));
    for (const t of data.treatments) expect(earTags.has(t.animalEarTag)).toBe(true);
  });

  it("has between 4 and 8 weighings per animal, sorted asc by date", () => {
    for (const animal of data.animals) {
      expect(animal.weighings.length).toBeGreaterThanOrEqual(4);
      expect(animal.weighings.length).toBeLessThanOrEqual(8);
      for (let i = 1; i < animal.weighings.length; i++) {
        expect(animal.weighings[i - 1].date < animal.weighings[i].date).toBe(true);
      }
    }
  });

  it("no weighing precedes the animal birth date", () => {
    for (const animal of data.animals) {
      for (const w of animal.weighings) expect(w.date >= animal.birthDate).toBe(true);
    }
  });

  it("has exactly 6 treatments with derived status overdue, across distinct animals", () => {
    const overdue = data.treatments.filter(
      (t) => deriveTreatmentStatus(t, TODAY_ISO) === "overdue"
    );
    expect(overdue).toHaveLength(6);
    expect(new Set(overdue.map((t) => t.animalEarTag)).size).toBe(6);
  });

  it("has 7 pregnant females and 3 with a pending diagnosis", () => {
    const situations = [...reproductiveSituations(data).values()];
    expect(situations.filter((s) => s === "pregnant")).toHaveLength(7);
    expect(situations.filter((s) => s === "pending")).toHaveLength(3);
    expect(situations.filter((s) => s === "open")).toHaveLength(4);
  });

  it("every breeding references a real bull of the herd", () => {
    const bulls = new Set(
      data.animals.filter((a) => a.category === "bull").map((a) => a.earTag)
    );
    for (const animal of data.animals) {
      for (const b of animal.reproduction?.breedings ?? []) {
        expect(bulls.has(b.bullEarTag)).toBe(true);
      }
    }
  });

  it("every calving points to a real calf, born on the calving date and in the dam lot", () => {
    const calvings = data.animals.flatMap((dam) =>
      (dam.reproduction?.calvings ?? []).map((calving) => ({ dam, calving }))
    );
    expect(calvings).toHaveLength(5);
    for (const { dam, calving } of calvings) {
      const calf = data.animals.find((a) => a.earTag === calving.calfEarTag);
      expect(calf).toBeDefined();
      expect(calf?.category).toBe("calf");
      expect(calf?.birthDate).toBe(calving.date);
      expect(calf?.lotId).toBe(dam.lotId);
    }
  });

  it("only females have a reproduction record", () => {
    for (const animal of data.animals) {
      if (animal.reproduction) expect(animal.sex).toBe("female");
    }
  });
});
