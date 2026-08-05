import { describe, expect, it } from "vitest";
import { resolveImportLocations } from "@/lib/domain/importLocations";

const invernadas = [
  { id: "inv-1", code: "01" },
  { id: "inv-2", code: "02" },
];

describe("resolveImportLocations", () => {
  it("resolves new and existing lots to registered invernadas", () => {
    const result = resolveImportLocations(
      [
        { lot: "Matrizes", invernada: "01" },
        { lot: "Garrotes", invernada: "02" },
      ],
      [{ name: "Matrizes", currentInvernadaId: "inv-1" }],
      invernadas
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.fromEntries(result.destinationByLotName)).toEqual({
      Matrizes: "inv-1",
      Garrotes: "inv-2",
    });
  });

  it("reports missing codes once and in stable order", () => {
    expect(
      resolveImportLocations(
        [
          { lot: "A", invernada: "99" },
          { lot: "B", invernada: "03" },
          { lot: "C", invernada: "99" },
        ],
        [],
        invernadas
      )
    ).toEqual({
      ok: false,
      error: "invernada_not_found",
      codes: ["03", "99"],
    });
  });

  it("rejects one lot declared in two invernadas", () => {
    expect(
      resolveImportLocations(
        [
          { lot: "Matrizes", invernada: "01" },
          { lot: "Matrizes", invernada: "02" },
        ],
        [],
        invernadas
      )
    ).toEqual({
      ok: false,
      error: "lot_invernada_conflict",
      lots: ["Matrizes"],
    });
  });

  it("rejects an existing lot in another or no current invernada", () => {
    expect(
      resolveImportLocations(
        [
          { lot: "Matrizes", invernada: "02" },
          { lot: "Sem posição", invernada: "01" },
        ],
        [
          { name: "Matrizes", currentInvernadaId: "inv-1" },
          { name: "Sem posição" },
        ],
        invernadas
      )
    ).toEqual({
      ok: false,
      error: "lot_invernada_conflict",
      lots: ["Matrizes", "Sem posição"],
    });
  });

  it("rejects ambiguous duplicate existing lot names", () => {
    expect(
      resolveImportLocations(
        [{ lot: "Matrizes", invernada: "01" }],
        [
          { name: "Matrizes", currentInvernadaId: "inv-1" },
          { name: "Matrizes", currentInvernadaId: "inv-1" },
        ],
        invernadas
      )
    ).toEqual({
      ok: false,
      error: "lot_invernada_conflict",
      lots: ["Matrizes"],
    });
  });
});
