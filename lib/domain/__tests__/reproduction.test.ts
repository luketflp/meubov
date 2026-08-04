import { describe, expect, it } from "vitest";
import type { ReproductionRecord } from "@/lib/types";
/** Fixed reference date for deterministic assertions. */
const TODAY_ISO = "2026-07-24";
import {
  GESTATION_DAYS,
  expectedCalvingDate,
  currentDiagnosis,
  daysToCalving,
  breedingsAwaitingDiagnosis,
  hasCalvedSince,
} from "@/lib/domain/reproduction";

const emptyRecord: ReproductionRecord = { breedings: [], diagnoses: [], calvings: [] };

describe("expectedCalvingDate", () => {
  it("adds exactly 283 days to the breeding", () => {
    expect(GESTATION_DAYS).toBe(283);
    expect(expectedCalvingDate("2026-01-01")).toBe("2026-10-11");
  });
});

describe("currentDiagnosis", () => {
  it("returns null without breedings", () => {
    expect(currentDiagnosis(emptyRecord)).toBeNull();
  });

  it("a breeding without a diagnosis counts as pending", () => {
    const record: ReproductionRecord = {
      breedings: [{ id: "c1", date: "2026-05-01", type: "timedAI", bullEarTag: "T-10" }],
      diagnoses: [],
      calvings: [],
    };
    expect(currentDiagnosis(record)).toEqual({
      breeding: record.breedings[0],
      result: "pending",
    });
  });

  it("uses the latest breeding by date with its diagnosis", () => {
    const record: ReproductionRecord = {
      breedings: [
        { id: "c1", date: "2025-10-01", type: "naturalMating", bullEarTag: "T-10" },
        { id: "c2", date: "2026-05-01", type: "timedAI", bullEarTag: "T-11" },
      ],
      diagnoses: [
        { breedingId: "c1", result: "open", date: "2025-11-05" },
        { breedingId: "c2", result: "pregnant", date: "2026-06-05" },
      ],
      calvings: [],
    };
    const current = currentDiagnosis(record);
    expect(current?.breeding.id).toBe("c2");
    expect(current?.result).toBe("pregnant");
  });
});

describe("daysToCalving", () => {
  it("counts days until the expected date", () => {
    expect(daysToCalving("2026-08-03", TODAY_ISO)).toBe(10);
  });

  it("returns negative when the forecast has already passed", () => {
    expect(daysToCalving("2026-07-20", TODAY_ISO)).toBe(-4);
  });
});

describe("breedingsAwaitingDiagnosis", () => {
  const breedings: ReproductionRecord["breedings"] = [
    { id: "c1", date: "2025-10-01", type: "naturalMating", bullEarTag: "T-10" },
    { id: "c2", date: "2026-05-01", type: "timedAI", bullEarTag: "T-11" },
    { id: "c3", date: "2026-02-01", type: "timedAI", bullEarTag: "T-12" },
  ];

  it("returns nothing for an empty record", () => {
    expect(breedingsAwaitingDiagnosis(emptyRecord)).toEqual([]);
  });

  it("keeps only the undiagnosed ones, most recent first", () => {
    const record: ReproductionRecord = {
      breedings,
      diagnoses: [{ breedingId: "c1", result: "open", date: "2025-11-05" }],
      calvings: [],
    };
    expect(breedingsAwaitingDiagnosis(record).map((b) => b.id)).toEqual(["c2", "c3"]);
  });

  it("counts a recorded 'pending' result as already diagnosed", () => {
    const record: ReproductionRecord = {
      breedings,
      diagnoses: [
        { breedingId: "c1", result: "open", date: "2025-11-05" },
        { breedingId: "c2", result: "pending", date: "2026-06-05" },
        { breedingId: "c3", result: "pregnant", date: "2026-03-05" },
      ],
      calvings: [],
    };
    expect(breedingsAwaitingDiagnosis(record)).toEqual([]);
  });
});

describe("hasCalvedSince", () => {
  const record: ReproductionRecord = {
    breedings: [{ id: "c1", date: "2025-10-01", type: "timedAI", bullEarTag: "T-10" }],
    diagnoses: [{ breedingId: "c1", result: "pregnant", date: "2025-11-05" }],
    calvings: [{ date: "2026-07-11", calfEarTag: "BR-2001" }],
  };

  it("is true when the calf was born after the breeding", () => {
    expect(hasCalvedSince(record, "2025-10-01")).toBe(true);
  });

  it("is false for a breeding after the last calving", () => {
    expect(hasCalvedSince(record, "2026-07-20")).toBe(false);
  });

  it("is false without calvings", () => {
    expect(hasCalvedSince(emptyRecord, "2026-01-01")).toBe(false);
  });
});
