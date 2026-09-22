import { describe, expect, it } from "vitest";
import type { Birth } from "@/lib/store/selectors";
import { makeAnimal } from "@/lib/domain/__tests__/fixtures";
import {
  DEFAULT_BIRTH_SORT,
  nextBirthSort,
  sortBirths,
} from "@/components/births/sort-births";

function birth(
  key: string,
  overrides: {
    date?: string;
    calfEarTag?: string;
    sex?: "male" | "female";
    breed?: string;
    damEarTag?: string;
    damLotId?: string;
    birthWeightKg?: number | null;
    orphan?: boolean;
  } = {}
): Birth {
  const calfEarTag = overrides.calfEarTag ?? key;
  return {
    key,
    date: overrides.date ?? "2026-08-01",
    dam: makeAnimal({
      id: `dam-${key}`,
      earTag: overrides.damEarTag ?? "M-1",
      sex: "female",
      lotId: overrides.damLotId ?? "lot-1",
    }),
    calfEarTag,
    calf: overrides.orphan
      ? null
      : makeAnimal({
          id: `calf-${key}`,
          earTag: calfEarTag,
          sex: overrides.sex ?? "male",
          breed: overrides.breed ?? "Nelore",
        }),
    birthWeightKg: overrides.birthWeightKg === undefined ? 30 : overrides.birthWeightKg,
  };
}

const lotNames = new Map([
  ["lot-1", "Maternidade"],
  ["lot-2", "Bezerras"],
]);

const keys = (births: Birth[]) => births.map((b) => b.key);

describe("sortBirths", () => {
  it("defaults to newest first", () => {
    const births = [
      birth("a", { date: "2026-07-01" }),
      birth("b", { date: "2026-09-01" }),
      birth("c", { date: "2026-08-01" }),
    ];
    expect(keys(sortBirths(births, DEFAULT_BIRTH_SORT, lotNames))).toEqual(["b", "c", "a"]);
  });

  it("sorts by the dam's lot name, and by ear tag numerically", () => {
    const births = [
      birth("a", { damLotId: "lot-1" }),
      birth("b", { damLotId: "lot-2" }),
      birth("c", { damLotId: "gone" }),
    ];
    expect(keys(sortBirths(births, { column: "lot", direction: "asc" }, lotNames))).toEqual([
      "c",
      "b",
      "a",
    ]);

    const tagged = [birth("x", { calfEarTag: "B-10" }), birth("y", { calfEarTag: "B-9" })];
    expect(keys(sortBirths(tagged, { column: "calf", direction: "asc" }, lotNames))).toEqual([
      "y",
      "x",
    ]);
  });

  it("puts births without a weight below the lightest one", () => {
    const births = [
      birth("a", { birthWeightKg: 32 }),
      birth("b", { birthWeightKg: null }),
      birth("c", { birthWeightKg: 28 }),
    ];
    expect(keys(sortBirths(births, { column: "weight", direction: "desc" }, lotNames))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("breaks ties newest first, then by calf ear tag", () => {
    const births = [
      birth("a", { calfEarTag: "B-2", date: "2026-08-01", damEarTag: "M-1" }),
      birth("b", { calfEarTag: "B-1", date: "2026-08-01", damEarTag: "M-1" }),
      birth("c", { calfEarTag: "B-3", date: "2026-09-01", damEarTag: "M-1" }),
    ];
    expect(keys(sortBirths(births, { column: "dam", direction: "desc" }, lotNames))).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("does not mutate the list", () => {
    const births = [birth("a", { date: "2026-07-01" }), birth("b", { date: "2026-09-01" })];
    sortBirths(births, DEFAULT_BIRTH_SORT, lotNames);
    expect(keys(births)).toEqual(["a", "b"]);
  });
});

describe("nextBirthSort", () => {
  it("starts a new column ascending, flips the same one", () => {
    expect(nextBirthSort(DEFAULT_BIRTH_SORT, "dam")).toEqual({ column: "dam", direction: "asc" });
    expect(nextBirthSort({ column: "dam", direction: "asc" }, "dam")).toEqual({
      column: "dam",
      direction: "desc",
    });
  });

  it("goes back to newest first after the third click", () => {
    expect(nextBirthSort({ column: "dam", direction: "desc" }, "dam")).toEqual(DEFAULT_BIRTH_SORT);
  });

  it("flips the date column from the default", () => {
    expect(nextBirthSort(DEFAULT_BIRTH_SORT, "date")).toEqual({ column: "date", direction: "asc" });
    expect(nextBirthSort({ column: "date", direction: "asc" }, "date")).toEqual(DEFAULT_BIRTH_SORT);
  });
});
