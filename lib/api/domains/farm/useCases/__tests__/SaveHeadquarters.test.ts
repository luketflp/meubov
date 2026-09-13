/**
 * saveHeadquarters: where and how close the map opens, written from the map
 * alone now that the registration fields have their own route.
 *
 * The db mock is a chainable update stub that captures the columns set and
 * answers `returning()` with the stored row fixture.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
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

import { SaveHeadquartersUseCase } from "../SaveHeadquarters.useCase";

const STORED = {
  name: "Fazenda Boa Vista",
  municipality: "Uberaba",
  stateRegistration: "001",
  manager: "Lucas",
  headquartersLat: -19.5,
  headquartersLng: -47.5,
  headquartersZoom: 16,
};

beforeEach(() => {
  state.columns = undefined;
  state.row = { ...STORED };
});

describe("saveHeadquarters", () => {
  it("writes latitude, longitude and zoom and nothing else", async () => {
    await new SaveHeadquartersUseCase().run({
      farmId: 1,
      headquarters: { lat: -19.5, lng: -47.5, zoom: 16 },
    });

    expect(state.columns).toEqual({
      headquartersLat: -19.5,
      headquartersLng: -47.5,
      headquartersZoom: 16,
    });
  });

  it("stores a view without zoom as a null zoom", async () => {
    await new SaveHeadquartersUseCase().run({ farmId: 1, headquarters: { lat: -19.5, lng: -47.5 } });

    expect(state.columns).toMatchObject({ headquartersZoom: null });
  });

  it("clears the view on null", async () => {
    await new SaveHeadquartersUseCase().run({ farmId: 1, headquarters: null });

    expect(state.columns).toEqual({
      headquartersLat: null,
      headquartersLng: null,
      headquartersZoom: null,
    });
  });

  it("returns the farm as the database holds it", async () => {
    const result = await new SaveHeadquartersUseCase().run({
      farmId: 1,
      headquarters: { lat: -19.5, lng: -47.5, zoom: 16 },
    });

    expect(result.headquarters).toEqual({ lat: -19.5, lng: -47.5, zoom: 16 });
  });
});
