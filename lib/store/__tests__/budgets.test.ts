/**
 * Budgets in the store: a saved line swaps its rows in the cached safra, and a
 * new início da safra empties the cache, since the same months now fall in
 * other safras — also when another session moved it (a write answers 409
 * `start_month_changed`). A load without signal fails without a toast.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { Budget, FarmData } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
const { budgetsGet, budgetsPut, farmPut, herdLoad } = vi.hoisted(() => ({
  budgetsGet: vi.fn(),
  budgetsPut: vi.fn(),
  farmPut: vi.fn(),
  herdLoad: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({
  api: { budgets: { get: budgetsGet, put: budgetsPut }, farm: { put: farmPut } },
}));
vi.mock("@/lib/repository/ApiHerdRepository", () => ({
  ApiHerdRepository: class {
    load = herdLoad;
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

const row = (id: string, accountId?: string): Budget => ({
  id,
  category: "nutrition",
  accountId,
  month: "2025-10-01",
  amountBrl: 100,
  distribution: "equal",
});

const FARM: FarmData = { name: "Boa Vista", municipality: "Uberaba", stateRegistration: "", manager: "", safraStartMonth: 10 };

const LINE = { safra: 2025, category: "nutrition" as const, months: Array<number>(12).fill(100), distribution: "equal" as const };

beforeEach(() => {
  vi.clearAllMocks();
  useHerdStore.setState({ farm: FARM, offline: false, budgets: { 2025: [row("grupo"), row("sal", "nut-sal")] } });
});

describe("budgets in the store", () => {
  it("swaps a saved line's rows in its safra and keeps its contas'", async () => {
    budgetsPut.mockResolvedValue({ data: [row("grupo-novo")], error: null });

    await useHerdStore.getState().saveBudgetLine(LINE);

    // The início the safra was read with goes along, for the server to hold against the farm's.
    expect(budgetsPut).toHaveBeenCalledWith({ ...LINE, startMonth: 10 });
    expect(useHerdStore.getState().budgets[2025].map((b) => b.id)).toEqual(["sal", "grupo-novo"]);
  });

  it("reloads the herd and empties the cache when another session moved the início, and rethrows", async () => {
    budgetsPut.mockResolvedValue({ data: null, error: { status: 409, value: { error: "start_month_changed" } } });
    herdLoad.mockResolvedValue({ farm: { ...FARM, safraStartMonth: 1 } });

    await expect(useHerdStore.getState().saveBudgetLine(LINE)).rejects.toThrow();

    expect(toast.error).toHaveBeenCalledWith(
      "O início da safra mudou em outra sessão; os orçamentos foram recarregados."
    );
    expect(useHerdStore.getState().farm.safraStartMonth).toBe(1);
    expect(useHerdStore.getState().budgets).toEqual({});
  });

  it("fails a load without signal quietly, and toasts any other failure", async () => {
    budgetsGet.mockResolvedValue({ data: null, error: { status: 503 } });
    await expect(useHerdStore.getState().loadBudgets(2025)).rejects.toThrow();
    useHerdStore.setState({ offline: true });
    budgetsGet.mockResolvedValue({ data: null, error: { status: 500 } });
    await expect(useHerdStore.getState().loadBudgets(2025)).rejects.toThrow();
    expect(toast.error).not.toHaveBeenCalled();

    useHerdStore.setState({ offline: false });
    await expect(useHerdStore.getState().loadBudgets(2025)).rejects.toThrow();
    expect(toast.error).toHaveBeenCalledWith("Não foi possível carregar o orçamento. Tente novamente.");
  });

  it("empties the cache when the início da safra changes, and only then", async () => {
    farmPut.mockResolvedValue({ data: FARM, error: null });
    await useHerdStore.getState().saveFarm(FARM);
    expect(useHerdStore.getState().budgets[2025]).toHaveLength(2);

    farmPut.mockResolvedValue({ data: { ...FARM, safraStartMonth: 1 }, error: null });
    await useHerdStore.getState().saveFarm({ ...FARM, safraStartMonth: 1 });
    expect(useHerdStore.getState().budgets).toEqual({});
  });
});
