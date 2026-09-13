/**
 * saveFarm: the registration fields only; the sede has its own use case.
 *
 * The db mock is a chainable update stub that captures the column values the
 * service asks for and answers `returning()` with the stored row fixture.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** Columns of the last `.set()` call. */
    columns: undefined as Record<string, unknown> | undefined,
    row: {} as Record<string, unknown>,
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: () => {
      const builder = {
        set(columns: Record<string, unknown>) {
          state.columns = columns;
          return builder;
        },
        where() {
          return builder;
        },
        returning() {
          return Promise.resolve([state.row]);
        },
      };
      return builder;
    },
  },
}));

import { SaveFarmUseCase } from "../Save.useCase";

const REGISTRATION = {
  name: "Fazenda Boa Vista",
  municipality: "Uberaba",
  stateRegistration: "001",
  manager: "Lucas",
};

const STORED = {
  ...REGISTRATION,
  headquartersLat: -19.721,
  headquartersLng: -47.911,
  headquartersZoom: 15,
};

beforeEach(() => {
  state.columns = undefined;
  state.row = { ...STORED };
});

describe("saveFarm", () => {
  it("writes the registration fields and never the map view", async () => {
    await new SaveFarmUseCase().run({ farmId: 1, data: REGISTRATION });

    expect(state.columns).toEqual(REGISTRATION);
  });

  it("returns what the database holds, not what the caller sent", async () => {
    const result = await new SaveFarmUseCase().run({ farmId: 1, data: REGISTRATION });

    expect(result).toEqual({
      ...REGISTRATION,
      headquarters: { lat: -19.721, lng: -47.911, zoom: 15 },
    });
  });

  it("omits zoom from a stored view that has none", async () => {
    state.row = { ...STORED, headquartersZoom: null };

    const result = await new SaveFarmUseCase().run({ farmId: 1, data: REGISTRATION });

    expect(result.headquarters).toEqual({ lat: -19.721, lng: -47.911 });
  });

  it("reports no headquarters when the columns are null", async () => {
    state.row = {
      ...STORED,
      headquartersLat: null,
      headquartersLng: null,
      headquartersZoom: null,
    };

    const result = await new SaveFarmUseCase().run({ farmId: 1, data: REGISTRATION });

    expect(result.headquarters).toBeUndefined();
  });
});
