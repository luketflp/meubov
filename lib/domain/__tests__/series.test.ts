import { describe, expect, it } from "vitest";

import type { Expense } from "@/lib/types";
import {
  addMonths,
  firstMonthlyOnOrAfter,
  installmentLabel,
  installmentPlan,
  monthYear,
  nextDueDates,
  occurrenceDate,
  recurrenceLabel,
  recurringDates,
  ruleFromOccurrence,
  scopeRows,
  seriesHorizon,
} from "@/lib/domain/series";

describe("occurrenceDate", () => {
  it("falls on the last day of a shorter month (31 → 28 Feb in 2027, 29 Feb in 2028)", () => {
    const jan31 = { frequency: "monthly" as const, dayOfMonth: 31, startsOn: "2027-01-31" };
    expect([1, 2, 3, 4].map((i) => occurrenceDate(jan31, i))).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
    expect(occurrenceDate({ ...jan31, startsOn: "2028-01-31" }, 2)).toBe("2028-02-29");
  });

  it("crosses the year", () => {
    expect(occurrenceDate({ frequency: "monthly", startsOn: "2026-11-05" }, 3)).toBe("2027-01-05");
  });

  it("steps a week at a time", () => {
    expect(occurrenceDate({ frequency: "weekly", startsOn: "2026-12-28" }, 2)).toBe("2027-01-04");
  });
});

describe("installmentPlan", () => {
  it("splits to the centavo and puts the remainder on the last parcela", () => {
    const plan = installmentPlan(1000, 3, "2026-10-10", "monthly");
    expect(plan.map((p) => p.amountBrl)).toEqual([333.33, 333.33, 333.34]);
    expect(plan.map((p) => p.dueDate)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(plan.map((p) => p.index)).toEqual([1, 2, 3]);
  });

  it("adds up to the total", () => {
    const plan = installmentPlan(12000.01, 7, "2026-10-10", "weekly");
    const cents = plan.reduce((sum, p) => sum + Math.round(p.amountBrl * 100), 0);
    expect(cents).toBe(1200001);
    expect(plan[1].dueDate).toBe("2026-10-17");
  });

  it("keeps the first parcela's day across a short month", () => {
    expect(installmentPlan(300, 3, "2027-01-31", "monthly").map((p) => p.dueDate)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });
});

describe("recurringDates", () => {
  const rule = { frequency: "monthly" as const, dayOfMonth: 5, startsOn: "2026-10-05" };

  it("stops at the window", () => {
    expect(recurringDates(rule, 1, "2026-12-31").map((o) => o.date)).toEqual([
      "2026-10-05",
      "2026-11-05",
      "2026-12-05",
    ]);
  });

  it("stops at endsOn when it comes first", () => {
    expect(recurringDates({ ...rule, endsOn: "2026-11-30" }, 1, "2027-12-31")).toHaveLength(2);
  });

  it("tops up from the next position only", () => {
    expect(recurringDates(rule, 4, "2027-02-05")).toEqual([
      { index: 4, date: "2027-01-05" },
      { index: 5, date: "2027-02-05" },
    ]);
    expect(recurringDates(rule, 6, "2027-02-05")).toEqual([]);
  });

  it("covers today + 12 months", () => {
    expect(seriesHorizon("2026-09-28")).toBe("2027-09-28");
    expect(recurringDates(rule, 1, seriesHorizon("2026-09-28"))).toHaveLength(12);
  });
});

describe("nextDueDates", () => {
  it("lists the next vencimentos, fewer when the série ends", () => {
    const rule = { frequency: "monthly" as const, dayOfMonth: 5, startsOn: "2026-10-05" };
    expect(nextDueDates(rule, 3)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
    expect(nextDueDates({ ...rule, endsOn: "2026-10-31" }, 3)).toEqual(["2026-10-05"]);
  });
});

describe("firstMonthlyOnOrAfter", () => {
  it("takes this month when the day is still ahead, else the next", () => {
    expect(firstMonthlyOnOrAfter("2026-09-28", 30)).toBe("2026-09-30");
    expect(firstMonthlyOnOrAfter("2026-09-28", 5)).toBe("2026-10-05");
    expect(firstMonthlyOnOrAfter("2026-09-28", 28)).toBe("2026-09-28");
  });
});

describe("ruleFromOccurrence", () => {
  it("puts the edited position on the new vencimento", () => {
    const rule = ruleFromOccurrence("monthly", 4, "2027-01-20");
    expect(rule).toEqual({ startsOn: "2026-10-20", dayOfMonth: 20 });
    expect(occurrenceDate({ frequency: "monthly", ...rule }, 4)).toBe("2027-01-20");
  });

  it("walks a weekly série back whole weeks", () => {
    expect(ruleFromOccurrence("weekly", 3, "2026-10-15")).toEqual({ startsOn: "2026-10-01", dayOfMonth: null });
  });
});

describe("scopeRows", () => {
  const rows = [
    { id: "a", seriesIndex: 1, paidAt: "2026-10-05" },
    { id: "b", seriesIndex: 2 },
    { id: "c", seriesIndex: 3, paidAt: "2026-10-01" },
    { id: "d", seriesIndex: 4 },
  ];
  const ids = (list: { id: string }[]) => list.map((row) => row.id);

  it("reaches only the row for Só esta, paid or not", () => {
    expect(ids(scopeRows(rows, 3, "one"))).toEqual(["c"]);
  });

  it("leaves paid rows out of Esta e as próximas and Todas", () => {
    expect(ids(scopeRows(rows, 2, "following"))).toEqual(["b", "d"]);
    expect(ids(scopeRows(rows, 3, "following"))).toEqual(["d"]);
    expect(ids(scopeRows(rows, 4, "all"))).toEqual(["b", "d"]);
  });
});

describe("labels", () => {
  const base: Expense = { id: "e", kind: "expense", date: "2026-10-01", category: "labor", amountBrl: 1 };

  it("names a parcela and an ocorrência", () => {
    expect(installmentLabel({ ...base, seriesIndex: 2, seriesCount: 3 })).toBe("2/3");
    expect(recurrenceLabel({ ...base, seriesFrequency: "monthly", seriesDay: 20 })).toBe("todo dia 20");
    expect(recurrenceLabel({ ...base, seriesFrequency: "weekly" })).toBe("toda semana");
    expect(installmentLabel(base)).toBeNull();
    expect(recurrenceLabel(base)).toBeNull();
  });

  it("formats month and year", () => {
    expect(monthYear("2026-12-05")).toBe("dez/2026");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});
