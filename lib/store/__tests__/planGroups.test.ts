/**
 * Grupos of the plano in the store: a new grupo is sent with its tipo and
 * joins the list; a deleted grupo, of any tipo, takes its contas and every
 * cached orçamento row of the grupo or of those contas with it, as the server
 * does; a 409 changes nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Budget, PlanGroup } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
const { groupPost, groupDelete } = vi.hoisted(() => ({ groupPost: vi.fn(), groupDelete: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({
  api: { "plan-groups": Object.assign(() => ({ delete: groupDelete }), { post: groupPost }) },
}));
vi.mock("@/lib/repository/ApiHerdRepository", () => ({
  ApiHerdRepository: class {
    load = vi.fn();
  },
}));
vi.mock("@/lib/store/offlineWiring", () => ({
  getOutbox: vi.fn(),
  getEngine: vi.fn(),
  wireOffline: vi.fn(),
  setSyncUser: vi.fn(),
  getSyncUser: vi.fn(),
}));

import { useHerdStore } from "@/lib/store/useHerdStore";

const GROUPS: PlanGroup[] = [
  { id: "g-maq", kind: "expense", name: "Máquinas e veículos", createdAt: "2026-10-01T12:00:00.000Z" },
  { id: "g-arr", kind: "expense", name: "Arrendamento", createdAt: "2026-10-02T12:00:00.000Z" },
  { id: "g-nut", kind: "expense", name: "Nutrição", createdAt: "2026-10-01T12:00:00.000Z" },
  { id: "g-fin", kind: "financing", name: "Financiamentos", createdAt: "2026-10-01T12:00:00.000Z" },
];

const ACCOUNTS: Account[] = [
  { id: "trator", group: "g-maq", name: "Trator" },
  { id: "pasto", group: "g-arr", name: "Pasto do vizinho" },
  { id: "sal", group: "g-nut", name: "Sal mineral" },
  { id: "custeio", group: "g-fin", name: "Custeio", openingBalanceBrl: 80000, openingDate: "2026-01-31" },
];

const row = (id: string, category: string, accountId?: string): Budget => ({
  id,
  category,
  accountId,
  month: "2025-10-01",
  amountBrl: 100,
  distribution: "equal",
});

beforeEach(() => {
  vi.clearAllMocks();
  useHerdStore.setState({
    planGroups: GROUPS,
    accounts: ACCOUNTS,
    budgets: {
      2025: [
        row("maq", "g-maq"),
        row("trator", "g-maq", "trator"),
        // A legacy row of the trator filed under another grupo: the conta's delete cascades it all the same.
        row("trator-legado", "g-nut", "trator"),
        row("arr", "g-arr"),
        row("sal", "g-nut", "sal"),
      ],
    },
  });
});

describe("addPlanGroup", () => {
  it("sends the tipo with the name and adds the grupo", async () => {
    const socios: PlanGroup = { id: "g-soc", kind: "partners", name: "Sócios", createdAt: "2026-10-09T12:00:00.000Z" };
    groupPost.mockResolvedValue({ data: socios, error: null });

    expect(await useHerdStore.getState().addPlanGroup("partners", "Sócios")).toEqual(socios);

    expect(groupPost).toHaveBeenCalledWith({ kind: "partners", name: "Sócios" });
    expect(useHerdStore.getState().planGroups).toEqual([...GROUPS, socios]);
  });

  it("answers null on a 409 and adds nothing", async () => {
    groupPost.mockResolvedValue({ data: null, error: { status: 409, value: { error: "duplicate_name" } } });

    expect(await useHerdStore.getState().addPlanGroup("revenue", "Nutrição")).toBeNull();
    expect(useHerdStore.getState().planGroups).toEqual(GROUPS);
  });
});

describe("removePlanGroup", () => {
  it("drops the grupo, its contas and their orçamento rows, and keeps the rest", async () => {
    groupDelete.mockResolvedValue({ data: { id: "g-maq" }, error: null });

    expect(await useHerdStore.getState().removePlanGroup("g-maq")).toBe("deleted");

    const s = useHerdStore.getState();
    expect(s.planGroups.map((g) => g.id)).toEqual(["g-arr", "g-nut", "g-fin"]);
    expect(s.accounts.map((a) => a.id)).toEqual(["pasto", "sal", "custeio"]);
    expect(s.budgets[2025].map((b) => b.id)).toEqual(["arr", "sal"]);
  });

  it("drops a financiamento grupo with its conta and the saldo inicial on it", async () => {
    groupDelete.mockResolvedValue({ data: { id: "g-fin" }, error: null });

    expect(await useHerdStore.getState().removePlanGroup("g-fin")).toBe("deleted");

    const s = useHerdStore.getState();
    expect(s.planGroups.map((g) => g.id)).toEqual(["g-maq", "g-arr", "g-nut"]);
    expect(s.accounts.map((a) => a.id)).toEqual(["trator", "pasto", "sal"]);
    expect(s.budgets[2025]).toHaveLength(5);
  });

  it("answers in_use on a 409 and changes nothing", async () => {
    groupDelete.mockResolvedValue({ data: null, error: { status: 409, value: { error: "in_use" } } });

    expect(await useHerdStore.getState().removePlanGroup("g-maq")).toBe("in_use");

    const s = useHerdStore.getState();
    expect(s.planGroups).toEqual(GROUPS);
    expect(s.accounts).toEqual(ACCOUNTS);
    expect(s.budgets[2025]).toHaveLength(5);
  });
});
