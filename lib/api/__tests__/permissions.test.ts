/**
 * Real routes of herdApi behind the farm macro, with auth and the db mocked:
 * proves the macro's route pattern matches the table's keys at runtime, the
 * money rules on POST /manejo, the semen writes that ask Reprodução only, and
 * the redaction of GET /api/herd and of what a semen write returns.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_PERMISSIONS, PRESETS } from "@/lib/domain/permissions";

const { state, getSession, deleteBull, HERD } = vi.hoisted(() => ({
  state: { membership: [] as Record<string, unknown>[] },
  getSession: vi.fn(),
  /** DeleteBullUseCase.run: answers the id it was asked to delete. */
  deleteBull: vi.fn((props: { farmId: number; id: string }) => Promise.resolve({ id: props.id })),
  HERD: {
    animals: [],
    treatments: [
      { id: "t-1", animalEarTag: "BR-1", type: "vaccine", name: "Aftosa", date: "2026-09-01", status: "done", withdrawalDays: 0, costBrl: 4.5 },
    ],
    lots: [],
    accounts: [
      { id: "acc-1", group: "grp-financiamentos", name: "Pronaf", openingBalanceBrl: 120000, openingDate: "2026-06-30" },
    ],
    invernadas: [],
    lotPlacements: [],
    movements: [],
    breeds: [],
    manejoSessions: [],
    expenses: [{ id: "e-1", kind: "expense", date: "2026-09-01", category: "grp-mao-de-obra", amountBrl: 1200 }],
    planGroups: [],
    semenBulls: [
      {
        id: "bull-1",
        name: "Tufão da Serra",
        purchases: [{ id: "p-1", date: "2026-03-01", doses: 40, totalBrl: 1520 }],
      },
    ],
    farm: { name: "Fazenda", municipality: "Uberaba", stateRegistration: "", manager: "" },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const builder = {
        from: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => Promise.resolve(state.membership),
      };
      return builder;
    },
  },
}));
vi.mock("@/lib/api/domains/herd/useCases/Load.useCase", () => ({
  LoadHerdUseCase: class {
    run = () => Promise.resolve(structuredClone(HERD));
  },
}));
vi.mock("@/lib/api/domains/manejo/useCases/Start.useCase", () => ({
  StartSessionUseCase: class {
    run = () =>
      Promise.resolve({
        id: "m-1",
        name: "Sessão de Saúde",
        date: "2026-09-12",
        status: "open",
        kind: "health",
        weighing: false,
        treatment: { type: "vaccine", name: "Aftosa", withdrawalDays: 0, costBrl: 12 },
        animals: [],
        pricePerArroba: 300,
      });
  },
}));
vi.mock("@/lib/api/domains/semen/useCases/UpdateBull.useCase", () => ({
  UpdateBullUseCase: class {
    run = () =>
      Promise.resolve({
        id: "bull-1",
        name: "Tufão",
        purchases: [{ id: "p-1", date: "2026-03-01", doses: 40, totalBrl: 1520 }],
      });
  },
}));
vi.mock("@/lib/api/domains/semen/useCases/AddBull.useCase", () => ({
  AddBullUseCase: class {
    run = () =>
      Promise.resolve({
        bull: {
          id: "bull-2",
          name: "Bravo",
          purchases: [{ id: "p-2", date: "2026-09-12", doses: 10, totalBrl: 380 }],
        },
      });
  },
}));
vi.mock("@/lib/api/domains/semen/useCases/AddPurchase.useCase", () => ({
  AddPurchaseUseCase: class {
    run = () =>
      Promise.resolve({ purchase: { id: "p-2", date: "2026-09-12", doses: 10, totalBrl: 380 } });
  },
}));
vi.mock("@/lib/api/domains/semen/useCases/DeleteBull.useCase", () => ({
  DeleteBullUseCase: class {
    run = deleteBull;
  },
}));
vi.mock("@/lib/api/domains/semen/useCases/DeletePurchase.useCase", () => ({
  DeletePurchaseUseCase: class {
    run = () => Promise.resolve({ id: "p-1" });
  },
}));
vi.mock("@/lib/api/domains/manejo/useCases/CompleteAnimal.useCase", () => ({
  CompleteAnimalUseCase: class {
    run = () =>
      Promise.resolve({
        entry: { earTag: "BR-1", outcome: "done", amountBrl: 500 },
        treatments: [
          { id: "t-2", animalEarTag: "BR-1", type: "vaccine", name: "Aftosa", date: "2026-09-01", status: "done", withdrawalDays: 0, costBrl: 9 },
        ],
      });
  },
}));

import { herdApi } from "@/lib/api/app";

const headers = { "x-farm-id": "7", "content-type": "application/json" };
const request = (method: string, path: string, body?: unknown) =>
  herdApi.handle(
    new Request(`http://localhost/api/herd${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

function asMember(permissions: typeof FULL_PERMISSIONS) {
  state.membership = [{ role: "member", preset: null, permissions }];
}

/** 10 doses for R$ 380. */
const PURCHASE_BODY = { date: "2026-09-12", doses: 10, totalBrl: 380 };

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", email: "user@meubov.test" } });
});

describe("permissions on the mounted API", () => {
  it("lets a consultor read", async () => {
    asMember(PRESETS.consultor);
    const response = await request("GET", "/health");
    expect(response.status).toBe(200);
  });

  it("refuses a consultor a manejo write, naming the area", async () => {
    asMember(PRESETS.consultor);
    const response = await request("POST", "/manejo/abc/close");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "manejo" });
  });

  it("refuses a vaqueiro a venda, naming Financeiro", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("POST", "/manejo", {
      date: "2026-09-12",
      kind: "sale",
      earTags: ["BR-1"],
      weighing: true,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "finance" });
  });

  it("strips money from the herd for a member without Financeiro", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("GET", "");
    const data = await response.json();
    expect(data.expenses).toEqual([]);
    expect(data.treatments[0]).not.toHaveProperty("costBrl");
    expect(data.accounts).toEqual([{ id: "acc-1", group: "grp-financiamentos", name: "Pronaf" }]);
  });

  it("keeps money for a member who sees Financeiro", async () => {
    asMember(PRESETS.consultor);
    const response = await request("GET", "");
    const data = await response.json();
    expect(data.expenses).toHaveLength(1);
    expect(data.treatments[0].costBrl).toBe(4.5);
  });

  it("strips the semen purchase totals from the herd for a vaqueiro (finance none)", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("GET", "");
    const data = await response.json();
    expect(data.semenBulls[0].purchases[0]).not.toHaveProperty("totalBrl");
    expect(data.semenBulls[0].purchases[0].doses).toBe(40);
  });

  it("lets a vaqueiro (Reprodução edit, finance none) buy doses, without the total in the answer", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("POST", "/semen-bulls/bull-1/purchases", PURCHASE_BODY);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      purchase: { id: "p-2", date: "2026-09-12", doses: 10 },
    });
  });

  it("answers the purchase with its total to a member who sees Financeiro", async () => {
    asMember(FULL_PERMISSIONS);
    const response = await request("POST", "/semen-bulls/bull-1/purchases", PURCHASE_BODY);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      purchase: { id: "p-2", date: "2026-09-12", doses: 10, totalBrl: 380 },
    });
  });

  it("refuses a consultor a semen purchase, naming Reprodução", async () => {
    asMember(PRESETS.consultor);
    const response = await request("POST", "/semen-bulls/bull-1/purchases", PURCHASE_BODY);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden", area: "reproduction" });
  });

  it("lets a vaqueiro register a bull with its first purchase, without the totals", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("POST", "/semen-bulls", {
      name: "Bravo",
      firstPurchase: PURCHASE_BODY,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      bull: {
        id: "bull-2",
        name: "Bravo",
        purchases: [{ id: "p-2", date: "2026-09-12", doses: 10 }],
      },
    });
  });

  it("lets a vaqueiro delete a bull with purchases, asking nothing of Financeiro", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("DELETE", "/semen-bulls/bull-1");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "bull-1" });
    expect(deleteBull).toHaveBeenCalledWith({ farmId: 7, id: "bull-1" });
  });

  it("lets a vaqueiro delete a purchase", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("DELETE", "/semen-bulls/bull-1/purchases/p-1");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "p-1" });
  });

  it("strips the purchase totals from an edited bull for a vaqueiro (finance none)", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("PATCH", "/semen-bulls/bull-1", { name: "Tufão" });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.purchases[0]).toEqual({ id: "p-1", date: "2026-03-01", doses: 40 });
  });

  it("strips money from a started session for a vaqueiro (finance none)", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("POST", "/manejo", {
      date: "2026-09-12",
      kind: "health",
      earTags: ["BR-1"],
      weighing: false,
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.treatment).not.toHaveProperty("costBrl");
    expect(data).not.toHaveProperty("pricePerArroba");
  });

  it("strips money from a completed chute pass for a vaqueiro (finance none)", async () => {
    asMember(PRESETS.vaqueiro);
    const response = await request("POST", "/manejo/m-1/animals/a-1/complete", {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.entry).not.toHaveProperty("amountBrl");
    expect(data.treatments[0]).not.toHaveProperty("costBrl");
  });
});
