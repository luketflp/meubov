import { describe, expect, it } from "vitest";
import type { ReproductionRecord } from "@/lib/types";
import { TODAY_ISO } from "@/lib/domain/dates";
import {
  GESTATION_DAYS,
  expectedCalvingDate,
  currentDiagnosis,
  daysToCalving,
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
