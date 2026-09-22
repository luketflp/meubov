import { describe, expect, it } from "vitest";
import { makeAnimal } from "@/lib/domain/__tests__/fixtures";
import { BAIXA_FILTER_ALL, parseBaixaFilter, recentBaixas } from "@/components/baixas/baixas";

const gone = (id: string, reason: "sale" | "death" | "loss" | "other", date: string) =>
  makeAnimal({ id, earTag: id, active: false, inactiveReason: reason, inactiveDate: date });

describe("recentBaixas", () => {
  const animals = [
    makeAnimal({ id: "alive" }),
    gone("sold", "sale", "2026-09-01"),
    gone("dead", "death", "2026-06-01"),
    gone("lost", "loss", "2026-08-01"),
    gone("other", "other", "2026-07-01"),
  ];

  it("lists every exit except sales, newest first", () => {
    expect(recentBaixas(animals, BAIXA_FILTER_ALL).map((a) => a.id)).toEqual([
      "lost",
      "other",
      "dead",
    ]);
  });

  it("filters mortes (death and loss) and outras", () => {
    expect(recentBaixas(animals, "mortes").map((a) => a.id)).toEqual(["lost", "dead"]);
    expect(recentBaixas(animals, "outras").map((a) => a.id)).toEqual(["other"]);
  });

  it("puts an exit without a date last, then by ear tag", () => {
    const undated = makeAnimal({ id: "b", earTag: "B", active: false, inactiveReason: "death" });
    const undated2 = makeAnimal({ id: "a", earTag: "A", active: false, inactiveReason: "death" });
    expect(
      recentBaixas([undated, gone("dead", "death", "2026-06-01"), undated2], "mortes").map(
        (a) => a.id
      )
    ).toEqual(["dead", "a", "b"]);
  });
});

describe("parseBaixaFilter", () => {
  it("reads the known values and falls back to all", () => {
    expect(parseBaixaFilter("mortes")).toBe("mortes");
    expect(parseBaixaFilter("outras")).toBe("outras");
    expect(parseBaixaFilter("x")).toBe(BAIXA_FILTER_ALL);
    expect(parseBaixaFilter(null)).toBe(BAIXA_FILTER_ALL);
  });
});
