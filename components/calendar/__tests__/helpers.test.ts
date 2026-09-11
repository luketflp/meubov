import { describe, expect, it } from "vitest";
import { makeTreatment } from "@/lib/domain/__tests__/fixtures";
import { groupTreatments } from "@/components/calendar/helpers";

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
