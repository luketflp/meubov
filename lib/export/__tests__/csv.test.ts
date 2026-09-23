import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/export/csv";
import { buildTable, formatCell, withoutMoney } from "@/lib/export/table";
import { exportFileName } from "@/lib/export/fileName";

const table = buildTable(
  "Rebanho",
  [
    { header: "Brinco", value: (r: { tag: string }) => r.tag },
    { header: "Nascimento", kind: "date", value: () => "2019-03-12" },
    { header: "Peso (kg)", kind: "number", decimals: 1, value: () => 1234.5 },
    { header: "Valor (R$)", kind: "money", value: () => null },
  ],
  [{ tag: "0412" }, { tag: 'a;"b"' }]
);

describe("toCsv", () => {
  it("writes a header, semicolons, pt-BR dates and decimal commas without thousands dots", () => {
    const lines = toCsv(table).split("\r\n");
    expect(lines[0]).toBe("Brinco;Nascimento;Peso (kg);Valor (R$)");
    expect(lines[1]).toBe("0412;12/03/2019;1234,5;");
  });

  it("quotes a field holding the separator or a quote", () => {
    expect(toCsv(table).split("\r\n")[2]).toBe('"a;""b""";12/03/2019;1234,5;');
  });
});

describe("toCsv formulas", () => {
  it("keeps text that looks like a formula as text, and negative numbers as numbers", () => {
    const risky = buildTable(
      "X",
      [
        { header: "Obs", value: (r: { obs: string; n: number }) => r.obs },
        { header: "N", kind: "number", value: (r: { obs: string; n: number }) => r.n },
      ],
      [{ obs: "=HYPERLINK(\"x\")", n: -2 }]
    );
    expect(toCsv(risky).split("\r\n")[1]).toBe('"\'=HYPERLINK(""x"")";-2');
  });
});

describe("formatCell", () => {
  it("formats for reading: thousands dots, dates and currency", () => {
    expect(formatCell(1234.5, { header: "", kind: "number", decimals: 1 })).toBe("1.234,5");
    expect(formatCell("2026-09-22", { header: "", kind: "date" })).toBe("22/09/2026");
    expect(formatCell(1619939.2, { header: "", kind: "money" })).toBe("1.619.939,20");
    expect(formatCell(null, { header: "", kind: "number" })).toBe("—");
  });
});

describe("withoutMoney", () => {
  it("drops money columns when money is hidden and keeps them otherwise", () => {
    expect(withoutMoney(table, false).columns.map((c) => c.header)).toEqual(["Brinco", "Nascimento", "Peso (kg)"]);
    expect(withoutMoney(table, false).rows[0]).toEqual(["0412", "2019-03-12", 1234.5]);
    expect(withoutMoney(table, true)).toBe(table);
  });
});

describe("exportFileName", () => {
  it("joins a slug of the list and farm with the date", () => {
    expect(exportFileName("Rebanho", "Fazenda Boa Vista", "2026-09-22", "xlsx")).toBe(
      "rebanho_fazenda-boa-vista_2026-09-22.xlsx"
    );
    expect(exportFileName("Declaração de rebanho", "Sítio São João", "2026-09-22", "csv")).toBe(
      "declaracao-de-rebanho_sitio-sao-joao_2026-09-22.csv"
    );
  });
});
