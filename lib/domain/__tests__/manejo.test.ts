import { describe, expect, it } from "vitest";
import { buildPassEffects, sessionName, WEIGHING_SESSION_NAME } from "@/lib/domain/manejo";
import type { ManejoTreatmentPlan } from "@/lib/types";

const plan: ManejoTreatmentPlan = {
  type: "vaccine",
  name: "Vacina aftosa",
  withdrawalDays: 0,
  dose: "5 ml",
  responsible: "Dr. Ana",
  costBrl: 4.5,
  nextDate: "2026-12-01",
};

const session = { date: "2026-08-02", weighing: true, treatment: plan };

describe("sessionName", () => {
  it("uses the plan name when there is a sanitary plan", () => {
    expect(sessionName(plan)).toBe("Vacina aftosa");
  });

  it("falls back to the weighing-only default without a plan", () => {
    expect(sessionName(undefined)).toBe(WEIGHING_SESSION_NAME);
  });
});

describe("buildPassEffects", () => {
  it("produces treatment, booster and weighing for a full pass", () => {
    const effects = buildPassEffects(session, { weightKg: 312.5 });
    expect(effects.treatment).toMatchObject({
      type: "vaccine",
      name: "Vacina aftosa",
      date: "2026-08-02",
      status: "done",
      dose: "5 ml",
      responsible: "Dr. Ana",
      costBrl: 4.5,
    });
    // The applied treatment never carries the booster date.
    expect(effects.treatment).not.toHaveProperty("nextDate");
    expect(effects.booster).toEqual({
      type: "vaccine",
      name: "Vacina aftosa",
      withdrawalDays: 0,
      date: "2026-12-01",
      status: "scheduled",
    });
    expect(effects.weighing).toEqual({ date: "2026-08-02", weightKg: 312.5 });
  });

  it("creates no booster when the plan has no nextDate", () => {
    const noBooster = { ...plan, nextDate: undefined };
    const effects = buildPassEffects({ ...session, treatment: noBooster });
    expect(effects.treatment).toBeDefined();
    expect(effects.booster).toBeUndefined();
  });

  it("creates no treatment for a weighing-only session", () => {
    const effects = buildPassEffects(
      { date: "2026-08-02", weighing: true },
      { weightKg: 300 }
    );
    expect(effects.treatment).toBeUndefined();
    expect(effects.booster).toBeUndefined();
    expect(effects.weighing).toEqual({ date: "2026-08-02", weightKg: 300 });
  });

  it("ignores the weight when the session does not weigh", () => {
    const effects = buildPassEffects({ ...session, weighing: false }, { weightKg: 300 });
    expect(effects.weighing).toBeUndefined();
  });

  it("creates no weighing when no weight was captured", () => {
    const effects = buildPassEffects(session, {});
    expect(effects.weighing).toBeUndefined();
  });
});
