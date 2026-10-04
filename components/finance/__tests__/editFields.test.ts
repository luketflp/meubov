import { describe, expect, it } from "vitest";

import { distribute } from "@/lib/domain/budget";
import { formatNumber } from "@/lib/domain/format";
import {
  checkLine,
  lineFields,
  withDistribution,
  withMonth,
  withTotal,
  type LineFields,
} from "@/components/finance/orcamento/editFields";

const LABELS = ["out/25", "nov/25", "dez/25", "jan/26", "fev/26", "mar/26", "abr/26", "mai/26", "jun/26", "jul/26", "ago/26", "set/26"];
const FLAT = Array<number>(12).fill(1);
const EMPTY = Array<string>(11).fill("");
const blank = lineFields();

describe("lineFields", () => {
  it("starts a line without rows of its own blank, under Igual", () => {
    expect(blank).toEqual({ total: "", distribution: "equal", months: Array(12).fill("") });
    // A grupo whose orçado is only the sum of its contas has no line of its own to edit.
    expect(lineFields({ ownRows: false, budgeted: Array(12).fill(10), budgetedTotal: 120, distribution: null })).toEqual(blank);
  });

  it("starts a saved line from its rows and its distribution", () => {
    const budgeted = [11200, 8400, 7000, 6300, 6300, 7000, 9800, 12600, 16800, 18200, 19600, 16800];
    const fields = lineFields({ ownRows: true, budgeted, budgetedTotal: 140000, distribution: "previous" });
    expect(fields.total).toBe("140.000,00");
    expect(fields.distribution).toBe("previous");
    expect(fields.months[0]).toBe("11.200,00");
    expect(fields.months[11]).toBe("16.800,00");
  });

  it("reads a saved line without a distribution as Manual", () => {
    const fields = lineFields({ ownRows: true, budgeted: Array(12).fill(10), budgetedTotal: 120, distribution: null });
    expect(fields.distribution).toBe("manual");
  });
});

describe("withTotal", () => {
  it("spreads a total evenly under Igual, the last month taking the centavos", () => {
    const fields = withTotal(blank, "100,00", FLAT);
    expect(fields.months.slice(0, 11)).toEqual(Array(11).fill("8,33"));
    expect(fields.months[11]).toBe("8,37");
    expect(checkLine(fields, LABELS)).toEqual({ state: "ok", total: 100, months: [...Array(11).fill(8.33), 8.37] });
  });

  it("follows the previous safra's shape under Como a safra anterior, zero where it spent nothing", () => {
    const shape = [0, 0, 1, 1, 2, 2, 0, 0, 0, 0, 0, 0];
    const fields = withTotal({ ...blank, distribution: "previous" }, "1.200", shape);
    expect(fields.months).toEqual(distribute(1200, "previous", shape).map((m) => formatNumber(m, 2)));
    expect(fields.months[0]).toBe("0,00");
    expect(checkLine(fields, LABELS).state).toBe("ok");
  });

  it("keeps the months under Manual", () => {
    const manual: LineFields = { total: "100", distribution: "manual", months: ["50", "50", ...Array(10).fill("")] };
    expect(withTotal(manual, "120", FLAT)).toEqual({ ...manual, total: "120" });
  });

  it("blanks the months while the total is not a number", () => {
    expect(withTotal(withTotal(blank, "1.200", FLAT), "abc", FLAT).months).toEqual(Array(12).fill(""));
  });
});

describe("withMonth", () => {
  it("keeps the month as typed and makes the line Manual", () => {
    const even = withTotal(blank, "1.200", FLAT);
    const edited = withMonth(even, 0, "150");
    expect(edited.distribution).toBe("manual");
    expect(edited.months[0]).toBe("150");
    expect(edited.months.slice(1)).toEqual(even.months.slice(1));
    expect(edited.total).toBe("1.200");
  });
});

describe("withDistribution", () => {
  it("spreads the total again when Igual or Como a safra anterior is picked", () => {
    const edited = withMonth(withTotal(blank, "1.200", FLAT), 0, "150");
    expect(withDistribution(edited, "equal", FLAT).months).toEqual(Array(12).fill("100,00"));
  });

  it("keeps the months when Manual is picked", () => {
    const even = withTotal(blank, "1.200", FLAT);
    expect(withDistribution(even, "manual", FLAT)).toEqual({ ...even, distribution: "manual" });
  });
});

describe("checkLine", () => {
  it("is blank when nothing is typed, whatever the distribution", () => {
    expect(checkLine(blank, LABELS)).toEqual({ state: "blank" });
    expect(checkLine({ ...blank, distribution: "previous" }, LABELS)).toEqual({ state: "blank" });
  });

  it("refuses typed months that do not add up to the total", () => {
    const edited = withMonth(withTotal(blank, "1.200", FLAT), 0, "150");
    expect(checkLine(edited, LABELS)).toEqual({ state: "off", total: 1200, sum: 1250 });
  });

  it("reads an empty month as zero", () => {
    const fields: LineFields = { total: "100", distribution: "manual", months: ["100", ...EMPTY] };
    expect(checkLine(fields, LABELS)).toEqual({ state: "ok", total: 100, months: [100, ...Array(11).fill(0)] });
  });

  it("names the month that is not a number, and asks for the total", () => {
    expect(checkLine({ total: "100", distribution: "manual", months: ["abc", ...EMPTY] }, LABELS)).toEqual({
      state: "invalid",
      message: "Valor inválido em out/25.",
    });
    expect(checkLine({ total: "", distribution: "manual", months: ["100", ...EMPTY] }, LABELS)).toEqual({
      state: "invalid",
      message: "Informe o total em reais.",
    });
  });

  it("refuses negative values", () => {
    expect(checkLine({ total: "100", distribution: "manual", months: ["-100", "200", ...Array(10).fill("")] }, LABELS)).toEqual({
      state: "invalid",
      message: "Os valores não podem ser negativos.",
    });
  });
});
