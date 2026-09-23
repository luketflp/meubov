import { describe, expect, it } from "vitest";
import { technicalReport, type TechnicalParams } from "@/lib/reports/technical";
import { makeAnimal, makeSemenBull, makeTreatment } from "@/lib/domain/__tests__/fixtures";
import { expectedCalvingDate } from "@/lib/domain/reproduction";
import { addDays } from "@/lib/domain/dates";
import type { Animal, ReproductionRecord } from "@/lib/types";
import { makeData } from "./data";

const TODAY = "2026-09-22";
const PERIOD: TechnicalParams = { from: "2025-10-01", to: "2026-03-31", lotId: null };

let seq = 0;
function cow(record: Partial<ReproductionRecord>, overrides: Partial<Animal> = {}): Animal {
  seq += 1;
  return makeAnimal({
    id: `cow-${seq}`,
    earTag: `V-${seq}`,
    sex: "female",
    category: "cow",
    lotId: "lot-1",
    reproduction: { breedings: [], diagnoses: [], calvings: [], ...record },
    ...overrides,
  });
}

describe("technicalReport · season", () => {
  it("counts each female's latest cobertura of the period once", () => {
    const animals = [
      // Pregnant, diagnosed.
      cow({
        breedings: [{ id: "b1", date: "2026-01-10", type: "timedAI", bullEarTag: "", semenBullId: "sb-1" }],
        diagnoses: [{ breedingId: "b1", result: "pregnant", date: "2026-02-15" }],
      }),
      // Open, diagnosed.
      cow({
        breedings: [{ id: "b2", date: "2026-01-10", type: "timedAI", bullEarTag: "", semenBullId: "sb-1" }],
        diagnoses: [{ breedingId: "b2", result: "open", date: "2026-02-15" }],
      }),
      // Resynchronised: an open first cobertura, a second one still awaiting.
      cow({
        breedings: [
          { id: "b3a", date: "2025-11-01", type: "timedAI", bullEarTag: "", semenBullId: "sb-1" },
          { id: "b3b", date: "2026-03-01", type: "naturalMating", bullEarTag: "T-9" },
        ],
        diagnoses: [{ breedingId: "b3a", result: "open", date: "2025-12-10" }],
      }),
      // Calved without a diagnosis: the calving proves it.
      cow({
        breedings: [{ id: "b4", date: "2025-10-05", type: "naturalMating", bullEarTag: "T-9" }],
        calvings: [{ date: "2026-07-15", calfEarTag: "B-1" }],
      }),
      // Sold open after the diagnosis: still part of the season.
      cow(
        {
          breedings: [{ id: "b5", date: "2026-01-10", type: "timedAI", bullEarTag: "", semenBullId: "sb-1" }],
          diagnoses: [{ breedingId: "b5", result: "open", date: "2026-02-15" }],
        },
        { active: false, inactiveReason: "sale", inactiveDate: "2026-04-01" }
      ),
      // Outside the period.
      cow({ breedings: [{ id: "b6", date: "2026-05-01", type: "naturalMating", bullEarTag: "T-9" }] }),
      // A male never counts, nor a female with no cobertura.
      makeAnimal({ id: "m", earTag: "M" }),
      cow({}),
    ];
    const report = technicalReport(
      makeData({ animals, semenBulls: [makeSemenBull({ id: "sb-1", name: "Tufão" })] }),
      PERIOD,
      TODAY
    );
    expect(report.season).toEqual({
      exposed: 5,
      diagnosed: 4,
      pregnant: 2,
      open: 2,
      awaiting: 1,
      ratePct: 50,
    });
    expect(report.byBull).toEqual([
      { name: "Tufão", type: "IATF", covered: 4, diagnosed: 4, pregnant: 1, ratePct: 25 },
      { name: "T-9", type: "Monta natural", covered: 2, diagnosed: 1, pregnant: 1, ratePct: 100 },
    ]);
  });

  it("does not credit an earlier cobertura with a calving that came after a newer one", () => {
    const animals = [
      cow({
        breedings: [
          { id: "old", date: "2025-10-01", type: "naturalMating", bullEarTag: "T-1" },
          { id: "new", date: "2026-06-01", type: "naturalMating", bullEarTag: "T-2" },
        ],
        calvings: [{ date: "2026-08-01", calfEarTag: "B-1" }],
      }),
    ];
    const report = technicalReport(makeData({ animals }), PERIOD, TODAY);
    expect(report.season).toMatchObject({ exposed: 1, diagnosed: 0, pregnant: 0, awaiting: 0 });
  });

  it("is empty with a null rate when nothing was diagnosed", () => {
    const report = technicalReport(makeData(), PERIOD, TODAY);
    expect(report.season).toEqual({
      exposed: 0,
      diagnosed: 0,
      pregnant: 0,
      open: 0,
      awaiting: 0,
      ratePct: null,
    });
    expect(report.byBull).toEqual([]);
    expect(report.lots).toEqual([]);
    expect(report.sanitary).toEqual([]);
    expect(report.calvings).toEqual({ expected: 0, born: 0, next30: 0, overdue: 0 });
  });

  it("keeps to the animals of the lote when one is picked", () => {
    const animals = [
      cow({ breedings: [{ id: "x1", date: "2026-01-01", type: "naturalMating", bullEarTag: "T" }] }),
      cow(
        { breedings: [{ id: "x2", date: "2026-01-01", type: "naturalMating", bullEarTag: "T" }] },
        { lotId: "lot-2" }
      ),
    ];
    const report = technicalReport(makeData({ animals }), { ...PERIOD, lotId: "lot-2" }, TODAY);
    expect(report.season.exposed).toBe(1);
  });
});

describe("technicalReport · calvings", () => {
  it("follows the season's pregnancies: born, due within 30 days and overdue", () => {
    // Bred so the calving lands where wanted relative to today.
    const bredFor = (calving: string) => addDays(calving, -283);
    const soon = bredFor(addDays(TODAY, 10));
    const late = bredFor(addDays(TODAY, -5));
    const far = bredFor(addDays(TODAY, 60));
    const animals = [
      cow({
        breedings: [{ id: "c1", date: soon, type: "naturalMating", bullEarTag: "T" }],
        diagnoses: [{ breedingId: "c1", result: "pregnant", date: addDays(soon, 40) }],
      }),
      cow({
        breedings: [{ id: "c2", date: late, type: "naturalMating", bullEarTag: "T" }],
        diagnoses: [{ breedingId: "c2", result: "pregnant", date: addDays(late, 40) }],
      }),
      cow({
        breedings: [{ id: "c3", date: far, type: "naturalMating", bullEarTag: "T" }],
        diagnoses: [{ breedingId: "c3", result: "pregnant", date: addDays(far, 40) }],
      }),
      cow({
        breedings: [{ id: "c4", date: late, type: "naturalMating", bullEarTag: "T" }],
        calvings: [{ date: "2026-09-01", calfEarTag: "B" }],
      }),
      // Sold pregnant: expected, but neither due nor overdue here.
      cow(
        {
          breedings: [{ id: "c5", date: late, type: "naturalMating", bullEarTag: "T" }],
          diagnoses: [{ breedingId: "c5", result: "pregnant", date: addDays(late, 40) }],
        },
        { active: false, inactiveReason: "sale", inactiveDate: "2026-06-01" }
      ),
    ];
    expect(expectedCalvingDate(soon)).toBe(addDays(TODAY, 10));
    const report = technicalReport(
      makeData({ animals }),
      { from: far < late ? far : late, to: soon > far ? soon : far, lotId: null },
      TODAY
    );
    expect(report.calvings).toEqual({ expected: 5, born: 1, next30: 1, overdue: 1 });
  });
});

describe("technicalReport · lots", () => {
  it("gives each lote's GMD between the first and last weighing of the period", () => {
    const animals = [
      makeAnimal({
        id: "a",
        earTag: "A",
        lotId: "lot-1",
        weighings: [
          { date: "2025-09-01", weightKg: 300 },
          { date: "2025-10-01", weightKg: 320 },
          { date: "2026-01-29", weightKg: 440 },
        ],
      }),
      makeAnimal({
        id: "b",
        earTag: "B",
        lotId: "lot-1",
        weighings: [
          { date: "2025-11-01", weightKg: 300 },
          { date: "2026-03-01", weightKg: 360 },
        ],
      }),
      // One weighing in the period: no GMD.
      makeAnimal({ id: "c", earTag: "C", lotId: "lot-1", weighings: [{ date: "2026-01-01", weightKg: 300 }] }),
      makeAnimal({ id: "d", earTag: "D", lotId: "lot-2", weighings: [{ date: "2026-01-01", weightKg: 300 }] }),
    ];
    const report = technicalReport(
      makeData({ animals, lots: [{ id: "lot-1", name: "Recria" }, { id: "lot-2", name: "Cria" }] }),
      PERIOD,
      TODAY
    );
    // A: 120 kg in 120 days (1.0); B: 60 kg in 120 days (0.5).
    expect(report.lots).toEqual([
      { lotName: "Recria", weighed: 2, startKg: 310, endKg: 400, days: 120, adg: 0.75 },
    ]);
  });
});

describe("technicalReport · sanitary", () => {
  it("counts manejos, applications and animals in carência today, by type", () => {
    const animals = [
      makeAnimal({ id: "a", earTag: "A" }),
      makeAnimal({ id: "b", earTag: "B" }),
      makeAnimal({ id: "x", earTag: "X", active: false, inactiveReason: "sale", inactiveDate: "2026-09-01" }),
    ];
    const treatments = [
      // One vaccination manejo on two animals.
      makeTreatment({ id: "t1", animalEarTag: "A", type: "vaccine", name: "Aftosa", date: "2025-11-01", status: "done" }),
      makeTreatment({ id: "t2", animalEarTag: "B", type: "vaccine", name: "Aftosa", date: "2025-11-01", status: "done" }),
      // Scheduled, not applied.
      makeTreatment({ id: "t3", animalEarTag: "A", type: "vaccine", name: "Aftosa", date: "2026-03-01", status: "scheduled" }),
      // Deworming in the period.
      makeTreatment({ id: "t4", animalEarTag: "A", type: "deworming", name: "Ivermectina", date: "2026-02-01", status: "done", withdrawalDays: 35 }),
      // Medication today with carência: after the period, still counted in carência.
      makeTreatment({ id: "t5", animalEarTag: "B", type: "medication", name: "Antibiótico", date: addDays(TODAY, -3), status: "done", withdrawalDays: 28 }),
      // Carência over.
      makeTreatment({ id: "t6", animalEarTag: "A", type: "medication", name: "Antibiótico", date: "2026-08-01", status: "done", withdrawalDays: 10 }),
      // Sold animal in carência: not in the herd.
      makeTreatment({ id: "t7", animalEarTag: "X", type: "medication", name: "Antibiótico", date: addDays(TODAY, -2), status: "done", withdrawalDays: 28 }),
    ];
    const report = technicalReport(makeData({ animals, treatments }), PERIOD, TODAY);
    expect(report.sanitary).toEqual([
      { type: "vaccine", sessions: 1, applications: 2, inWithdrawal: 0 },
      { type: "deworming", sessions: 1, applications: 1, inWithdrawal: 0 },
      { type: "medication", sessions: 0, applications: 0, inWithdrawal: 1 },
    ]);
  });
});
