import { describe, expect, it } from "vitest";
import {
  balancedSplit,
  dayMonth,
  earTagList,
  fromDayText,
  invernadaLabel,
  longDateLabel,
  treatmentDueText,
} from "@/components/dashboard/helpers";

const TODAY = "2026-09-22";

describe("longDateLabel", () => {
  it("reads the weekday, the day and the month", () => {
    expect(longDateLabel(TODAY)).toBe("Terça, 22 de setembro");
    expect(longDateLabel("2026-03-01")).toBe("Domingo, 1 de março");
  });
});

describe("dayMonth", () => {
  it("keeps the day and the month", () => {
    expect(dayMonth("2026-09-05")).toBe("05/09");
  });
});

describe("treatmentDueText", () => {
  it("counts the days late, an exame in the masculine", () => {
    expect(treatmentDueText("2026-09-16", "vaccine", TODAY)).toBe("Atrasada há 6 dias");
    expect(treatmentDueText("2026-09-21", "exam", TODAY)).toBe("Atrasado há 1 dia");
  });

  it("says today, or the date and the days ahead", () => {
    expect(treatmentDueText(TODAY, "deworming", TODAY)).toBe("Hoje");
    expect(treatmentDueText("2026-09-23", "vaccine", TODAY)).toBe("23/09 · em 1 dia");
    expect(treatmentDueText("2026-09-25", "vaccine", TODAY)).toBe("25/09 · em 3 dias");
  });
});

describe("earTagList", () => {
  it("joins a few ear tags as a sentence", () => {
    expect(earTagList([])).toBe("");
    expect(earTagList(["4471"])).toBe("4471");
    expect(earTagList(["4471", "3982"])).toBe("4471 e 3982");
    expect(earTagList(["4471", "3982", "5120"])).toBe("4471, 3982 e 5120");
  });

  it("counts the rest past the limit", () => {
    expect(earTagList(["1", "2", "3", "4", "5"])).toBe("1, 2, 3 e mais 2");
  });
});

describe("fromDayText", () => {
  it("says from when a run of calvings starts", () => {
    expect(fromDayText(TODAY, TODAY)).toBe("a partir de hoje");
    expect(fromDayText("2026-09-23", TODAY)).toBe("a partir de amanhã");
    expect(fromDayText("2026-09-26", TODAY)).toBe("a partir de 26/09");
  });
});

describe("invernadaLabel", () => {
  it("abbreviates the invernada with its code and name", () => {
    expect(invernadaLabel({ code: "01", name: "Baixada" })).toBe("Inv. 01 Baixada");
    expect(invernadaLabel({ code: "03" })).toBe("Inv. 03");
  });
});

describe("balancedSplit", () => {
  it("cuts the blocks, in order, where the taller column is shortest", () => {
    expect(balancedSplit([220, 100, 100, 160, 100])).toBe(2);
    expect(balancedSplit([100, 200])).toBe(1);
    expect(balancedSplit([300, 50, 50])).toBe(1);
    expect(balancedSplit([50, 50, 300])).toBe(2);
  });

  it("keeps fewer than two blocks in one column", () => {
    expect(balancedSplit([120])).toBe(1);
    expect(balancedSplit([])).toBe(0);
  });
});
