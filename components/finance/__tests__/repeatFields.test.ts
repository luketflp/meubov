import { describe, expect, it } from "vitest";

import { initialRepeat, repeatFromFields } from "@/components/finance/RepeatSection";

const DATE = "2026-09-27";

describe("repeatFromFields", () => {
  it("is null for Uma vez", () => {
    expect(repeatFromFields(initialRepeat(DATE), DATE)).toBeNull();
  });

  it("builds a parcelamento from the first vencimento", () => {
    const fields = { ...initialRepeat(DATE), choice: "installments" as const, count: "3", firstDue: "2026-10-10" };
    expect(repeatFromFields(fields, DATE)).toEqual({
      mode: "installments",
      count: 3,
      frequency: "monthly",
      startsOn: "2026-10-10",
    });
  });

  it("refuses 1 or 49 parcelas and a first parcela before Data", () => {
    const base = { ...initialRepeat(DATE), choice: "installments" as const };
    expect(repeatFromFields({ ...base, count: "1" }, DATE)).toBe("Informe de 2 a 48 parcelas.");
    expect(repeatFromFields({ ...base, count: "49" }, DATE)).toBe("Informe de 2 a 48 parcelas.");
    expect(repeatFromFields({ ...base, firstDue: "2026-09-01" }, DATE)).toBe(
      "A primeira parcela não pode vencer antes da data"
    );
  });

  it("starts a monthly recorrência on the next day it falls on", () => {
    const fields = { ...initialRepeat(DATE), choice: "recurring" as const, day: "5", noEnd: false, until: "2026-12-31" };
    expect(repeatFromFields(fields, DATE)).toEqual({
      mode: "recurring",
      frequency: "monthly",
      dayOfMonth: 5,
      startsOn: "2026-10-05",
      endsOn: "2026-12-31",
    });
  });

  it("starts a weekly recorrência on Data, sem fim", () => {
    const fields = { ...initialRepeat(DATE), choice: "recurring" as const, frequency: "weekly" as const };
    expect(repeatFromFields(fields, DATE)).toEqual({
      mode: "recurring",
      frequency: "weekly",
      dayOfMonth: undefined,
      startsOn: DATE,
      endsOn: undefined,
    });
  });

  it("asks for até unless sem fim", () => {
    const fields = { ...initialRepeat(DATE), choice: "recurring" as const, noEnd: false, until: "" };
    expect(repeatFromFields(fields, DATE)).toBe("Informe até quando repete, ou marque sem fim.");
  });
});
