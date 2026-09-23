import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { xlsxBlob } from "@/lib/export/xlsx";
import type { ExportTable } from "@/lib/export/table";

const table: ExportTable = {
  title: "Rebanho",
  columns: [
    { header: "Brinco" },
    { header: "Nascimento", kind: "date" },
    { header: "Peso (kg)", kind: "number", decimals: 1 },
    { header: "Valor (R$)", kind: "money" },
  ],
  rows: [["0412", "2026-09-22", 472.5, 1234.5]],
};

const context = { farmName: "Fazenda Boa Vista", place: "Uberaba - MG", generatedAt: "22/09/2026 14:32", filters: [] };

async function readBack() {
  const blob = await xlsxBlob([table], context);
  return XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array", cellNF: true });
}

describe("xlsxBlob", () => {
  it("writes the calendar day whatever the time zone", async () => {
    const sheet = (await readBack()).Sheets.Rebanho;
    expect(sheet.B2.t).toBe("n");
    expect(sheet.B2.v).toBe(46287);
    expect(sheet.B2.z).toBe("dd/mm/yyyy");
  });

  it("keeps numbers as numbers with their format, and adds a Sobre sheet", async () => {
    const book = await readBack();
    expect(book.SheetNames).toEqual(["Rebanho", "Sobre"]);
    expect(book.Sheets.Rebanho.C2.v).toBe(472.5);
    expect(book.Sheets.Rebanho.D2.z).toBe("#,##0.00");
  });
});
