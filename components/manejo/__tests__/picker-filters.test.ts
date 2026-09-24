import { describe, expect, it } from "vitest";
import {
  categoryCounts,
  lotCounts,
  matchesPicker,
  pickedLabel,
  togglePicked,
} from "@/components/manejo/picker-filters";
import type { Category } from "@/lib/types";

const cattle = (lotId: string, category: Category) => ({ lotId, category });
const herd = [
  cattle("re", "calf"),
  cattle("re", "heifer"),
  cattle("re", "heifer"),
  cattle("ga", "steer"),
  cattle("ga", "steer"),
  cattle("mc", "cow"),
];

describe("matchesPicker", () => {
  it("takes every animal when nothing is picked", () => {
    expect(herd.filter((a) => matchesPicker(a, { lotIds: [], categories: [] }))).toHaveLength(6);
  });

  it("takes the animals of any picked lote", () => {
    const picked = herd.filter((a) => matchesPicker(a, { lotIds: ["re", "ga"], categories: [] }));
    expect(picked).toHaveLength(5);
  });

  it("crosses the picked lotes with the picked categorias", () => {
    const picked = herd.filter((a) =>
      matchesPicker(a, { lotIds: ["re", "ga"], categories: ["heifer", "cow"] })
    );
    expect(picked).toEqual([cattle("re", "heifer"), cattle("re", "heifer")]);
  });
});

describe("lotCounts and categoryCounts", () => {
  it("counts each lote inside the picked categorias", () => {
    expect(lotCounts(herd, ["steer", "cow"])).toEqual(new Map([["ga", 2], ["mc", 1]]));
    expect(lotCounts(herd, []).get("re")).toBe(3);
  });

  it("counts each categoria inside the picked lotes", () => {
    expect(categoryCounts(herd, ["re"])).toEqual(new Map([["calf", 1], ["heifer", 2]]));
    expect(categoryCounts(herd, []).get("steer")).toBe(2);
  });
});

describe("pickedLabel", () => {
  const names = ["Recria · Inv. 04", "Garrotes · Inv. 02", "Matrizes · Inv. 01"];
  const short = ["Recria", "Garrotes", "Matrizes"];

  it("reads the all option when nothing is picked", () => {
    expect(pickedLabel([], [], "Todos os lotes", "lotes")).toBe("Todos os lotes");
  });

  it("names one pick in full", () => {
    expect(pickedLabel(names.slice(0, 1), short.slice(0, 1), "Todos os lotes", "lotes")).toBe(
      "Recria · Inv. 04"
    );
  });

  it("names two picks by their short names", () => {
    expect(pickedLabel(names.slice(0, 2), short.slice(0, 2), "Todos os lotes", "lotes")).toBe(
      "Recria, Garrotes"
    );
  });

  it("counts three picks or more", () => {
    expect(pickedLabel(names, short, "Todos os lotes", "lotes")).toBe("3 lotes");
  });
});

describe("togglePicked", () => {
  it("adds a missing value and drops a present one", () => {
    expect(togglePicked(["re"], "ga")).toEqual(["re", "ga"]);
    expect(togglePicked(["re", "ga"], "re")).toEqual(["ga"]);
  });
});
