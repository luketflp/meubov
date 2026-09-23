import { describe, expect, it } from "vitest";
import { entryDatesByEarTag, herdDeclaration, presentOn } from "@/lib/reports/declaration";
import { makeAnimal, makeManejoSession } from "@/lib/domain/__tests__/fixtures";
import { makeData } from "./data";

const BASE = "2026-09-22";
const SINCE = "2026-01-01";

describe("entryDatesByEarTag", () => {
  it("maps each animal an entry registered to the entry's date", () => {
    const sessions = [
      makeManejoSession({
        id: "e1",
        kind: "entry",
        date: "2026-03-05",
        animals: [
          { earTag: "C-1", outcome: "done", createdAnimal: true },
          { earTag: "C-2", outcome: "done" },
          { earTag: "C-3", outcome: "pending", createdAnimal: true },
        ],
      }),
      makeManejoSession({
        id: "w1",
        kind: "weighing",
        date: "2026-04-01",
        animals: [{ earTag: "C-4", outcome: "done", createdAnimal: true }],
      }),
    ];
    expect(entryDatesByEarTag(sessions)).toEqual(new Map([["C-1", "2026-03-05"]]));
  });
});

describe("presentOn", () => {
  const none = new Map<string, string>();

  it("counts an animal from its birth on", () => {
    const animal = makeAnimal({ birthDate: "2026-05-10" });
    expect(presentOn(animal, "2026-05-09", none)).toBe(false);
    expect(presentOn(animal, "2026-05-10", none)).toBe(true);
  });

  it("counts a bought animal from its entry, not its birth", () => {
    const animal = makeAnimal({ earTag: "C-1", birthDate: "2024-01-01" });
    const entries = new Map([["C-1", "2026-03-05"]]);
    expect(presentOn(animal, "2026-03-04", entries)).toBe(false);
    expect(presentOn(animal, "2026-03-05", entries)).toBe(true);
  });

  it("drops an animal on the day it left", () => {
    const animal = makeAnimal({
      active: false,
      inactiveReason: "sale",
      inactiveDate: "2026-06-01",
    });
    expect(presentOn(animal, "2026-05-31", none)).toBe(true);
    expect(presentOn(animal, "2026-06-01", none)).toBe(false);
  });

  it("treats an inactive animal with no exit date as gone", () => {
    const animal = makeAnimal({ active: false, inactiveReason: "other" });
    expect(presentOn(animal, "2026-06-01", none)).toBe(false);
  });

  it("treats an animal with no birth date as always there", () => {
    const animal = makeAnimal({ birthDate: "" });
    expect(presentOn(animal, "2000-01-01", none)).toBe(true);
  });
});

describe("herdDeclaration", () => {
  it("splits the present herd by sex and age band at the base date", () => {
    const data = makeData({
      animals: [
        makeAnimal({ id: "a", earTag: "A", sex: "male", category: "calf", birthDate: "2025-09-22" }), // 12 m
        makeAnimal({ id: "b", earTag: "B", sex: "female", category: "heifer", birthDate: "2025-09-21" }), // 12 m
        makeAnimal({ id: "c", earTag: "C", sex: "female", category: "heifer", birthDate: "2024-09-21" }), // 24 m
        makeAnimal({ id: "d", earTag: "D", sex: "male", category: "steer", birthDate: "2024-08-01" }), // 25 m
        makeAnimal({ id: "e", earTag: "E", sex: "female", category: "cow", birthDate: "2023-09-22" }), // 36 m
        makeAnimal({ id: "f", earTag: "F", sex: "male", category: "bull", birthDate: "2020-01-01" }),
      ],
    });
    const report = herdDeclaration(data, BASE, SINCE);
    expect(report.baseDate).toBe(BASE);
    expect(report.since).toBe(SINCE);
    expect(report.bands).toEqual([
      { label: "0 a 12 meses", males: 1, females: 1 },
      { label: "13 a 24 meses", males: 0, females: 1 },
      { label: "25 a 36 meses", males: 1, females: 1 },
      { label: "Acima de 36 meses", males: 1, females: 0 },
    ]);
    expect(report.undated).toBe(0);
  });

  it("places animals with no birth date by category and counts them", () => {
    const data = makeData({
      animals: [
        makeAnimal({ id: "a", earTag: "A", sex: "male", category: "calf", birthDate: "" }),
        makeAnimal({ id: "b", earTag: "B", sex: "female", category: "heifer", birthDate: "" }),
        makeAnimal({ id: "c", earTag: "C", sex: "male", category: "steer", birthDate: "" }),
        makeAnimal({ id: "d", earTag: "D", sex: "female", category: "cow", birthDate: "" }),
        makeAnimal({ id: "e", earTag: "E", sex: "male", category: "bull", birthDate: "" }),
      ],
    });
    const report = herdDeclaration(data, BASE, SINCE);
    expect(report.bands.map((band) => [band.males, band.females])).toEqual([
      [1, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
    expect(report.undated).toBe(5);
  });

  it("counts by category in fixed order, keeping empty categories", () => {
    const data = makeData({
      animals: [
        makeAnimal({ id: "a", earTag: "A", sex: "female", category: "cow" }),
        makeAnimal({ id: "b", earTag: "B", sex: "female", category: "cow" }),
        makeAnimal({ id: "c", earTag: "C", sex: "male", category: "calf" }),
        makeAnimal({ id: "d", earTag: "D", sex: "female", category: "calf" }),
        makeAnimal({
          id: "x",
          earTag: "X",
          category: "steer",
          active: false,
          inactiveReason: "sale",
          inactiveDate: "2026-02-01",
        }),
      ],
    });
    expect(herdDeclaration(data, BASE, SINCE).byCategory).toEqual([
      { category: "calf", males: 1, females: 1 },
      { category: "heifer", males: 0, females: 0 },
      { category: "cow", males: 0, females: 2 },
      { category: "steer", males: 0, females: 0 },
      { category: "bull", males: 0, females: 0 },
    ]);
  });

  it("walks the herd from the since date to the base date", () => {
    const data = makeData({
      animals: [
        // There all along.
        makeAnimal({ id: "cow", earTag: "V-1", sex: "female", category: "cow", birthDate: "2020-01-01",
          reproduction: {
            breedings: [],
            diagnoses: [],
            calvings: [
              { date: "2026-04-10", calfEarTag: "B-1" },
              { date: "2025-12-31", calfEarTag: "B-0" },
            ],
          },
        }),
        // Born in the window.
        makeAnimal({ id: "b1", earTag: "B-1", category: "calf", birthDate: "2026-04-10" }),
        // Born before: part of the start.
        makeAnimal({ id: "b0", earTag: "B-0", category: "calf", birthDate: "2025-12-31" }),
        // Bought in the window.
        makeAnimal({ id: "c1", earTag: "C-1", category: "steer", birthDate: "2024-01-01" }),
        // Sold, died, lost and gone for another reason in the window.
        makeAnimal({ id: "s1", earTag: "S-1", active: false, inactiveReason: "sale", inactiveDate: "2026-06-01" }),
        makeAnimal({ id: "d1", earTag: "D-1", active: false, inactiveReason: "death", inactiveDate: "2026-02-01" }),
        makeAnimal({ id: "l1", earTag: "L-1", active: false, inactiveReason: "loss", inactiveDate: "2026-02-02" }),
        makeAnimal({ id: "o1", earTag: "O-1", active: false, inactiveReason: "other", inactiveDate: "2026-02-03" }),
        // Sold after the base date: still present on it.
        makeAnimal({ id: "s2", earTag: "S-2", active: false, inactiveReason: "sale", inactiveDate: "2026-10-01" }),
        // Sold before the window: in neither.
        makeAnimal({ id: "s3", earTag: "S-3", active: false, inactiveReason: "sale", inactiveDate: "2025-06-01" }),
      ],
      manejoSessions: [
        makeManejoSession({
          id: "e1",
          kind: "entry",
          date: "2026-03-05",
          animals: [{ earTag: "C-1", outcome: "done", createdAnimal: true }],
        }),
      ],
    });
    const { flow } = herdDeclaration(data, BASE, SINCE);
    // Start: V-1, B-0, S-1, D-1, L-1, O-1, S-2 = 7. End: V-1, B-1, B-0, C-1, S-2 = 5.
    expect(flow).toEqual({
      start: 7,
      births: 1,
      purchases: 1,
      sales: 1,
      deaths: 2,
      others: 1,
      adjustment: 0,
      end: 5,
    });
  });

  it("puts a hand-registered animal that does not add up in the adjustment", () => {
    const data = makeData({
      animals: [
        makeAnimal({ id: "a", earTag: "A", birthDate: "2020-01-01" }),
        // Registered by hand as born in the window, with no calving on a dam.
        makeAnimal({ id: "h", earTag: "H", category: "calf", birthDate: "2026-05-01" }),
      ],
    });
    const { flow } = herdDeclaration(data, BASE, SINCE);
    expect(flow.start).toBe(1);
    expect(flow.births).toBe(0);
    expect(flow.end).toBe(2);
    expect(flow.adjustment).toBe(1);
  });

  it("leaves out calvings and exits on the since date itself", () => {
    const data = makeData({
      animals: [
        makeAnimal({
          id: "v",
          earTag: "V",
          sex: "female",
          category: "cow",
          birthDate: "2020-01-01",
          reproduction: { breedings: [], diagnoses: [], calvings: [{ date: SINCE, calfEarTag: "B" }] },
        }),
        makeAnimal({ id: "b", earTag: "B", category: "calf", birthDate: SINCE }),
        makeAnimal({ id: "s", earTag: "S", active: false, inactiveReason: "sale", inactiveDate: SINCE }),
      ],
    });
    const { flow } = herdDeclaration(data, BASE, SINCE);
    expect(flow).toMatchObject({ start: 2, births: 0, sales: 0, end: 2, adjustment: 0 });
  });
});
