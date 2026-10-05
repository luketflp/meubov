/**
 * Grupos de despesa in the store: a deleted grupo takes its contas and every
 * cached orçamento row of the grupo or of those contas with it, as the server
 * does; a 409 `in_use` changes nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Budget, ExpenseGroup } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
const { groupDelete } = vi.hoisted(() => ({ groupDelete: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({
  api: { "expense-groups": () => ({ delete: groupDelete }) },
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

const GROUPS: ExpenseGroup[] = [
  { id: "g-maq", name: "Máquinas e veículos", createdAt: "2026-10-01T12:00:00.000Z" },
  { id: "g-arr", name: "Arrendamento", createdAt: "2026-10-02T12:00:00.000Z" },
];

const ACCOUNTS: Account[] = [
  { id: "trator", group: "g-maq", name: "Trator" },
  { id: "pasto", group: "g-arr", name: "Pasto do vizinho" },
  { id: "sal", group: "nutrition", name: "Sal mineral" },
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
    expenseGroups: GROUPS,
    accounts: ACCOUNTS,
    budgets: {
      2025: [
        row("maq", "g-maq"),
        row("trator", "g-maq", "trator"),
        // A legacy row of the trator filed under another grupo: the conta's delete cascades it all the same.
        row("trator-legado", "admin", "trator"),
        row("arr", "g-arr"),
        row("sal", "nutrition", "sal"),
      ],
    },
  });
});

describe("removeExpenseGroup", () => {
  it("drops the grupo, its contas and their orçamento rows, and keeps the rest", async () => {
    groupDelete.mockResolvedValue({ data: { id: "g-maq" }, error: null });

    expect(await useHerdStore.getState().removeExpenseGroup("g-maq")).toBe("deleted");

    const s = useHerdStore.getState();
    expect(s.expenseGroups.map((g) => g.id)).toEqual(["g-arr"]);
    expect(s.accounts.map((a) => a.id)).toEqual(["pasto", "sal"]);
    expect(s.budgets[2025].map((b) => b.id)).toEqual(["arr", "sal"]);
  });

  it("answers in_use on a 409 and changes nothing", async () => {
    groupDelete.mockResolvedValue({ data: null, error: { status: 409, value: { error: "in_use" } } });

    expect(await useHerdStore.getState().removeExpenseGroup("g-maq")).toBe("in_use");

    const s = useHerdStore.getState();
    expect(s.expenseGroups).toEqual(GROUPS);
    expect(s.accounts).toEqual(ACCOUNTS);
    expect(s.budgets[2025]).toHaveLength(5);
  });
});
