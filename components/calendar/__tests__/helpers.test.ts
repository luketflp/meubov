import { describe, expect, it } from "vitest";
import { makeAnimal, makeTreatment } from "@/lib/domain/__tests__/fixtures";
import { groupTreatments, overdueByLot } from "@/components/calendar/helpers";

describe("groupTreatments", () => {
  it("gathers the treatments one scheduling action booked", () => {
    const groups = groupTreatments([
      makeTreatment({ id: "t-1", batchId: "batch-1", animalEarTag: "BR-001" }),
      makeTreatment({ id: "t-2", batchId: "batch-1", animalEarTag: "BR-002" }),
      makeTreatment({ id: "t-3", batchId: "batch-2", animalEarTag: "BR-003" }),
    ]);

    expect(groups.map((group) => group.treatments.length)).toEqual([2, 1]);
    expect(groups[0].treatments.map((t) => t.id)).toEqual(["t-1", "t-2"]);
  });

  it("gathers unbatched treatments by day, treatment and status", () => {
    const groups = groupTreatments([
      makeTreatment({ id: "t-1", animalEarTag: "BR-001" }),
      makeTreatment({ id: "t-2", animalEarTag: "BR-002" }),
      makeTreatment({ id: "t-3", animalEarTag: "BR-003", status: "done" }),
      makeTreatment({ id: "t-4", animalEarTag: "BR-004", date: "2026-08-02" }),
    ]);

    expect(groups.map((group) => group.treatments.map((t) => t.id))).toEqual([
      ["t-1", "t-2"],
      ["t-3"],
      ["t-4"],
    ]);
  });

  it("keeps a batched treatment apart from an unbatched twin", () => {
    const groups = groupTreatments([
      makeTreatment({ id: "t-1" }),
      makeTreatment({ id: "t-2", batchId: "batch-1" }),
    ]);

    expect(groups).toHaveLength(2);
  });
});

describe("overdueByLot", () => {
  const lots = [
    { id: "lot-a", name: "Garrotes" },
    { id: "lot-b", name: "Matrizes" },
  ];
  const animals = [
    makeAnimal({ id: "a-1", earTag: "BR-001", lotId: "lot-a" }),
    makeAnimal({ id: "a-2", earTag: "BR-002", lotId: "lot-b" }),
    makeAnimal({ id: "a-3", earTag: "BR-003", lotId: "lot-a" }),
    makeAnimal({ id: "a-4", earTag: "BR-004", lotId: "lot-gone" }),
  ];

  it("splits by the lote each animal is in today, the oldest lote first and Sem lote last", () => {
    const groups = overdueByLot(
      [
        makeTreatment({ id: "t-1", animalEarTag: "BR-004", date: "2026-07-01" }),
        makeTreatment({ id: "t-2", animalEarTag: "BR-002", date: "2026-07-02" }),
        makeTreatment({ id: "t-3", animalEarTag: "BR-001", date: "2026-07-03" }),
        makeTreatment({ id: "t-4", animalEarTag: "BR-003", date: "2026-07-04" }),
        makeTreatment({ id: "t-5", animalEarTag: "XX-999", date: "2026-07-05" }),
      ],
      animals,
      lots
    );

    expect(groups.map((g) => [g.lotId, g.name, g.treatments.map((t) => t.id)])).toEqual([
      ["lot-b", "Matrizes", ["t-2"]],
      ["lot-a", "Garrotes", ["t-3", "t-4"]],
      [null, null, ["t-1", "t-5"]],
    ]);
  });

  it("is empty with nothing overdue", () => {
    expect(overdueByLot([], animals, lots)).toEqual([]);
  });
});
