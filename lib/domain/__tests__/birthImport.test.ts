import { describe, expect, it } from "vitest";
import {
  birthImportFieldForHeader,
  birthImportPayloads,
  buildBirthImportRows,
  buildBirthTemplateCsv,
  damNote,
  formatEarTagList,
  mergeSheetCells,
  MAX_BIRTH_IMPORT_ROWS,
  summarizeBirthImport,
  type BirthImportContext,
} from "@/lib/domain/birthImport";

const HEADERS = ["BRINCO MÃE", "BRINCO BEZ", "SEXO", "RAÇA", "PESO", "DATA", "LOTE"];

const ctx = (over: Partial<BirthImportContext> = {}): BirthImportContext => ({
  animals: [
    { id: "d1", earTag: "R381", sex: "female", breed: "Angus" },
    { id: "d2", earTag: "vm554", sex: "female", breed: "Nelore" },
    { id: "b1", earTag: "T1", sex: "male", breed: "Nelore" },
    { id: "c0", earTag: "BB90", sex: "male", breed: "Nelore" },
  ],
  breeds: ["Angus", "Nelore"],
  lots: [
    { id: "l1", name: "Lote 2" },
    { id: "l2", name: "Maternidade" },
  ],
  todayIso: "2025-10-10",
  ...over,
});

const sheet = (...rows: unknown[][]) => [HEADERS, ...rows];
const line = (over: Partial<Record<string, unknown>> = {}) => [
  over.dam ?? "R381", over.calf ?? "BB97", over.sex ?? "M", over.breed ?? "ANGUS",
  over.kg ?? 28, over.date ?? "29/09/2025", over.lot ?? "2", ...((over.extra as unknown[]) ?? []),
];

describe("birthImportFieldForHeader", () => {
  it("reads the caderno's headers", () => {
    expect(HEADERS.map(birthImportFieldForHeader)).toEqual([
      "damEarTag", "calfEarTag", "sex", "breed", "weightKg", "date", "lot",
    ]);
    expect(birthImportFieldForHeader("Brinco bezerra")).toBe("calfEarTag");
    expect(birthImportFieldForHeader("Brinco bezer")).toBe("calfEarTag");
    expect(birthImportFieldForHeader("Peso ao nascer")).toBe("weightKg");
    expect(birthImportFieldForHeader("Data do parto")).toBe("date");
    expect(birthImportFieldForHeader("Matriz")).toBe("damEarTag");
    expect(birthImportFieldForHeader("Observação")).toBeUndefined();
  });
});

describe("buildBirthImportRows", () => {
  it("reports missing columns with the headers it read", () => {
    const result = buildBirthImportRows([["BRINCO MÃE", "BEZ", "SEXO", "DIA", "LOTE"], ["R381"]], ctx());
    expect(result.headerError).toBe("Colunas obrigatórias ausentes: Brinco do bezerro, Data do parto.");
    expect(result.headers).toEqual(["BRINCO MÃE", "BEZ", "SEXO", "DIA", "LOTE"]);
    expect(result.rows).toEqual([]);
  });

  it("refuses an empty file and a file over the limit", () => {
    expect(buildBirthImportRows([], ctx()).headerError).toBe("Arquivo vazio.");
    expect(buildBirthImportRows([HEADERS], ctx()).headerError).toBe(
      "Nenhuma linha de dados encontrada no arquivo."
    );
    const many = Array.from({ length: MAX_BIRTH_IMPORT_ROWS + 1 }, (_, i) => line({ calf: `B${i}` }));
    expect(buildBirthImportRows(sheet(...many), ctx()).headerError).toContain("O limite por importação é 2000");
  });

  it("builds a ready line with the dam, the farm's raça and the parsed values", () => {
    const [row] = buildBirthImportRows(sheet(line()), ctx()).rows;
    expect(row.status).toBe("ok");
    expect(row.dam).toEqual({ kind: "matched", id: "d1", earTag: "R381", breed: "Angus" });
    expect(row.breed).toBe("Angus");
    expect(row.parsed).toEqual({ calfEarTag: "BB97", sex: "male", date: "2025-09-29", weightKg: 28 });
  });

  it("matches the dam ignoring case only when one animal fits", () => {
    const [row] = buildBirthImportRows(sheet(line({ dam: "VM554" })), ctx()).rows;
    expect(row.dam).toMatchObject({ kind: "matched", id: "d2" });
  });

  it("imports the calf alone when the dam has no tag, is a male or is not on the farm", () => {
    const rows = buildBirthImportRows(
      sheet(
        line({ dam: "R S/ BRINCO", calf: "B1" }),
        line({ dam: "", calf: "B2" }),
        line({ dam: "T1", calf: "B3" }),
        line({ dam: "R394", calf: "B4" }),
      ),
      ctx()
    ).rows;
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(rows.map((r) => r.dam.kind)).toEqual(["no_tag", "no_tag", "male", "not_found"]);
    expect(rows.map((r) => damNote(r.dam))).toEqual([
      "Mãe sem brinco. Entra só o bezerro.",
      "Mãe sem brinco. Entra só o bezerro.",
      "T1 é um macho. Entra só o bezerro.",
      "R394 não é uma fêmea do rebanho. Entra só o bezerro.",
    ]);
  });

  it("creates an unknown raça in title case and falls back to the dam's when blank", () => {
    const result = buildBirthImportRows(
      sheet(
        line({ calf: "B1", breed: "BRAHMAN" }),
        line({ calf: "B2", breed: "brahman" }),
        line({ calf: "B3", breed: "" }),
        line({ calf: "B4", breed: "", dam: "R394" }),
      ),
      ctx()
    );
    expect(result.rows.map((r) => r.breed)).toEqual(["Brahman", "Brahman", "Angus", ""]);
    expect(result.rows[3].errors.breed).toBe("Informe a raça.");
    expect(result.newBreeds).toEqual(["Brahman"]);
  });

  it("refuses a bare year, a future parto and a bad sex or weight", () => {
    const rows = buildBirthImportRows(
      sheet(
        line({ calf: "B1", date: 2025 }),
        line({ calf: "B2", date: "11/10/2025" }),
        line({ calf: "B3", sex: "X", kg: "abc" }),
        line({ calf: "B4", sex: "", date: "" }),
      ),
      ctx()
    ).rows;
    expect(rows.map((r) => r.status)).toEqual(["error", "error", "error", "error"]);
    expect(rows[0].errors.date).toBe("Data inválida (use DD/MM/AAAA).");
    expect(rows[1].errors.date).toBe("O parto não pode ser no futuro.");
    expect(rows[2].errors).toEqual({ sex: "Sexo não reconhecido (use M ou F).", weightKg: "Peso inválido." });
    expect(rows[3].errors).toEqual({ sex: "Informe o sexo.", date: "Informe a data do parto." });
  });

  it("reads a real date cell", () => {
    const [row] = buildBirthImportRows(sheet(line({ date: new Date(2025, 9, 6) })), ctx()).rows;
    expect(row.parsed?.date).toBe("2025-10-06");
  });

  it("finds morreu in any extra cell", () => {
    const rows = buildBirthImportRows(
      sheet(line({ calf: "B1", extra: ["MORREU"] }), line({ calf: "B2", extra: ["", "natimorto dia 7"] }), line({ calf: "B3", extra: ["ok"] })),
      ctx()
    ).rows;
    expect(rows.map((r) => r.deathNote)).toEqual(["MORREU", "natimorto dia 7", undefined]);
  });

  it("skips brincos already on the farm or repeated in the file", () => {
    const rows = buildBirthImportRows(sheet(line({ calf: "BB90" }), line({ calf: "B1" }), line({ calf: "B1" })), ctx()).rows;
    expect(rows.map((r) => [r.status, r.duplicateReason])).toEqual([
      ["duplicate", "in_herd"], ["ok", undefined], ["duplicate", "in_file"],
    ]);
  });

  it("matches lotes by name or by number and groups the rest for a pick", () => {
    const result = buildBirthImportRows(
      sheet(
        line({ calf: "B1", lot: "02" }),
        line({ calf: "B2", lot: "lote 2" }),
        line({ calf: "B3", lot: "MATERNIDADE" }),
        line({ calf: "B4", lot: "Pasto 9" }),
        line({ calf: "B5", lot: "pasto 9" }),
      ),
      ctx()
    );
    expect(result.lotValues).toEqual([
      { key: "2", label: "02", lines: 2, lotId: "l1" },
      { key: "maternidade", label: "MATERNIDADE", lines: 1, lotId: "l2" },
      { key: "pasto 9", label: "Pasto 9", lines: 2, lotId: undefined },
    ]);
  });
});

describe("summarizeBirthImport and birthImportPayloads", () => {
  const result = buildBirthImportRows(
    sheet(
      line({ calf: "B1" }),
      line({ calf: "B2", dam: "R394", lot: "Pasto 9", extra: ["morreu"] }),
      line({ calf: "BB90" }),
      line({ calf: "B3", sex: "" }),
    ),
    ctx()
  );

  it("counts the lines and asks for the unmatched lote", () => {
    expect(summarizeBirthImport(result, {})).toEqual({
      total: 4, ready: 2, duplicate: 1, error: 1, withoutDam: 1, deaths: 1,
      unpickedLots: [{ key: "pasto 9", label: "Pasto 9", lines: 1, lotId: undefined }],
    });
    expect(summarizeBirthImport(result, { "pasto 9": "l2" }).unpickedLots).toEqual([]);
  });

  it("sends the ready lines whose lote resolves", () => {
    expect(birthImportPayloads(result, {})).toEqual([
      { calfEarTag: "B1", calfSex: "male", breed: "Angus", lotId: "l1", date: "2025-09-29", damId: "d1", weightKg: 28 },
    ]);
    expect(birthImportPayloads(result, { "pasto 9": "l2" })[1]).toEqual({
      calfEarTag: "B2", calfSex: "male", breed: "Angus", lotId: "l2", date: "2025-09-29", weightKg: 28, deathNotes: "morreu",
    });
  });
});

describe("mergeSheetCells", () => {
  it("keeps raw dates and weights and the displayed text elsewhere", () => {
    const date = new Date(2025, 8, 29);
    const merged = mergeSheetCells(
      [HEADERS, [381, 97, "M", "ANGUS", 28, date, 2, "MORREU"]],
      [HEADERS, ["0381", "0097", "M", "ANGUS", "28", "29/09/2025", "02", "MORREU"]]
    );
    expect(merged[1]).toEqual(["0381", "0097", "M", "ANGUS", 28, date, "02", "MORREU"]);
  });
});

describe("formatEarTagList", () => {
  it("joins in pt-BR and cuts long lists", () => {
    expect(formatEarTagList(["A"])).toBe("A");
    expect(formatEarTagList(["A", "B", "C"])).toBe("A, B e C");
    expect(formatEarTagList(["A", "B", "C", "D"], 2)).toBe("A, B e mais 2");
  });
});

describe("buildBirthTemplateCsv", () => {
  it("round-trips through the parser", () => {
    const csv = buildBirthTemplateCsv().replace(/^﻿/, "");
    const matrix = csv.trim().split("\n").map((l) => l.split(","));
    const result = buildBirthImportRows(matrix, ctx({ todayIso: "2030-01-01" }));
    expect(result.headerError).toBeUndefined();
    expect(result.rows[0].status).toBe("ok");
  });
});
