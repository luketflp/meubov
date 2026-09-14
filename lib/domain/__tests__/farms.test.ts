import { describe, expect, it } from "vitest";
import type { Animal, Invernada } from "@/lib/types";
import {
  FARM_FIELD_MAX,
  confirmsFarmName,
  copySummary,
  deleteVerdict,
  farmLabel,
  firstSteps,
  missingStepsSentence,
  showFirstSteps,
  validateNewFarm,
} from "@/lib/domain/farms";

// The functions only count these arrays, so bare objects stand in for the records.
const animal = {} as Animal;
const invernada = {} as Invernada;

describe("farmLabel", () => {
  it("uses the trimmed name", () => {
    expect(farmLabel({ id: 3, name: "  Fazenda Boa Vista " })).toBe("Fazenda Boa Vista");
  });

  it("falls back to the id for a farm never named", () => {
    expect(farmLabel({ id: 12, name: "   " })).toBe("Fazenda #12");
  });
});

describe("validateNewFarm", () => {
  it("trims both fields", () => {
    expect(validateNewFarm({ name: " Fazenda Boa Vista ", municipality: " Sorriso - MT " })).toEqual({
      ok: true,
      name: "Fazenda Boa Vista",
      municipality: "Sorriso - MT",
    });
  });

  it("requires a name", () => {
    expect(validateNewFarm({ name: "  ", municipality: "Sorriso - MT" })).toEqual({
      ok: false,
      problem: "name_required",
    });
  });

  it("requires a município", () => {
    expect(validateNewFarm({ name: "Fazenda Boa Vista", municipality: "" })).toEqual({
      ok: false,
      problem: "municipality_required",
    });
  });

  it("refuses a name longer than the limit", () => {
    expect(validateNewFarm({ name: "x".repeat(FARM_FIELD_MAX + 1), municipality: "Sorriso - MT" })).toEqual({
      ok: false,
      problem: "name_too_long",
    });
  });

  it("refuses a município longer than the limit", () => {
    expect(validateNewFarm({ name: "Fazenda", municipality: "x".repeat(FARM_FIELD_MAX + 1) })).toEqual({
      ok: false,
      problem: "municipality_too_long",
    });
  });

  it("accepts exactly the limit", () => {
    expect(validateNewFarm({ name: "x".repeat(FARM_FIELD_MAX), municipality: "y" }).ok).toBe(true);
  });
});

describe("deleteVerdict", () => {
  it("lets the Dono delete when another farm is left", () => {
    expect(deleteVerdict({ role: "owner", liveFarmCount: 2 })).toBe("ok");
  });

  it("refuses a member", () => {
    expect(deleteVerdict({ role: "member", liveFarmCount: 3 })).toBe("not_owner");
  });

  it("refuses the last farm", () => {
    expect(deleteVerdict({ role: "owner", liveFarmCount: 1 })).toBe("last_farm");
  });
});

describe("confirmsFarmName", () => {
  it("accepts the label typed exactly", () => {
    expect(confirmsFarmName("Fazenda Boa Vista", "Fazenda Boa Vista")).toBe(true);
  });

  it("ignores case and surrounding spaces", () => {
    expect(confirmsFarmName("  fazenda boa vista ", "Fazenda Boa Vista")).toBe(true);
  });

  it("refuses a partial name", () => {
    expect(confirmsFarmName("Fazenda Boa", "Fazenda Boa Vista")).toBe(false);
  });

  it("refuses an empty field", () => {
    expect(confirmsFarmName("", "Fazenda Boa Vista")).toBe(false);
  });
});

describe("copySummary", () => {
  it("lists all three kinds", () => {
    expect(copySummary({ breeds: 8, categories: 3, protocols: 5 })).toBe(
      "Traz 8 raças, 3 categorias e 5 protocolos sanitários."
    );
  });

  it("uses the singular", () => {
    expect(copySummary({ breeds: 1, categories: 1, protocols: 1 })).toBe(
      "Traz 1 raça, 1 categoria e 1 protocolo sanitário."
    );
  });

  it("leaves out the kinds at zero", () => {
    expect(copySummary({ breeds: 2, categories: 0, protocols: 4 })).toBe(
      "Traz 2 raças e 4 protocolos sanitários."
    );
    expect(copySummary({ breeds: 0, categories: 0, protocols: 1 })).toBe(
      "Traz 1 protocolo sanitário."
    );
  });

  it("is null when there is nothing to copy", () => {
    expect(copySummary({ breeds: 0, categories: 0, protocols: 0 })).toBeNull();
  });
});

describe("firstSteps", () => {
  it("has every step pending on a brand-new farm", () => {
    expect(firstSteps({}, [], [])).toEqual([
      { id: "headquarters", done: false },
      { id: "invernada", done: false },
      { id: "animal", done: false },
    ]);
  });

  it("marks the sede once a map view is saved", () => {
    expect(firstSteps({ headquarters: { lat: -13, lng: -56 } }, [], [])[0]).toEqual({
      id: "headquarters",
      done: true,
    });
  });

  it("marks the invernadas once one exists and the animals once one exists", () => {
    expect(firstSteps({}, [invernada], [animal])).toEqual([
      { id: "headquarters", done: false },
      { id: "invernada", done: true },
      { id: "animal", done: true },
    ]);
  });
});

describe("showFirstSteps", () => {
  it("shows the card on a farm without animals", () => {
    expect(showFirstSteps([])).toBe(true);
  });

  it("hides it once any animal exists, active or not", () => {
    expect(showFirstSteps([animal])).toBe(false);
  });
});

describe("missingStepsSentence", () => {
  const steps = (headquarters: boolean, invernada: boolean, animal: boolean) => [
    { id: "headquarters" as const, done: headquarters },
    { id: "invernada" as const, done: invernada },
    { id: "animal" as const, done: animal },
  ];

  it("lists every step on a brand-new farm", () => {
    expect(missingStepsSentence(steps(false, false, false))).toBe(
      "Faltam a sede no mapa, as invernadas e os animais."
    );
  });

  it("joins two steps with e", () => {
    expect(missingStepsSentence(steps(false, true, false))).toBe(
      "Faltam a sede no mapa e os animais."
    );
  });

  it("agrees with a lone singular step", () => {
    expect(missingStepsSentence(steps(false, true, true))).toBe("Falta a sede no mapa.");
  });

  it("agrees with a lone plural step", () => {
    expect(missingStepsSentence(steps(true, true, false))).toBe("Faltam os animais.");
  });

  it("is null when nothing is missing", () => {
    expect(missingStepsSentence(steps(true, true, true))).toBeNull();
  });
});
