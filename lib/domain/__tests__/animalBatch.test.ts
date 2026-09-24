import { describe, expect, it } from "vitest";
import type { CustomCategory } from "@/lib/types";
import {
  BATCH_MAX_ROWS,
  appendEarTags,
  batchPayloads,
  effectiveRow,
  isBlankRow,
  parseEarTagList,
  parseWeightKg,
  removeProblemRows,
  sequenceEarTags,
  validateBatch,
  withOverride,
  type BatchDefaults,
  type BatchRow,
} from "@/lib/domain/animalBatch";

const TODAY = "2026-09-12";

const DEFAULTS: BatchDefaults = {
  category: "base:calf",
  breed: "Nelore",
  sex: "female",
  birthDate: "2025",
  lotId: "lot-1",
  weightKg: "",
};

const BLANK_DEFAULTS: BatchDefaults = {
  category: "",
  breed: "",
  sex: "",
  birthDate: "",
  lotId: "",
  weightKg: "",
};

const CUSTOM: CustomCategory[] = [{ id: "cc-1", name: "Garrote", baseCategory: "steer" }];

let seq = 0;
function row(earTag: string, patch: Partial<Omit<BatchRow, "key" | "earTag">> = {}): BatchRow {
  seq += 1;
  return { key: `r${seq}`, earTag, weightKg: "", overrides: {}, ...patch };
}

function ctx(existingEarTags: string[] = []) {
  return { existingEarTags, customCategories: CUSTOM, todayIso: TODAY };
}

const newKey = () => `k${++seq}`;

describe("sequenceEarTags", () => {
  it("runs from the first number with the prefix", () => {
    expect(sequenceEarTags("BR-", "1001", 3)).toEqual(["BR-1001", "BR-1002", "BR-1003"]);
  });

  it("keeps the width of the first number", () => {
    expect(sequenceEarTags("", "0098", 3)).toEqual(["0098", "0099", "0100"]);
  });

  it("grows past the width when the first number has no zeros to spare", () => {
    expect(sequenceEarTags("", "98", 3)).toEqual(["98", "99", "100"]);
  });

  it("returns nothing for a start that is not a number or a quantity below one", () => {
    expect(sequenceEarTags("BR-", "10a", 3)).toEqual([]);
    expect(sequenceEarTags("BR-", "1", 0)).toEqual([]);
  });

  it("stops at the batch limit", () => {
    expect(sequenceEarTags("", "1", 900)).toHaveLength(BATCH_MAX_ROWS);
  });
});

describe("parseEarTagList", () => {
  it("splits on lines, commas, semicolons and tabs and drops blanks", () => {
    expect(parseEarTagList("BR-1\r\nBR-2, BR-3;BR-4\tBR-5\n\n")).toEqual({
      earTags: ["BR-1", "BR-2", "BR-3", "BR-4", "BR-5"],
      repeated: [],
    });
  });

  it("keeps a repeated brinco once and reports it", () => {
    expect(parseEarTagList("BR-1\nBR-2\nBR-1\nBR-1")).toEqual({
      earTags: ["BR-1", "BR-2"],
      repeated: ["BR-1"],
    });
  });
});

describe("isBlankRow", () => {
  it("is blank with no brinco, no weight and no override", () => {
    expect(isBlankRow(row("  "))).toBe(true);
    expect(isBlankRow(row("", { weightKg: "180" }))).toBe(false);
    expect(isBlankRow(row("", { overrides: { sex: "male" } }))).toBe(false);
  });
});

describe("appendEarTags", () => {
  it("replaces the blank lines at the end of the list", () => {
    const result = appendEarTags([row("BR-1"), row(""), row("")], ["BR-2"], newKey);

    expect(result.rows.map((r) => r.earTag)).toEqual(["BR-1", "BR-2"]);
    expect(result.dropped).toBe(0);
  });

  it("keeps a blank line that sits between filled ones", () => {
    const result = appendEarTags([row(""), row("BR-1")], ["BR-2"], newKey);

    expect(result.rows.map((r) => r.earTag)).toEqual(["", "BR-1", "BR-2"]);
  });

  it("stops at the limit and counts what did not fit", () => {
    const full = Array.from({ length: BATCH_MAX_ROWS - 1 }, (_, i) => row(`A-${i}`));
    const result = appendEarTags(full, ["x", "y", "z"], newKey);

    expect(result.rows).toHaveLength(BATCH_MAX_ROWS);
    expect(result.dropped).toBe(2);
  });
});

describe("effectiveRow", () => {
  it("fills every field from the padrão", () => {
    expect(effectiveRow(row("BR-1"), DEFAULTS, CUSTOM)).toEqual({ ...DEFAULTS, sexLocked: false });
  });

  it("lets an override win", () => {
    const effective = effectiveRow(row("BR-1", { overrides: { breed: "Angus", sex: "male" } }), DEFAULTS, CUSTOM);

    expect(effective.breed).toBe("Angus");
    expect(effective.sex).toBe("male");
  });

  it("locks the sex a category implies, over any override", () => {
    const effective = effectiveRow(
      row("BR-1", { overrides: { category: "base:cow", sex: "male" } }),
      DEFAULTS,
      CUSTOM
    );

    expect(effective.sex).toBe("female");
    expect(effective.sexLocked).toBe(true);
  });

  it("reads the implied sex of a custom category from its base", () => {
    const effective = effectiveRow(row("BR-1", { overrides: { category: "custom:cc-1" } }), DEFAULTS, CUSTOM);

    expect(effective.sex).toBe("male");
    expect(effective.sexLocked).toBe(true);
  });
});

describe("effectiveRow weight", () => {
  it("takes the padrão weight unless the line typed its own", () => {
    const defaults = { ...DEFAULTS, weightKg: "320" };

    expect(effectiveRow(row("BR-1"), defaults, CUSTOM).weightKg).toBe("320");
    expect(effectiveRow(row("BR-1", { weightKg: "285" }), defaults, CUSTOM).weightKg).toBe("285");
    expect(effectiveRow(row("BR-1", { weightKg: "  " }), defaults, CUSTOM).weightKg).toBe("320");
  });
});

describe("withOverride", () => {
  it("records a value that differs from the padrão", () => {
    expect(withOverride(row("BR-1"), "breed", "Angus", DEFAULTS, CUSTOM).overrides).toEqual({ breed: "Angus" });
  });

  it("drops the override when the value matches the padrão or is blank", () => {
    const angus = row("BR-1", { overrides: { breed: "Angus", birthDate: "14/03/2025" } });

    const back = withOverride(angus, "breed", "Nelore", DEFAULTS, CUSTOM);
    expect(withOverride(back, "birthDate", "  ", DEFAULTS, CUSTOM).overrides).toEqual({});
  });

  it("keeps a typed nascimento even when it spells the padrão", () => {
    expect(withOverride(row("BR-1"), "birthDate", "2025", DEFAULTS, CUSTOM).overrides).toEqual({
      birthDate: "2025",
    });
  });

  it("drops a sex override when the new category implies the sex", () => {
    const macho = row("BR-1", { overrides: { sex: "male" } });

    expect(withOverride(macho, "category", "base:heifer", DEFAULTS, CUSTOM).overrides).toEqual({
      category: "base:heifer",
    });
  });
});

describe("parseWeightKg", () => {
  it("reads blank as no weight and a positive number with dot or comma", () => {
    expect(parseWeightKg("")).toBeUndefined();
    expect(parseWeightKg("182")).toBe(182);
    expect(parseWeightKg("182,5")).toBe(182.5);
    expect(parseWeightKg("182.5")).toBe(182.5);
  });

  it("refuses zero, negatives and text", () => {
    expect(parseWeightKg("0")).toBeNull();
    expect(parseWeightKg("-5")).toBeNull();
    expect(parseWeightKg("abc")).toBeNull();
  });
});

describe("validateBatch", () => {
  it("passes a clean list and counts filled and weighed lines, ignoring blanks", () => {
    const result = validateBatch([row("BR-1", { weightKg: "180" }), row("BR-2"), row("")], DEFAULTS, ctx());

    expect(result).toEqual({
      rows: [{}, {}, {}],
      defaults: {},
      filledCount: 2,
      weighedCount: 1,
      problemRows: 0,
      valid: true,
    });
  });

  it("flags a brinco already in the herd", () => {
    const result = validateBatch([row("BR-1"), row("BR-2")], DEFAULTS, ctx(["BR-2"]));

    expect(result.rows[1]).toEqual({ earTag: "Já existe um animal com este brinco." });
    expect(result.problemRows).toBe(1);
    expect(result.valid).toBe(false);
  });

  it("flags the later repeat with the line of the first", () => {
    const result = validateBatch([row("BR-1"), row("BR-2"), row(" BR-1 ")], DEFAULTS, ctx());

    expect(result.rows[0]).toEqual({});
    expect(result.rows[2]).toEqual({ earTag: "Brinco repetido na linha 1." });
  });

  it("asks for the brinco on a line that has other data", () => {
    const result = validateBatch([row("", { weightKg: "180" })], DEFAULTS, ctx());

    expect(result.rows[0].earTag).toBe("Informe o brinco do animal.");
  });

  it("flags a birth override that cannot be read or lies in the future", () => {
    const result = validateBatch(
      [
        row("BR-1", { overrides: { birthDate: "31/02/2025" } }),
        row("BR-2", { overrides: { birthDate: "2027" } }),
      ],
      DEFAULTS,
      ctx()
    );

    expect(result.rows[0].birthDate).toBe("Data inválida. Use DD/MM/AAAA ou só o ano.");
    expect(result.rows[1].birthDate).toBe("O nascimento não pode ser no futuro.");
  });

  it("flags a weight that is not a positive number", () => {
    const result = validateBatch([row("BR-1", { weightKg: "0" })], DEFAULTS, ctx());

    expect(result.rows[0].weightKg).toBe("Informe um peso válido em kg.");
  });

  it("reports a missing padrão field only when some line relies on it", () => {
    const result = validateBatch(
      [row("BR-1", { overrides: { breed: "Angus", lotId: "lot-2", birthDate: "2024" } })],
      BLANK_DEFAULTS,
      ctx()
    );

    expect(result.defaults).toEqual({
      category: "Selecione a categoria.",
      sex: "Selecione o sexo.",
    });
    expect(result.problemRows).toBe(0);
    expect(result.valid).toBe(false);
  });

  it("does not ask for the padrão sex when the category implies it", () => {
    const result = validateBatch([row("BR-1")], { ...DEFAULTS, category: "base:cow", sex: "" }, ctx());

    expect(result.defaults).toEqual({});
  });

  it("flags a padrão birth that cannot be read", () => {
    const result = validateBatch([row("BR-1")], { ...DEFAULTS, birthDate: "abc" }, ctx());

    expect(result.defaults.birthDate).toBe("Data inválida. Use DD/MM/AAAA ou só o ano.");
  });

  it("counts lines that take the padrão weight as weighed", () => {
    const result = validateBatch(
      [row("BR-1"), row("BR-2", { weightKg: "285" })],
      { ...DEFAULTS, weightKg: "320" },
      ctx()
    );

    expect(result.weighedCount).toBe(2);
    expect(result.valid).toBe(true);
  });

  it("flags a padrão weight that is not a positive number only when a line relies on it", () => {
    const bad = { ...DEFAULTS, weightKg: "abc" };

    expect(validateBatch([row("BR-1")], bad, ctx()).defaults).toEqual({
      weightKg: "Informe um peso válido em kg.",
    });
    expect(validateBatch([row("BR-1", { weightKg: "285" })], bad, ctx()).defaults).toEqual({});
  });

  it("never passes an empty list", () => {
    const result = validateBatch([row("")], BLANK_DEFAULTS, ctx());

    expect(result.valid).toBe(false);
    expect(result.filledCount).toBe(0);
    expect(result.defaults).toEqual({});
  });
});

describe("removeProblemRows", () => {
  it("drops lines with errors of their own and keeps the rest", () => {
    const rows = [row("BR-1"), row("BR-1"), row("")];
    const kept = removeProblemRows(rows, validateBatch(rows, DEFAULTS, ctx()));

    expect(kept).toEqual([rows[0], rows[2]]);
  });
});

describe("batchPayloads", () => {
  it("turns each filled line into an animal", () => {
    const rows = [
      row(" BR-1 ", { weightKg: "182,5" }),
      row("BR-2", { overrides: { category: "custom:cc-1", birthDate: "14/03/2025" } }),
      row(""),
    ];

    expect(batchPayloads(rows, DEFAULTS, CUSTOM)).toEqual([
      {
        earTag: "BR-1",
        category: "calf",
        breed: "Nelore",
        sex: "female",
        birthDate: "2025-01-01",
        lotId: "lot-1",
        initialWeightKg: 182.5,
      },
      {
        earTag: "BR-2",
        category: "steer",
        customCategoryId: "cc-1",
        breed: "Nelore",
        sex: "male",
        birthDate: "2025-03-14",
        lotId: "lot-1",
      },
    ]);
  });

  it("sends the padrão weight for lines without their own", () => {
    const rows = [row("BR-1"), row("BR-2", { weightKg: "285" })];

    expect(
      batchPayloads(rows, { ...DEFAULTS, weightKg: "320,5" }, CUSTOM).map((a) => a.initialWeightKg)
    ).toEqual([320.5, 285]);
  });
});
