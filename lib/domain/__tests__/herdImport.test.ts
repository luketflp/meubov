import { describe, expect, it } from "vitest";
import type { CustomCategory } from "@/lib/types";
import {
  buildImportRows,
  buildTemplateCsv,
  importablePayloads,
  MAX_IMPORT_ROWS,
  normalizeHeader,
  parseCategory,
  parseImportDate,
  parseSex,
  parseWeight,
  type BuildImportRowsContext,
} from "@/lib/domain/herdImport";

const HEADERS = ["brinco", "categoria", "raça", "sexo", "nascimento", "lote", "peso"];

const CUSTOM: CustomCategory[] = [
  { id: "c1", name: "Matrizes", baseCategory: "cow" },
];

const ctx = (over: Partial<BuildImportRowsContext> = {}): BuildImportRowsContext => ({
  customCategories: [],
  existingEarTags: [],
  todayIso: "2026-08-04",
  ...over,
});

/** Builds a sheet matrix from data rows using the standard header. */
function sheet(...rows: unknown[][]): unknown[][] {
  return [HEADERS, ...rows];
}

describe("normalizeHeader", () => {
  it("lowercases, strips accents and collapses spaces", () => {
    expect(normalizeHeader("  Raça ")).toBe("raca");
    expect(normalizeHeader("Peso (Kg)")).toBe("peso kg");
    expect(normalizeHeader("Data de Nascimento")).toBe("data de nascimento");
  });
});

describe("parseCategory", () => {
  it("matches the canonical english value", () => {
    expect(parseCategory("heifer", [])).toEqual({ category: "heifer" });
  });

  it("matches pt-BR labels case/accent-insensitively", () => {
    expect(parseCategory("Novilha", [])).toEqual({ category: "heifer" });
    expect(parseCategory("BOI", [])).toEqual({ category: "steer" });
    expect(parseCategory("vaca", [])).toEqual({ category: "cow" });
  });

  it("matches a farm custom category, carrying its id and base", () => {
    expect(parseCategory("matrizes", CUSTOM)).toEqual({
      category: "cow",
      customCategoryId: "c1",
    });
  });

  it("returns null for empty or unknown values", () => {
    expect(parseCategory("", [])).toBeNull();
    expect(parseCategory("dragão", [])).toBeNull();
  });
});

describe("parseSex", () => {
  it("accepts pt-BR and abbreviations", () => {
    expect(parseSex("Macho")).toBe("male");
    expect(parseSex("M")).toBe("male");
    expect(parseSex("Fêmea")).toBe("female");
    expect(parseSex("f")).toBe("female");
  });

  it("returns null for empty or unknown", () => {
    expect(parseSex("")).toBeNull();
    expect(parseSex("x")).toBeNull();
  });
});

describe("parseImportDate", () => {
  it("accepts ISO", () => {
    expect(parseImportDate("2022-11-01")).toBe("2022-11-01");
  });

  it("accepts Brazilian DD/MM/YYYY and D/M/YYYY", () => {
    expect(parseImportDate("15/03/2023")).toBe("2023-03-15");
    expect(parseImportDate("1/2/2024")).toBe("2024-02-01");
    expect(parseImportDate("05-06-2021")).toBe("2021-06-05");
  });

  it("accepts a JS Date (SheetJS cellDates)", () => {
    expect(parseImportDate(new Date(2023, 2, 15))).toBe("2023-03-15");
  });

  it("rejects impossible or unparseable dates", () => {
    expect(parseImportDate("31/02/2023")).toBeNull();
    expect(parseImportDate("not a date")).toBeNull();
    expect(parseImportDate("")).toBeNull();
  });
});

describe("parseWeight", () => {
  it("accepts numbers and comma decimals", () => {
    expect(parseWeight(320)).toBe(320);
    expect(parseWeight("450,5")).toBe(450.5);
    expect(parseWeight("1.234,5")).toBe(1234.5);
  });

  it("returns null for empty or invalid", () => {
    expect(parseWeight("")).toBeNull();
    expect(parseWeight("abc")).toBeNull();
    expect(parseWeight("0")).toBeNull();
    expect(parseWeight("-5")).toBeNull();
  });
});

describe("buildImportRows — headers", () => {
  it("errors when a required column is missing", () => {
    const result = buildImportRows([["brinco", "categoria"]], ctx());
    expect(result.headerError).toContain("Raça");
    expect(result.rows).toHaveLength(0);
  });

  it("maps synonym/accented headers to fields", () => {
    const matrix = [
      ["Brinco", "Categoria", "Raça", "Sexo", "Data de Nascimento", "Lote", "Peso (kg)"],
      ["A1", "Novilha", "Nelore", "", "15/03/2023", "Lote 1", "320"],
    ];
    const result = buildImportRows(matrix, ctx());
    expect(result.counts.ok).toBe(1);
    expect(result.rows[0].payload?.lot).toBe("Lote 1");
  });

  it("does not let a leftmost internal ID column hijack the ear tag", () => {
    const matrix = [
      ["ID", "Brinco", "Categoria", "Raça", "Sexo", "Nascimento", "Lote", "Peso"],
      ["1", "BR-1042", "Novilha", "Nelore", "", "15/03/2023", "Lote 1", ""],
    ];
    const result = buildImportRows(matrix, ctx());
    expect(result.rows[0].payload?.earTag).toBe("BR-1042");
  });

  it("errors on an empty file", () => {
    expect(buildImportRows([], ctx()).headerError).toBe("Arquivo vazio.");
  });

  it("errors when there are headers but no data rows", () => {
    expect(buildImportRows([HEADERS], ctx()).headerError).toContain("Nenhuma linha");
  });

  it("errors when the file exceeds the row limit", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [
      `T${i}`,
      "Novilha",
      "Nelore",
      "",
      "15/03/2023",
      "Lote 1",
      "",
    ]);
    expect(buildImportRows(sheet(...rows), ctx()).headerError).toContain("limite");
  });
});

describe("buildImportRows — rows", () => {
  it("accepts a valid row and infers sex from the category", () => {
    const result = buildImportRows(
      sheet(["A1", "Novilha", "Nelore", "", "15/03/2023", "Lote 1", "320"]),
      ctx()
    );
    expect(result.counts.ok).toBe(1);
    expect(result.rows[0].payload).toMatchObject({
      earTag: "A1",
      category: "heifer",
      sex: "female",
      birthDate: "2023-03-15",
      lot: "Lote 1",
      weightKg: 320,
    });
  });

  it("requires sex when the category does not imply it (calf)", () => {
    const result = buildImportRows(
      sheet(["A1", "Bezerro", "Nelore", "", "15/03/2023", "Lote 1", ""]),
      ctx()
    );
    expect(result.rows[0].status).toBe("error");
    expect(result.rows[0].errors.sex).toBeDefined();
  });

  it("accepts an explicit sex for a calf", () => {
    const result = buildImportRows(
      sheet(["A1", "Bezerro", "Nelore", "Macho", "10/06/2024", "Lote 1", ""]),
      ctx()
    );
    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].payload?.sex).toBe("male");
  });

  it("lets the category's implied sex override a conflicting sex cell", () => {
    const result = buildImportRows(
      sheet(["A1", "Novilha", "Nelore", "Macho", "15/03/2023", "Lote 1", ""]),
      ctx()
    );
    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].payload?.sex).toBe("female");
  });

  it("accepts a JS Date birth cell (the SheetJS cellDates path)", () => {
    const result = buildImportRows(
      sheet(["A1", "Novilha", "Nelore", "", new Date(2023, 2, 15), "Lote 1", ""]),
      ctx()
    );
    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[0].cells.birthDate).toBe("2023-03-15");
    expect(result.rows[0].payload?.birthDate).toBe("2023-03-15");
  });

  it("flags unknown category and future birth date", () => {
    const unknown = buildImportRows(
      sheet(["A1", "Girafa", "Nelore", "", "15/03/2023", "Lote 1", ""]),
      ctx()
    );
    expect(unknown.rows[0].errors.category).toBeDefined();

    const future = buildImportRows(
      sheet(["A2", "Novilha", "Nelore", "", "01/01/2030", "Lote 1", ""]),
      ctx()
    );
    expect(future.rows[0].errors.birthDate).toContain("futuro");
  });

  it("resolves a custom category to its base plus id", () => {
    const result = buildImportRows(
      sheet(["A1", "Matrizes", "Nelore", "", "15/03/2020", "Lote 1", ""]),
      ctx({ customCategories: CUSTOM })
    );
    expect(result.rows[0].payload).toMatchObject({
      category: "cow",
      customCategoryId: "c1",
      sex: "female",
    });
  });

  it("skips ear tags that already exist on the farm", () => {
    const result = buildImportRows(
      sheet(["A1", "Novilha", "Nelore", "", "15/03/2023", "Lote 1", ""]),
      ctx({ existingEarTags: ["A1"] })
    );
    expect(result.rows[0].status).toBe("duplicate");
    expect(result.rows[0].duplicateReason).toBe("in_herd");
  });

  it("keeps the first of a repeated ear tag and marks the rest duplicate", () => {
    const result = buildImportRows(
      sheet(
        ["B2", "Novilha", "Nelore", "", "15/03/2023", "Lote 1", ""],
        ["B2", "Novilha", "Nelore", "", "15/03/2023", "Lote 1", ""]
      ),
      ctx()
    );
    expect(result.rows[0].status).toBe("ok");
    expect(result.rows[1].status).toBe("duplicate");
    expect(result.rows[1].duplicateReason).toBe("in_file");
  });

  it("returns only ok rows as importable payloads", () => {
    const result = buildImportRows(
      sheet(
        ["A1", "Novilha", "Nelore", "", "15/03/2023", "Lote 1", ""], // duplicate (in herd)
        ["A2", "Girafa", "Nelore", "", "15/03/2023", "Lote 1", ""], // error (bad category)
        ["A3", "Novilha", "Nelore", "", "15/03/2023", "Lote 1", ""] // ok
      ),
      ctx({ existingEarTags: ["A1"] })
    );
    expect(importablePayloads(result).map((p) => p.earTag)).toEqual(["A3"]);
  });

  it("skips fully blank rows", () => {
    const result = buildImportRows(
      sheet(
        ["", "", "", "", "", "", ""],
        ["A1", "Novilha", "Nelore", "", "15/03/2023", "Lote 1", ""]
      ),
      ctx()
    );
    expect(result.counts.total).toBe(1);
    expect(result.rows[0].payload?.earTag).toBe("A1");
  });
});

describe("buildTemplateCsv", () => {
  it("starts with a BOM and lists the pt-BR headers", () => {
    const csv = buildTemplateCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("brinco,categoria,raça,sexo,nascimento,lote,peso");
  });
});
