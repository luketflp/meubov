import { describe, expect, it } from "vitest";
import {
  capitalTurnover,
  grossMarginPerArroba,
  productivityArrobasPerHa,
  steerToCalfRatio,
  periodResult,
  offtakeRatePct,
  herdValue,
} from "@/lib/domain/finance";

describe("herdValue", () => {
  it("multiplies arrobas by the price", () => {
    expect(herdValue(100, 240)).toBe(24000);
  });
});

describe("periodResult", () => {
  it("consolidates revenues, costs and net margin", () => {
    const r = periodResult([1000, 500], [300, 200]);
    expect(r.totalRevenue).toBe(1500);
    expect(r.totalCost).toBe(500);
    expect(r.result).toBe(1000);
    expect(r.netMarginPct).toBeCloseTo(66.6667, 3);
  });

  it("returns margin 0 without revenue", () => {
    expect(periodResult([], [100]).netMarginPct).toBe(0);
  });
});

describe("grossMarginPerArroba", () => {
  it("subtracts the cost per arroba from the price", () => {
    expect(grossMarginPerArroba(240, 180)).toBe(60);
  });
});

describe("steerToCalfRatio", () => {
  it("divides the fat steer value by the calf price", () => {
    // 18 @ x R$ 300 = R$ 5,400; / R$ 2,700 = 2 calves per steer
    expect(steerToCalfRatio(300, 18, 2700)).toBe(2);
  });
});

describe("offtakeRatePct", () => {
  it("computes the sales percentage over the herd", () => {
    expect(offtakeRatePct(20, 100)).toBe(20);
  });

  it("returns 0 with an empty herd", () => {
    expect(offtakeRatePct(5, 0)).toBe(0);
  });
});

describe("productivityArrobasPerHa", () => {
  it("divides produced arrobas by the hectares", () => {
    expect(productivityArrobasPerHa(450, 100)).toBe(4.5);
  });

  it("returns 0 without hectares", () => {
    expect(productivityArrobasPerHa(450, 0)).toBe(0);
  });
});

describe("capitalTurnover", () => {
  it("divides the annual revenue by the herd value", () => {
    expect(capitalTurnover(50000, 200000)).toBe(0.25);
  });

  it("returns 0 with a herd value of 0", () => {
    expect(capitalTurnover(50000, 0)).toBe(0);
  });
});
