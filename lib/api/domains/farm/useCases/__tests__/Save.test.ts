/**
 * saveFarm: the registration fields and, when sent, the início da safra; the
 * sede has its own use case. Moving the início needs Financeiro edit, since it
 * regroups the orçamento's months.
 *
 * The db mock is a chainable update stub that captures the column values the
 * service asks for and answers `returning()` with the stored row fixture; a
 * select answers the stored row too.
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
    select: () => {
      const builder = {
        from: () => builder,
        where: () => builder,
        limit: () => Promise.resolve([state.row]),
      };
      return builder;
    },
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
  safraStartMonth: 10,
};

/** Saves as someone who edits the Financeiro, unless told otherwise. */
const save = (data: typeof REGISTRATION & { safraStartMonth?: number }, canEditFinance = true) =>
  new SaveFarmUseCase().run({ farmId: 1, data, canEditFinance });

beforeEach(() => {
  state.columns = undefined;
  state.row = { ...STORED };
});

describe("saveFarm", () => {
  it("writes the registration fields and never the map view", async () => {
    await save(REGISTRATION);

    expect(state.columns).toEqual(REGISTRATION);
  });

  it("returns what the database holds, not what the caller sent", async () => {
    const result = await save(REGISTRATION);

    expect(result).toEqual({
      ...REGISTRATION,
      headquarters: { lat: -19.721, lng: -47.911, zoom: 15 },
      safraStartMonth: 10,
    });
  });

  it("writes the início da safra when sent and leaves it when not", async () => {
    await save({ ...REGISTRATION, safraStartMonth: 7 });
    expect(state.columns).toEqual({ ...REGISTRATION, safraStartMonth: 7 });

    await save(REGISTRATION);
    expect(state.columns).not.toHaveProperty("safraStartMonth");
  });

  it("refuses a new início da safra from whoever does not edit the Financeiro, and writes nothing", async () => {
    expect(await save({ ...REGISTRATION, safraStartMonth: 1 }, false)).toBe("finance_forbidden");
    expect(state.columns).toBeUndefined();
  });

  it("lets the stored início da safra through without Financeiro edit", async () => {
    await save({ ...REGISTRATION, safraStartMonth: 10 }, false);
    expect(state.columns).toEqual({ ...REGISTRATION, safraStartMonth: 10 });

    await save(REGISTRATION, false);
    expect(state.columns).toEqual(REGISTRATION);
  });

  it("omits zoom from a stored view that has none", async () => {
    state.row = { ...STORED, headquartersZoom: null };

    const result = await save(REGISTRATION);

    expect(result).toHaveProperty("headquarters", { lat: -19.721, lng: -47.911 });
  });

  it("reports no headquarters when the columns are null", async () => {
    state.row = {
      ...STORED,
      headquartersLat: null,
      headquartersLng: null,
      headquartersZoom: null,
    };

    const result = await save(REGISTRATION);

    expect(result).toHaveProperty("headquarters", undefined);
  });
});
