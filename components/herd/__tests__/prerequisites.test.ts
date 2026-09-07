import { describe, expect, it } from "vitest";
import type { Lot } from "@/lib/types";
import {
  animalPrerequisites,
  blocksRegistration,
} from "@/components/herd/prerequisites";

const lots: Lot[] = [
  { id: "lot-1", name: "Matrizes" },
  { id: "lot-2", name: "Recria" },
];

describe("animalPrerequisites", () => {
  it("asks for nothing when the farm has a breed and a placed lot", () => {
    const hints = animalPrerequisites(["Nelore"], lots, [lots[0]]);

    expect(hints).toEqual({ breed: null, lot: null });
    expect(blocksRegistration(hints)).toBe(false);
  });

  it("points to the settings screen when no breed is registered", () => {
    const hints = animalPrerequisites([], lots, [lots[0]]);

    expect(hints.breed).toContain("Configurações");
    expect(hints.lot).toBeNull();
    expect(blocksRegistration(hints)).toBe(true);
  });

  it("asks for a lot to be created when the farm has none", () => {
    const hints = animalPrerequisites(["Nelore"], [], []);

    expect(hints.breed).toBeNull();
    expect(hints.lot).toBe(
      "Cadastre um lote em Lotes antes de cadastrar o animal."
    );
  });

  it("distinguishes a farm whose lots exist but sit in no invernada", () => {
    const hints = animalPrerequisites(["Nelore"], lots, []);

    expect(hints.lot).toBe(
      "Nenhum lote está em uma invernada. Coloque um em Lotes antes de cadastrar o animal."
    );
  });

  it("reports both when the farm is brand new", () => {
    const hints = animalPrerequisites([], [], []);

    expect(hints.breed).not.toBeNull();
    expect(hints.lot).not.toBeNull();
    expect(blocksRegistration(hints)).toBe(true);
  });
});
