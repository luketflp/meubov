import { describe, expect, it } from "vitest";
import type { HerdData, ManejoSession, SemenBull, Treatment } from "@/lib/types";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";
import {
  canDeleteManejo,
  canDeleteSession,
  hasMoney,
  redactHerdMoney,
  redactManejoSession,
  redactPass,
  redactSemenBull,
  sessionHasMoney,
  startNeedsFinance,
} from "@/lib/domain/moneyRedaction";

const treatment: Treatment = {
  id: "t-1",
  animalEarTag: "BR-1",
  type: "vaccine",
  name: "Aftosa",
  date: "2026-09-01",
  status: "done",
  withdrawalDays: 0,
  costBrl: 4.5,
};

const sale: ManejoSession = {
  id: "s-1",
  name: "Venda",
  date: "2026-09-02",
  status: "closed",
  kind: "sale",
  weighing: true,
  animals: [
    { earTag: "BR-1", outcome: "done", weightKg: 500, amountBrl: 5300 },
    { earTag: "BR-2", outcome: "skipped" },
  ],
  pricePerArroba: 320,
  carcassYieldPct: 52,
};

const vaccination: ManejoSession = {
  id: "s-2",
  name: "Vacina",
  date: "2026-09-03",
  status: "open",
  kind: "health",
  weighing: false,
  animals: [{ earTag: "BR-1", outcome: "pending" }],
  treatment: { type: "vaccine", name: "Aftosa", withdrawalDays: 0 },
};

const bull: SemenBull = {
  id: "bull-1",
  name: "Tufão da Serra",
  code: "NEL-4471",
  purchases: [
    { id: "p-1", date: "2026-03-01", doses: 40, totalBrl: 1520, seller: "Central", expenseId: "e-2" },
  ],
};

const herd: HerdData = {
  animals: [],
  treatments: [treatment],
  lots: [],
  invernadas: [],
  lotPlacements: [],
  movements: [
    { id: "m-1", type: "sale", date: "2026-09-02", origin: "Fazenda", destination: "Frigorífico", amountBrl: 5300 },
  ],
  breeds: [],
  protocols: [],
  manejoSessions: [sale, vaccination],
  expenses: [{ id: "e-1", kind: "expense", date: "2026-09-01", category: "labor", amountBrl: 1200 }],
  accounts: [{ id: "acc-1", group: "labor", name: "Salários" }],
  customCategories: [],
  semenBulls: [bull],
  farm: { name: "Fazenda", municipality: "Uberaba", stateRegistration: "", manager: "" },
};

describe("hasMoney", () => {
  it("is true when any value is present", () => {
    expect(hasMoney({ pricePerArroba: 320 })).toBe(true);
    expect(hasMoney({ planCostBrl: 0 })).toBe(true);
  });

  it("is false when every value is null or missing", () => {
    expect(hasMoney({ pricePerArroba: null, totalAmountBrl: null, planCostBrl: null })).toBe(false);
    expect(hasMoney({})).toBe(false);
  });
});

describe("sessionHasMoney", () => {
  it("reads the price, the total and the plan cost", () => {
    expect(sessionHasMoney(sale)).toBe(true);
    expect(sessionHasMoney(vaccination)).toBe(false);
    expect(
      sessionHasMoney({ ...vaccination, treatment: { ...vaccination.treatment!, costBrl: 3 } })
    ).toBe(true);
  });

  it("trusts valuesHidden on a redacted session", () => {
    expect(sessionHasMoney(redactManejoSession(sale))).toBe(true);
  });
});

describe("startNeedsFinance", () => {
  it("guards every venda and entrada", () => {
    expect(startNeedsFinance({ kind: "sale" })).toBe(true);
    expect(startNeedsFinance({ kind: "entry" })).toBe(true);
  });

  it("guards a plan cost on a sanitary manejo", () => {
    expect(startNeedsFinance({ kind: "health", treatment: { costBrl: 2 } })).toBe(true);
    expect(startNeedsFinance({ kind: "health", treatment: {} })).toBe(false);
    expect(startNeedsFinance({ kind: "transfer" })).toBe(false);
  });
});

describe("canDeleteSession", () => {
  it("needs Manejo edit, plus Financeiro edit when the session has money", () => {
    expect(canDeleteSession(PRESETS.vaqueiro, vaccination)).toBe(true);
    expect(canDeleteSession(PRESETS.vaqueiro, redactManejoSession(sale))).toBe(false);
    expect(canDeleteSession(FULL_PERMISSIONS, sale)).toBe(true);
    expect(canDeleteSession(PRESETS.consultor, vaccination)).toBe(false);
  });
});

describe("canDeleteManejo", () => {
  it("deletes a session as canDeleteSession does", () => {
    expect(canDeleteManejo(PRESETS.vaqueiro, { kind: "session", session: vaccination })).toBe(true);
    expect(canDeleteManejo(PRESETS.consultor, { kind: "session", session: vaccination })).toBe(false);
  });

  it("deletes treatments through Sanitário and weighings through Rebanho", () => {
    const noSanitary = { ...PRESETS.vaqueiro, sanitary: "view" as const };
    expect(canDeleteManejo(PRESETS.vaqueiro, { kind: "treatments" })).toBe(true);
    expect(canDeleteManejo(noSanitary, { kind: "treatments" })).toBe(false);
    expect(canDeleteManejo(noSanitary, { kind: "weighings" })).toBe(true);
    expect(canDeleteManejo(PRESETS.consultor, { kind: "weighings" })).toBe(false);
  });
});

describe("redactManejoSession", () => {
  it("strips price, total and pass values and marks the session", () => {
    const redacted = redactManejoSession(sale);
    expect(redacted).not.toHaveProperty("pricePerArroba");
    expect(redacted.animals[0]).toEqual({ earTag: "BR-1", outcome: "done", weightKg: 500 });
    expect(redacted.carcassYieldPct).toBe(52);
    expect(redacted.valuesHidden).toBe(true);
  });

  it("leaves a session without values unmarked", () => {
    expect(redactManejoSession(vaccination)).toEqual(vaccination);
  });
});

describe("redactPass", () => {
  it("strips the pass value and the treatment cost", () => {
    const result = redactPass({
      entry: sale.animals[0],
      treatments: [treatment],
      weighing: { date: "2026-09-02", weightKg: 500 },
    });
    expect(result.entry).not.toHaveProperty("amountBrl");
    expect(result.treatments[0]).not.toHaveProperty("costBrl");
    expect(result.weighing).toEqual({ date: "2026-09-02", weightKg: 500 });
  });
});

describe("redactSemenBull", () => {
  it("strips the valor total of every purchase and keeps the doses", () => {
    expect(redactSemenBull(bull)).toEqual({
      ...bull,
      purchases: [{ id: "p-1", date: "2026-03-01", doses: 40, seller: "Central", expenseId: "e-2" }],
    });
  });
});

describe("redactHerdMoney", () => {
  it("removes every BRL value and empties the expenses", () => {
    const redacted = redactHerdMoney(herd);
    expect(redacted.expenses).toEqual([]);
    expect(redacted.treatments[0]).not.toHaveProperty("costBrl");
    expect(redacted.movements[0]).not.toHaveProperty("amountBrl");
    expect(redacted.manejoSessions[0]).not.toHaveProperty("pricePerArroba");
    expect(redacted.semenBulls[0].purchases[0]).not.toHaveProperty("totalBrl");
    expect(redacted.semenBulls[0].purchases[0].doses).toBe(40);
    expect(redacted.farm).toEqual(herd.farm);
  });

  it("keeps the plano de contas: names carry no money", () => {
    const redacted = redactHerdMoney(herd);
    expect(redacted.accounts).toEqual(herd.accounts);
    expect(redacted.expenses).toEqual([]);
  });

  it("does not mutate its input", () => {
    redactHerdMoney(herd);
    expect(herd.expenses).toHaveLength(1);
    expect(herd.treatments[0].costBrl).toBe(4.5);
    expect(sale.pricePerArroba).toBe(320);
    expect(bull.purchases[0].totalBrl).toBe(1520);
  });
});
