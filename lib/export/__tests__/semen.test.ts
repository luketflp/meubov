import { describe, expect, it } from "vitest";
import {
  bullInseminationsExportTable,
  semenBullsByName,
  semenBullsExportTable,
  semenPurchasesExportTable,
} from "@/lib/export/datasets/semen";
import { bullInseminations } from "@/lib/domain/semen";
import { makeAnimal, makeSemenBull } from "@/lib/domain/__tests__/fixtures";

const tufao = makeSemenBull({
  id: "sb-1",
  name: "Tufão da Serra",
  central: "Alta",
  purchases: [
    { id: "p1", date: "2026-01-02", doses: 10, totalBrl: 500, seller: "Alta Genetics" },
    { id: "p2", date: "2026-05-02", doses: 10, totalBrl: 700 },
  ],
});
const astro = makeSemenBull({ id: "sb-2", name: "Astro", code: undefined, breed: undefined, purchases: [] });
const cow = (id: string, earTag: string, result: "pregnant" | "open" | null) =>
  makeAnimal({
    id,
    earTag,
    sex: "female",
    category: "cow",
    lotId: "l1",
    reproduction: {
      breedings: [{ id: `b-${id}`, date: "2026-02-01", type: "timedAI", bullEarTag: "NEL-4471", semenBullId: "sb-1" }],
      diagnoses: result ? [{ breedingId: `b-${id}`, result, date: "2026-03-10" }] : [],
      calvings: [],
    },
  });
const animals = [cow("c1", "0001", "pregnant"), cow("c2", "0002", "open"), cow("c3", "0003", null)];

describe("semenBullsExportTable", () => {
  it("writes stock, cost and pregnancy rate per bull, in the Touros tab's order", () => {
    const table = semenBullsExportTable(semenBullsByName([tufao, astro]), animals);
    expect(table.rows).toEqual([
      ["Astro", null, null, null, 0, 0, 0, null, null, 0, 0, null],
      ["Tufão da Serra", "NEL-4471", "Nelore", "Alta", 20, 3, 17, 60, "2026-05-02", 2, 1, 50],
    ]);
    expect(table.columns[7].kind).toBe("money");
  });
});

describe("semenPurchasesExportTable", () => {
  it("lists every purchase newest first with total, per dose and seller", () => {
    const table = semenPurchasesExportTable([astro, tufao]);
    expect(table.title).toBe("Compras");
    expect(table.rows).toEqual([
      ["2026-05-02", "Tufão da Serra", 10, 700, 70, null],
      ["2026-01-02", "Tufão da Serra", 10, 500, 50, "Alta Genetics"],
    ]);
  });

  it("leaves the values empty when the server stripped them", () => {
    const hidden = makeSemenBull({ purchases: [{ id: "p", date: "2026-01-01", doses: 5 }] });
    expect(semenPurchasesExportTable([hidden]).rows).toEqual([["2026-01-01", "Tufão da Serra", 5, null, null, null]]);
  });
});

describe("bullInseminationsExportTable", () => {
  it("lists the bull's coberturas with the dam's lote and diagnosis", () => {
    const table = bullInseminationsExportTable(bullInseminations("sb-1", animals), new Map([["l1", "Matrizes"]]));
    expect(table.rows).toEqual([
      ["2026-02-01", "0001", "Matrizes", "Prenhe"],
      ["2026-02-01", "0002", "Matrizes", "Vazia"],
      ["2026-02-01", "0003", "Matrizes", "Pendente"],
    ]);
  });
});
