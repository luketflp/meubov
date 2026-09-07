/**
 * saveFarm: the sede is three-valued, so Settings can save the registration
 * fields without erasing the map view the farmer set from the map.
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

import { saveFarm } from "@/lib/api/services/settings";

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
  it("leaves the saved map view alone when the body carries no headquarters", async () => {
    await saveFarm(1, REGISTRATION);

    expect(state.columns).toEqual(REGISTRATION);
    expect(state.columns).not.toHaveProperty("headquartersLat");
    expect(state.columns).not.toHaveProperty("headquartersLng");
    expect(state.columns).not.toHaveProperty("headquartersZoom");
  });

  it("writes latitude, longitude and zoom when a view is given", async () => {
    await saveFarm(1, {
      ...REGISTRATION,
      headquarters: { lat: -19.5, lng: -47.5, zoom: 16 },
    });

    expect(state.columns).toMatchObject({
      headquartersLat: -19.5,
      headquartersLng: -47.5,
      headquartersZoom: 16,
    });
  });

  it("stores a view without zoom as a null zoom, not as a missing column", async () => {
    await saveFarm(1, {
      ...REGISTRATION,
      headquarters: { lat: -19.5, lng: -47.5 },
    });

    expect(state.columns).toMatchObject({
      headquartersLat: -19.5,
      headquartersLng: -47.5,
      headquartersZoom: null,
    });
  });

  it("clears the view on an explicit null", async () => {
    await saveFarm(1, { ...REGISTRATION, headquarters: null });

    expect(state.columns).toMatchObject({
      headquartersLat: null,
      headquartersLng: null,
      headquartersZoom: null,
    });
  });

  it("returns what the database holds, not what the caller sent", async () => {
    const result = await saveFarm(1, REGISTRATION);

    expect(result).toEqual({
      ...REGISTRATION,
      headquarters: { lat: -19.721, lng: -47.911, zoom: 15 },
    });
  });

  it("omits zoom from a stored view that has none", async () => {
    state.row = { ...STORED, headquartersZoom: null };

    const result = await saveFarm(1, REGISTRATION);

    expect(result.headquarters).toEqual({ lat: -19.721, lng: -47.911 });
  });

  it("reports no headquarters when the columns are null", async () => {
    state.row = {
      ...STORED,
      headquartersLat: null,
      headquartersLng: null,
      headquartersZoom: null,
    };

    const result = await saveFarm(1, REGISTRATION);

    expect(result.headquarters).toBeUndefined();
  });
});
