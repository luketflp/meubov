import { describe, expect, it } from "vitest";
import type {
  Animal,
  Breeding,
  Calving,
  Lot,
  ManejoSessionAnimal,
  PregnancyDiagnosis,
  ReproductionRecord,
} from "@/lib/types";
import {
  awaitsDiagnosis,
  breteRows,
  pendingDiagnosisCount,
  searchUltrasound,
  ultrasoundGroups,
} from "@/lib/domain/ultrasound";
import { makeAnimal, makeManejoSession, makeSemenBull } from "./fixtures";

/** Fixed reference date for deterministic assertions. */
const TODAY_ISO = "2026-09-12";

function breeding(id: string, date: string, over: Partial<Breeding> = {}): Breeding {
  return { id, date, type: "timedAI", bullEarTag: "NEL-4471", semenBullId: "bull-1", ...over };
}

function record(
  breedings: Breeding[],
  diagnoses: PregnancyDiagnosis[] = [],
  calvings: Calving[] = []
): ReproductionRecord {
  return { breedings, diagnoses, calvings };
}

function dam(earTag: string, reproduction: ReproductionRecord, over: Partial<Animal> = {}): Animal {
  return makeAnimal({
    id: `id-${earTag}`,
    earTag,
    category: "cow",
    sex: "female",
    reproduction,
    ...over,
  });
}

const diagnosed = (breedingId: string, result: PregnancyDiagnosis["result"]): PregnancyDiagnosis => ({
  breedingId,
  result,
  date: "2026-08-20",
});

const passed = (earTag: string, breedingId: string): ManejoSessionAnimal => ({
  earTag,
  outcome: "done",
  breedingId,
});

describe("awaitsDiagnosis", () => {
  const b1 = breeding("b1", "2026-07-01");

  it("is true for the latest cobertura of an active dam with no diagnosis", () => {
    expect(awaitsDiagnosis(record([b1]), b1, true)).toBe(true);
  });

  it("is false once the dam left the herd", () => {
    expect(awaitsDiagnosis(record([b1]), b1, false)).toBe(false);
  });

  it("is false once the cobertura is diagnosed pregnant or open", () => {
    expect(awaitsDiagnosis(record([b1], [diagnosed("b1", "pregnant")]), b1, true)).toBe(false);
    expect(awaitsDiagnosis(record([b1], [diagnosed("b1", "open")]), b1, true)).toBe(false);
  });

  it("keeps waiting while the recorded result is still pending", () => {
    expect(awaitsDiagnosis(record([b1], [diagnosed("b1", "pending")]), b1, true)).toBe(true);
  });

  it("is false for an older cobertura of a dam bred again since", () => {
    const b2 = breeding("b2", "2026-08-15");
    expect(awaitsDiagnosis(record([b1, b2]), b1, true)).toBe(false);
    expect(awaitsDiagnosis(record([b1, b2]), b2, true)).toBe(true);
  });

  it("is false when a calving was recorded on or after the cobertura", () => {
    const calved = (date: string) => record([b1], [], [{ date, calfEarTag: "BR-2001" }]);
    expect(awaitsDiagnosis(calved("2026-07-01"), b1, true)).toBe(false);
    expect(awaitsDiagnosis(calved("2026-06-30"), b1, true)).toBe(true);
  });
});

describe("ultrasoundGroups", () => {
  const tufao = makeSemenBull({ id: "bull-1", name: "Tufão da Serra" });
  const lots: Lot[] = [
    { id: "lot-1", name: "Matrizes" },
    { id: "lot-2", name: "Lote 10" },
    { id: "lot-3", name: "Lote 2" },
    { id: "lot-4", name: "Novilhas" },
  ];

  // Inseminação of 01/07: one cow awaiting, three diagnosed, one sold undiagnosed.
  const b001 = dam("B-001", record([breeding("b1", "2026-07-01")], [diagnosed("b1", "pregnant")]), {
    lotId: "lot-1",
  });
  const b002 = dam("B-002", record([breeding("b2", "2026-07-01")], [diagnosed("b2", "open")]), {
    lotId: "lot-2",
  });
  const b003 = dam("B-003", record([breeding("b3", "2026-07-01")]), { lotId: "lot-2" });
  const b004 = dam("B-004", record([breeding("b4", "2026-07-01")]), { active: false });
  const b005 = dam("B-005", record([breeding("b5", "2026-07-01")], [diagnosed("b5", "pregnant")]), {
    lotId: "lot-4",
  });
  const oldSession = makeManejoSession({
    id: "s-old",
    date: "2026-07-01",
    animals: [
      passed("B-001", "b1"),
      passed("B-002", "b2"),
      passed("B-003", "b3"),
      passed("B-004", "b4"),
      passed("B-005", "b5"),
      { earTag: "B-009", outcome: "skipped" },
    ],
  });

  // Inseminação of 01/08: both cows still awaiting.
  const b011 = dam("B-011", record([breeding("b11", "2026-08-01")]), { lotId: "lot-3" });
  const b010 = dam("B-010", record([breeding("b10", "2026-08-01")]), { lotId: "lot-3" });
  const newSession = makeManejoSession({
    id: "s-new",
    date: "2026-08-01",
    animals: [passed("B-011", "b11"), passed("B-010", "b10")],
  });

  // Inseminação of 01/06: every cow diagnosed, nothing left to do.
  const b020 = dam("B-020", record([breeding("b20", "2026-06-01")], [diagnosed("b20", "pregnant")]));
  const doneSession = makeManejoSession({
    id: "s-done",
    date: "2026-06-01",
    status: "closed",
    animals: [passed("B-020", "b20")],
  });

  // Coberturas no inseminação wrote.
  const b030 = dam(
    "B-030",
    record([
      breeding("b30", "2026-08-20", { type: "naturalMating", bullEarTag: "T-10", semenBullId: undefined }),
    ])
  );
  const b031 = dam("B-031", record([breeding("b31", "2026-08-01")], [diagnosed("b31", "open")]));
  const b032 = dam(
    "B-032",
    record([breeding("b32", "2026-05-01"), breeding("b33", "2026-08-01")], [diagnosed("b33", "pregnant")])
  );
  // A dam whose lote resolves to nothing.
  const b040 = dam("B-040", record([breeding("b40", "2026-08-10")]), { lotId: "lot-gone" });

  const animals = [b001, b002, b003, b004, b005, b011, b010, b020, b030, b031, b032, b040];
  const sessions = [newSession, doneSession, oldSession];

  const groups = () => ultrasoundGroups(animals, sessions, [tufao], lots, TODAY_ISO);

  it("groups by the lote each cow is in today, by name, with the unknown lote last", () => {
    expect(groups().map((g) => [g.key, g.name])).toEqual([
      ["lot-3", "Lote 2"],
      ["lot-2", "Lote 10"],
      ["lot-1", "Matrizes"],
      ["sem-lote", null],
    ]);
    expect(groups()[3].lotId).toBeNull();
  });

  it("lists a lote's waiting cows first, then those diagnosed from an inseminação still going, by ear tag", () => {
    const byKey = new Map(groups().map((g) => [g.key, g]));

    expect(byKey.get("lot-2")?.rows.map((r) => [r.dam.earTag, r.result])).toEqual([
      ["B-003", "pending"],
      ["B-002", "open"],
    ]);
    expect(byKey.get("lot-1")?.rows.map((r) => [r.dam.earTag, r.result])).toEqual([
      ["B-030", "pending"],
      ["B-001", "pregnant"],
    ]);
    expect(byKey.get("lot-3")?.rows.map((r) => r.dam.earTag)).toEqual(["B-010", "B-011"]);
  });

  it("counts each lote's waiting, pregnant and open cows", () => {
    const [second, tenth, matrizes] = groups();

    expect([second.pending, second.pregnant, second.open]).toEqual([2, 0, 0]);
    expect([tenth.pending, tenth.pregnant, tenth.open]).toEqual([1, 0, 1]);
    expect([matrizes.pending, matrizes.pregnant, matrizes.open]).toEqual([1, 1, 0]);
  });

  it("resolves the registered bull and the days of each row", () => {
    const tenth = groups()[1];
    const row = tenth.rows[0];

    expect(row.dam).toBe(b003);
    expect(row.breeding.id).toBe("b3");
    expect(row.bull).toBe(tufao);
    expect(row.days).toBe(73);

    const loose = groups()[2].rows[0];
    expect(loose.dam).toBe(b030);
    expect(loose.bull).toBeNull();
    expect(loose.days).toBe(23);
  });

  it("drops a lote with no cow left waiting", () => {
    expect(groups().some((g) => g.key === "lot-4")).toBe(false);
    expect(ultrasoundGroups([b020], [doneSession], [tufao], lots, TODAY_ISO)).toEqual([]);
  });

  it("adds up every cobertura awaiting diagnosis", () => {
    expect(pendingDiagnosisCount(groups())).toBe(5);
    expect(pendingDiagnosisCount([])).toBe(0);
  });
});

describe("searchUltrasound", () => {
  const lots: Lot[] = [
    { id: "lot-1", name: "Matrizes" },
    { id: "lot-2", name: "Novilhas" },
  ];
  const b1 = dam("B-001", record([breeding("b1", "2026-07-01")]));
  const b2 = dam("B-002", record([breeding("b2", "2026-07-01")], [diagnosed("b2", "open")]));
  const b10 = dam("B-010", record([breeding("b10", "2026-08-01")]), { lotId: "lot-2" });
  const session = makeManejoSession({
    id: "s-1",
    date: "2026-07-01",
    animals: [passed("B-001", "b1"), passed("B-002", "b2")],
  });
  const groups = ultrasoundGroups([b1, b2, b10], [session], [], lots, TODAY_ISO);

  it("keeps every group without a search term", () => {
    expect(searchUltrasound(groups, "  ")).toEqual(groups);
  });

  it("filters the rows by ear tag, ignoring case, and drops the empty groups", () => {
    const found = searchUltrasound(groups, " b-01");

    expect(found.map((g) => g.key)).toEqual(["lot-2"]);
    expect(found[0].rows.map((r) => r.dam.earTag)).toEqual(["B-010"]);
  });

  it("counts only the rows left by the search", () => {
    const [group] = searchUltrasound(groups, "002");

    expect(group.rows.map((r) => r.dam.earTag)).toEqual(["B-002"]);
    expect([group.pending, group.pregnant, group.open]).toEqual([0, 0, 1]);
  });
});

describe("breteRows", () => {
  const tufao = makeSemenBull({ id: "bull-1", name: "Tufão da Serra" });
  const b1 = dam("B-001", record([breeding("b1", "2026-07-01")], [diagnosed("b1", "pregnant")]));
  const b2 = dam("B-002", record([breeding("b2", "2026-07-01")]));
  const b3 = dam("B-003", record([breeding("b3", "2026-07-01")], [diagnosed("b3", "pending")]));
  const sold = dam("B-004", record([breeding("b4", "2026-07-01")]), { active: false });
  const animals = [b1, b2, b3, sold];

  it("keeps the order the brete started with, each cobertura with its result now", () => {
    const rows = breteRows(["b3", "b1", "b2"], animals, [tufao], TODAY_ISO);

    expect(rows.map((r) => [r.dam.earTag, r.result])).toEqual([
      ["B-003", "pending"],
      ["B-001", "pregnant"],
      ["B-002", "pending"],
    ]);
  });

  it("resolves the registered bull and the days", () => {
    const [row] = breteRows(["b2"], animals, [tufao], TODAY_ISO);

    expect(row.dam).toBe(b2);
    expect(row.breeding.id).toBe("b2");
    expect(row.bull).toBe(tufao);
    expect(row.days).toBe(73);
  });

  it("drops a cobertura no longer found and a dam that left the herd", () => {
    expect(breteRows(["b9", "b4", "b1"], animals, [tufao], TODAY_ISO).map((r) => r.dam.earTag)).toEqual(
      ["B-001"]
    );
  });
});
