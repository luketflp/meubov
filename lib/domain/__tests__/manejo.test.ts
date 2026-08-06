import { describe, expect, it } from "vitest";
import { buildPassEffects, sessionName, WEIGHING_SESSION_NAME } from "@/lib/domain/manejo";
import { KG_PER_ARROBA } from "@/lib/domain/weights";
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

const session = {
  date: "2026-08-02",
  kind: "health" as const,
  weighing: true,
  treatment: plan,
};

describe("sessionName", () => {
  it("uses the plan name when there is a sanitary plan", () => {
    expect(sessionName(plan)).toBe("Vacina aftosa");
  });

  it("falls back to the weighing-only default without a plan", () => {
    expect(sessionName(undefined)).toBe(WEIGHING_SESSION_NAME);
  });

  it("names the sessions that move the herd after their kind", () => {
    expect(sessionName(undefined, "transfer")).toBe("Troca de lote");
    expect(sessionName(undefined, "sale")).toBe("Venda");
    expect(sessionName(undefined, "entry")).toBe("Entrada");
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
      { date: "2026-08-02", kind: "weighing", weighing: true },
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

  it("lands the animal in the destination lot on a transfer pass", () => {
    const effects = buildPassEffects({
      date: "2026-08-02",
      kind: "transfer",
      weighing: false,
      destinationLotId: "lot-2",
    });
    expect(effects.lotId).toBe("lot-2");
    expect(effects.sold).toBeUndefined();
  });

  it("prices and sells the animal with the weight read at the chute", () => {
    const effects = buildPassEffects(
      { date: "2026-08-02", kind: "sale", weighing: true, pricePerArroba: 310 },
      { weightKg: KG_PER_ARROBA * 17 }
    );
    expect(effects.sold).toBe(true);
    expect(effects.amountBrl).toBeCloseTo(17 * 310, 6);
    expect(effects.weighing).toEqual({
      date: "2026-08-02",
      weightKg: KG_PER_ARROBA * 17,
    });
  });

  it("prices the carcass at the session's rendimento when the venda set one", () => {
    const effects = buildPassEffects(
      {
        date: "2026-08-02",
        kind: "sale",
        weighing: true,
        pricePerArroba: 300,
        carcassYieldPct: 48.5,
      },
      { weightKg: 488 }
    );
    // 488 × 48,5% ÷ 15 × R$ 300.
    expect(effects.amountBrl).toBeCloseTo(((488 * 0.485) / 15) * 300, 6);
  });

  it("sells without a per-animal value when the batch has a closed price", () => {
    const effects = buildPassEffects(
      { date: "2026-08-02", kind: "sale", weighing: false },
      { weightKg: 500 }
    );
    expect(effects.sold).toBe(true);
    expect(effects.amountBrl).toBeUndefined();
  });

  it("does not move the herd on a health pass", () => {
    const effects = buildPassEffects(session, { weightKg: 400 });
    expect(effects.lotId).toBeUndefined();
    expect(effects.sold).toBeUndefined();
  });
});
