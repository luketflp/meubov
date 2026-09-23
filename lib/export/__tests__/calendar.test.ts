import { describe, expect, it } from "vitest";
import { calendarTreatments, treatmentsExportTable } from "@/lib/export/datasets/calendar";
import { makeAnimal, makeTreatment } from "@/lib/domain/__tests__/fixtures";

const animals = [makeAnimal({ earTag: "BR-001", lotId: "lot-1" })];
const lots = [{ id: "lot-1", name: "Engorda" }];

describe("treatmentsExportTable", () => {
  it("orders by date and brinco, with lote, status as of today and cost", () => {
    const table = treatmentsExportTable(
      [
        makeTreatment({ id: "t2", date: "2026-09-30", animalEarTag: "BR-001", dose: "5 ml", costBrl: 3.5 }),
        makeTreatment({
          id: "t1",
          date: "2026-09-01",
          animalEarTag: "X-9",
          type: "deworming",
          name: "Ivermectina",
          withdrawalDays: 35,
          responsible: "Zé",
        }),
      ],
      animals,
      lots,
      "2026-09-22"
    );
    expect(table.title).toBe("Tratamentos");
    expect(table.columns.find((c) => c.header === "Custo (R$)")?.kind).toBe("money");
    expect(table.rows).toEqual([
      ["2026-09-01", "X-9", null, "Vermifugação", "Ivermectina", null, "Atrasado", 35, "Zé", null, null],
      ["2026-09-30", "BR-001", "Engorda", "Vacina", "Vacina aftosa", "5 ml", "Agendado", 0, null, 3.5, null],
    ]);
  });
});

describe("calendarTreatments", () => {
  it("joins the overdue ones to the month without repeating one in both", () => {
    const a = makeTreatment({ id: "a", date: "2026-08-01" });
    const b = makeTreatment({ id: "b", date: "2026-09-02" });
    const c = makeTreatment({ id: "c", date: "2026-09-20" });
    expect(calendarTreatments([b, c], [a, b]).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});
