import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankAccount, Expense, StatementLine } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
const { match, undo, bankPost, expensePatch, transferPost, transferDelete, load } = vi.hoisted(() => ({
  match: vi.fn(),
  undo: vi.fn(),
  bankPost: vi.fn(),
  expensePatch: vi.fn(),
  transferPost: vi.fn(),
  transferDelete: vi.fn(),
  load: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { getSession: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({
  api: {
    "statement-lines": () => ({ match: { post: match }, undo: { post: undo } }),
    "bank-accounts": Object.assign(() => ({}), { post: bankPost }),
    expenses: () => ({ patch: expensePatch }),
    transfers: Object.assign(() => ({ delete: transferDelete }), { post: transferPost }),
  },
}));
vi.mock("@/lib/repository/ApiHerdRepository", () => ({
  ApiHerdRepository: class {
    load = load;
  },
}));
vi.mock("@/lib/store/offlineWiring", () => ({
  getOutbox: vi.fn(),
  getEngine: vi.fn(),
  wireOffline: vi.fn(),
  setSyncUser: vi.fn(),
  getSyncUser: vi.fn(),
}));

import { toast } from "sonner";
import { useHerdStore } from "@/lib/store/useHerdStore";

const SICREDI: BankAccount = {
  id: "sicredi",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 0,
  openingDate: "2026-08-31",
  isMain: true,
  pendingLines: 3,
};

const BILL: Expense = { id: "e-1", kind: "expense", date: "2026-09-10", category: "labor", amountBrl: 18400 };

const LINE: StatementLine = {
  id: "l-1",
  importId: "imp-1",
  bankAccountId: "sicredi",
  date: "2026-09-10",
  description: "PAGTO FOLHA",
  amountBrl: -18400,
  status: "pending",
};

beforeEach(() => {
  vi.clearAllMocks();
  // The re-read fails: the store keeps what it has, and the test sees it was asked.
  load.mockRejectedValue(new Error("offline"));
  useHerdStore.setState({ bankAccounts: [SICREDI], expenses: [BILL], reconciledIds: [], transfers: [] });
});

describe("resolveStatementLine", () => {
  it("merges the lançamento it paid, marks it conciliado and counts one line less", async () => {
    const paid = { ...BILL, paidAt: "2026-09-10", bankAccountId: "sicredi" };
    match.mockResolvedValue({ data: { line: { ...LINE, status: "matched", expenseId: "e-1" }, expense: paid } });
    await useHerdStore.getState().resolveStatementLine(LINE, { type: "match", target: { kind: "expense", id: "e-1" } });
    const s = useHerdStore.getState();
    expect(s.expenses).toEqual([paid]);
    expect(s.reconciledIds).toEqual(["e-1"]);
    expect(s.bankAccounts[0].pendingLines).toBe(2);
  });

  it("undoes: the record leaves conciliado, the lançamento stays paid, the line waits again", async () => {
    useHerdStore.setState({ reconciledIds: ["e-1"] });
    undo.mockResolvedValue({ data: { line: LINE } });
    await useHerdStore.getState().resolveStatementLine({ ...LINE, status: "matched", expenseId: "e-1" }, { type: "undo" });
    const s = useHerdStore.getState();
    expect(s.reconciledIds).toEqual([]);
    expect(s.expenses).toEqual([BILL]);
    expect(s.bankAccounts[0].pendingLines).toBe(4);
  });

  it("explains a lançamento paid by another conta and changes nothing", async () => {
    match.mockResolvedValue({ error: { status: 409, value: { error: "paid_by_other" } } });
    const result = await useHerdStore
      .getState()
      .resolveStatementLine(LINE, { type: "match", target: { kind: "expense", id: "e-1" } });
    expect(result).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("Esse lançamento foi pago por outra conta.");
    expect(useHerdStore.getState().bankAccounts[0].pendingLines).toBe(3);
  });
});

describe("contas", () => {
  it("unmarks the old conta principal when a new one is created as principal", async () => {
    bankPost.mockResolvedValue({ data: { ...SICREDI, id: "bb", name: "BB", pendingLines: 0 } });
    await useHerdStore.getState().addBankAccount({ kind: "checking", name: "BB", openingDate: "2026-08-31", isMain: true });
    expect(useHerdStore.getState().bankAccounts.map((a) => [a.id, a.isMain])).toEqual([
      ["sicredi", false],
      ["bb", true],
    ]);
  });

  it("sends the conta with the payment and clears it with the unpayment", async () => {
    expensePatch.mockResolvedValue({ data: BILL });
    await useHerdStore.getState().markExpensePaid("e-1", "2026-09-29", "sicredi");
    await useHerdStore.getState().markExpensePaid("e-1", null, "sicredi");
    expect(expensePatch.mock.calls.map(([body]) => body)).toEqual([
      { paidAt: "2026-09-29", bankAccountId: "sicredi", scope: "one" },
      { paidAt: null, bankAccountId: null, scope: "one" },
    ]);
  });
});

describe("a record a linha do extrato confirms", () => {
  it("re-reads the herd after removing a conciliada transferência, not an unpaired one", async () => {
    transferDelete.mockResolvedValue({});
    useHerdStore.setState({ reconciledIds: ["t-1:sicredi"] });
    await useHerdStore.getState().removeTransfer("t-1");
    expect(load).toHaveBeenCalledTimes(1);
    await useHerdStore.getState().removeTransfer("t-2");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("re-reads the herd when an edit may unpair it: the valor, not the observação", async () => {
    useHerdStore.setState({ reconciledIds: ["e-1"] });
    expensePatch.mockResolvedValue({ data: BILL });
    await useHerdStore.getState().updateExpense("e-1", { notes: "folha" });
    expect(load).not.toHaveBeenCalled();
    await useHerdStore.getState().updateExpense("e-1", { amountBrl: 18500 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("explains a refusal in pt-BR: another value on match, a cartão as De", async () => {
    match.mockResolvedValue({ error: { status: 409, value: { error: "amount_differs" } } });
    expect(
      await useHerdStore.getState().resolveStatementLine(LINE, { type: "match", target: { kind: "expense", id: "e-1" } })
    ).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      "O valor do lançamento é diferente do banco. Ajuste o valor antes de conciliar."
    );
    transferPost.mockResolvedValue({ error: { status: 400, value: { error: "card_from" } } });
    await expect(
      useHerdStore.getState().addTransfer({ fromId: "card", toId: "sicredi", date: "2026-09-10", amountBrl: 1 })
    ).rejects.toThrow();
    expect(toast.error).toHaveBeenLastCalledWith("Um cartão só recebe o pagamento da fatura: escolha outra conta em De.");
  });
});
