import { describe, expect, it } from "vitest";
import {
  boundaryProgress,
  isSetupComplete,
  nextStep,
  pendingSteps,
  stepHref,
  undrawnInvernadas,
} from "@/lib/domain/mapSetup";
import type { FarmData, Invernada } from "@/lib/types";

const SEDE: FarmData["headquarters"] = { lat: -19.75, lng: -47.93, zoom: 14 };

const RING: [number, number][] = [
  [-47.91, -19.72],
  [-47.9, -19.72],
  [-47.9, -19.71],
];

function invernada(code: string, boundary?: [number, number][]): Invernada {
  return {
    id: `inv-${code}`,
    code,
    grass: "Braquiária",
    hectares: 30,
    ...(boundary ? { boundary } : {}),
  };
}

describe("pendingSteps", () => {
  it("asks for the sede first on a brand-new farm", () => {
    const steps = pendingSteps({}, []);
    expect(steps).toEqual([{ kind: "headquarters" }, { kind: "first-invernada" }]);
  });

  it("offers tracing the first invernada once the sede is saved", () => {
    expect(pendingSteps({ headquarters: SEDE }, [])).toEqual([
      { kind: "first-invernada" },
    ]);
  });

  it("walks only the invernadas that have no outline", () => {
    const invernadas = [invernada("1", RING), invernada("2"), invernada("3")];
    expect(pendingSteps({ headquarters: SEDE }, invernadas)).toEqual([
      { kind: "invernada", invernadaId: "inv-2" },
      { kind: "invernada", invernadaId: "inv-3" },
    ]);
  });

  it("orders the walk by code as a person counts, not as a string sorts", () => {
    const invernadas = [invernada("10"), invernada("2"), invernada("1A")];
    expect(pendingSteps({ headquarters: SEDE }, invernadas)).toEqual([
      { kind: "invernada", invernadaId: "inv-1A" },
      { kind: "invernada", invernadaId: "inv-2" },
      { kind: "invernada", invernadaId: "inv-10" },
    ]);
  });

  it("drops the ones skipped in this session", () => {
    const invernadas = [invernada("1"), invernada("2")];
    expect(pendingSteps({ headquarters: SEDE }, invernadas, ["inv-1"])).toEqual([
      { kind: "invernada", invernadaId: "inv-2" },
    ]);
  });

  it("never offers to trace a first invernada when some are registered", () => {
    const steps = pendingSteps({ headquarters: SEDE }, [invernada("1")], ["inv-1"]);
    expect(steps).toEqual([]);
  });

  it("is empty once the sede is saved and every outline is drawn", () => {
    const invernadas = [invernada("1", RING), invernada("2", RING)];
    expect(pendingSteps({ headquarters: SEDE }, invernadas)).toEqual([]);
    expect(isSetupComplete({ headquarters: SEDE }, invernadas)).toBe(true);
  });

  it("is not complete while the sede is missing, even with every outline drawn", () => {
    expect(isSetupComplete({}, [invernada("1", RING)])).toBe(false);
  });
});

describe("nextStep", () => {
  it("is the first pending step", () => {
    expect(nextStep({}, [])).toEqual({ kind: "headquarters" });
  });

  it("is null when nothing is pending", () => {
    expect(nextStep({ headquarters: SEDE }, [invernada("1", RING)])).toBeNull();
  });
});

describe("stepHref", () => {
  it("maps every step to its route", () => {
    expect(stepHref({ kind: "headquarters" })).toBe("/map/setup/sede");
    expect(stepHref({ kind: "first-invernada" })).toBe("/map/setup/invernada/nova");
    expect(stepHref({ kind: "invernada", invernadaId: "inv-2" })).toBe(
      "/map/setup/invernada/inv-2"
    );
  });

  it("escapes an id that would otherwise break the path", () => {
    expect(stepHref({ kind: "invernada", invernadaId: "a/b" })).toBe(
      "/map/setup/invernada/a%2Fb"
    );
  });
});

describe("boundaryProgress", () => {
  it("counts outlines against registered invernadas", () => {
    const invernadas = [invernada("1", RING), invernada("2"), invernada("3")];
    expect(boundaryProgress(invernadas)).toEqual({ drawn: 1, total: 3 });
  });

  it("is zero of zero for a farm with no invernadas", () => {
    expect(boundaryProgress([])).toEqual({ drawn: 0, total: 0 });
  });
});

describe("undrawnInvernadas", () => {
  it("keeps the invernada objects, not just their ids", () => {
    const pending = invernada("2");
    expect(undrawnInvernadas([invernada("1", RING), pending])).toEqual([pending]);
  });
});
