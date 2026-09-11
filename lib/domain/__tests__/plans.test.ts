import { describe, expect, it } from "vitest";
import {
  PLANS,
  annualFreeMonths,
  capLabel,
  formatPlanPrice,
  planById,
  priceFor,
} from "@/lib/domain/plans";

describe("PLANS", () => {
  it("lists the four tiers in order with the approved prices and caps", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["curral", "fazenda", "fazenda_pro", "consultor"]);
    expect(PLANS.map((p) => p.monthlyBrl)).toEqual([0, 8900, 18900, null]);
    expect(PLANS.map((p) => p.yearlyBrl)).toEqual([null, 89000, 189000, null]);
    expect(PLANS.map((p) => p.maxHeads)).toEqual([50, 500, 2000, null]);
    expect(PLANS.map((p) => p.maxFarms)).toEqual([1, 1, 3, null]);
    expect(PLANS.map((p) => p.maxUsers)).toEqual([1, 3, null, null]);
    expect(PLANS.filter((p) => p.highlighted).map((p) => p.id)).toEqual(["fazenda"]);
    for (const plan of PLANS) expect(plan.bullets).toHaveLength(4);
  });

  it("prices the annual plan at ten months", () => {
    for (const plan of PLANS) {
      if (plan.yearlyBrl !== null) expect(plan.yearlyBrl).toBe((plan.monthlyBrl ?? 0) * 10);
    }
  });
});

describe("planById", () => {
  it("finds a plan by id and rejects anything else", () => {
    expect(planById("fazenda")?.name).toBe("Fazenda");
    expect(planById("fazenda_pro")?.name).toBe("Fazenda Pro");
    expect(planById("premium")).toBeNull();
    expect(planById("")).toBeNull();
  });
});

describe("formatPlanPrice", () => {
  it("formats whole reais without decimals in pt-BR", () => {
    expect(formatPlanPrice(0)).toBe("R$ 0");
    expect(formatPlanPrice(8900)).toBe("R$ 89");
    expect(formatPlanPrice(189000)).toBe("R$ 1.890");
  });

  it("keeps the centavos when they are not zero", () => {
    expect(formatPlanPrice(8990)).toBe("R$ 89,90");
  });
});

describe("annualFreeMonths / capLabel / priceFor", () => {
  const [curral, fazenda, pro, consultor] = PLANS;

  it("gives two free months on the paid tiers only", () => {
    expect(annualFreeMonths(curral)).toBe(0);
    expect(annualFreeMonths(fazenda)).toBe(2);
    expect(annualFreeMonths(pro)).toBe(2);
    expect(annualFreeMonths(consultor)).toBe(0);
  });

  it("labels the cap in cabeças, or unlimited farms for the quote tier", () => {
    expect(capLabel(curral)).toBe("até 50 cabeças");
    expect(capLabel(pro)).toBe("até 2.000 cabeças");
    expect(capLabel(consultor)).toBe("fazendas ilimitadas");
  });

  it("returns the price of the chosen interval", () => {
    expect(priceFor(fazenda, "month")).toBe(8900);
    expect(priceFor(fazenda, "year")).toBe(89000);
    expect(priceFor(curral, "year")).toBeNull();
    expect(priceFor(consultor, "month")).toBeNull();
  });
});
