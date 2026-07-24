import { describe, expect, it } from "vitest";
import type { ReproductionRecord } from "@/lib/types";
import { TODAY_ISO, addDays } from "@/lib/domain/dates";
import {
  deriveAnimalStatus,
  deriveTreatmentStatus,
  attentionReason,
} from "@/lib/domain/status";
import { makeAnimal, makeTreatment } from "./fixtures";

function recordWithBreeding(overrides: Partial<ReproductionRecord> = {}): ReproductionRecord {
  return {
    breedings: [{ id: "c1", date: "2026-05-01", type: "timedAI", bullEarTag: "T-10" }],
    diagnoses: [],
    calvings: [],
    ...overrides,
  };
}

describe("deriveTreatmentStatus", () => {
  it("done stays done even with a past date", () => {
    const t = makeTreatment({ status: "done", date: "2026-07-01" });
    expect(deriveTreatmentStatus(t, TODAY_ISO)).toBe("done");
  });

  it("a date before today becomes overdue", () => {
    const t = makeTreatment({ date: "2026-07-23" });
    expect(deriveTreatmentStatus(t, TODAY_ISO)).toBe("overdue");
  });

  it("a date equal to today stays scheduled", () => {
    const t = makeTreatment({ date: TODAY_ISO });
    expect(deriveTreatmentStatus(t, TODAY_ISO)).toBe("scheduled");
  });
});

describe("deriveAnimalStatus", () => {
  it("any overdue treatment becomes overdue", () => {
    const overdue = makeTreatment({ date: "2026-07-12" });
    expect(deriveAnimalStatus(makeAnimal(), [overdue], TODAY_ISO)).toBe("overdue");
  });

  it("scheduled in exactly 30 days (inclusive) becomes attention", () => {
    const in30 = makeTreatment({ date: addDays(TODAY_ISO, 30) });
    expect(deriveAnimalStatus(makeAnimal(), [in30], TODAY_ISO)).toBe("attention");
  });

  it("scheduled in 31 days stays healthy", () => {
    const in31 = makeTreatment({ date: addDays(TODAY_ISO, 31) });
    expect(deriveAnimalStatus(makeAnimal(), [in31], TODAY_ISO)).toBe("healthy");
  });

  it("scheduled for today becomes attention", () => {
    const todayT = makeTreatment({ date: TODAY_ISO });
    expect(deriveAnimalStatus(makeAnimal(), [todayT], TODAY_ISO)).toBe("attention");
  });

  it("a treatment done in the past does not create an overdue", () => {
    const done = makeTreatment({ status: "done", date: "2026-06-01" });
    expect(deriveAnimalStatus(makeAnimal(), [done], TODAY_ISO)).toBe("healthy");
  });

  it("a female with a breeding without a diagnosis becomes attention", () => {
    const cow = makeAnimal({
      sex: "female",
      category: "cow",
      reproduction: recordWithBreeding(),
    });
    expect(deriveAnimalStatus(cow, [], TODAY_ISO)).toBe("attention");
  });

  it("a female with a pregnant diagnosis stays healthy", () => {
    const cow = makeAnimal({
      sex: "female",
      category: "cow",
      reproduction: recordWithBreeding({
        diagnoses: [{ breedingId: "c1", result: "pregnant", date: "2026-06-05" }],
      }),
    });
    expect(deriveAnimalStatus(cow, [], TODAY_ISO)).toBe("healthy");
  });
});

describe("attentionReason", () => {
  it("describes an overdue treatment with overdue days", () => {
    const overdue = makeTreatment({ date: "2026-07-12" });
    expect(attentionReason(makeAnimal(), [overdue], TODAY_ISO)).toBe(
      "Vacina aftosa atrasada há 12 dias"
    );
  });

  it("uses singular for 1 overdue day", () => {
    const overdue = makeTreatment({ date: "2026-07-23" });
    expect(attentionReason(makeAnimal(), [overdue], TODAY_ISO)).toBe(
      "Vacina aftosa atrasada há 1 dia"
    );
  });

  it("overdue has priority over a pending diagnosis", () => {
    const cow = makeAnimal({
      sex: "female",
      category: "cow",
      reproduction: recordWithBreeding(),
    });
    const overdue = makeTreatment({ date: "2026-07-12" });
    expect(attentionReason(cow, [overdue], TODAY_ISO)).toBe(
      "Vacina aftosa atrasada há 12 dias"
    );
  });

  it("describes an upcoming treatment in days", () => {
    const upcoming = makeTreatment({
      type: "deworming",
      name: "Vermifugação",
      date: addDays(TODAY_ISO, 8),
    });
    expect(attentionReason(makeAnimal(), [upcoming], TODAY_ISO)).toBe("Vermifugação em 8 dias");
  });

  it("describes a pending pregnancy diagnosis", () => {
    const cow = makeAnimal({
      sex: "female",
      category: "cow",
      reproduction: recordWithBreeding(),
    });
    expect(attentionReason(cow, [], TODAY_ISO)).toBe("Diagnóstico de gestação pendente");
  });

  it("returns null for a healthy animal", () => {
    expect(attentionReason(makeAnimal(), [], TODAY_ISO)).toBeNull();
  });
});
