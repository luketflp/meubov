import { describe, expect, it } from "vitest";
import type { BankAccount, Expense } from "@/lib/types";
import type { LedgerRow } from "@/lib/domain/ledger";
import type { PaneRow } from "@/lib/domain/planTree";
import { applicableActions } from "@/components/finance/lancamentos/useEntryActions";

const sicredi: BankAccount = {
  id: "b-1",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 0,
  openingDate: "2026-01-01",
  isMain: true,
  pendingLines: 0,
};

const carreta: Expense = {
  id: "e1",
  kind: "investment",
  flow: "out",
  date: "2026-09-05",
  category: "grp-investimentos",
  amountBrl: 19500,
};

/** The ledger row of a lançamento, or of a venda of the manejos when `expense` is null. */
function ledgerRow(expense: Expense | null, patch: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: expense?.id ?? "m1",
    kind: expense?.kind ?? "sale",
    date: "2026-09-05",
    dueDate: "2026-11-05",
    paidAt: expense?.paidAt ?? null,
    status: expense?.paidAt ? "paid" : "payable",
    group: "grp-investimentos",
    groupLabel: "Investimentos",
    account: "Máquinas e implementos",
    history: expense?.history ?? null,
    bankAccountId: null,
    counterparty: "Agropecuária Sertão",
    document: null,
    lotId: null,
    lotName: null,
    amountBrl: 19500,
    notes: null,
    locked: expense === null,
    headCount: null,
    expense,
    inflow: false,
    ...patch,
  };
}

function paneRow(ledger: LedgerRow | null, transfer: PaneRow["transfer"] = null): PaneRow {
  return {
    id: ledger?.id ?? transfer?.id ?? "x",
    date: "2026-09-05",
    history: "Agropecuária Sertão",
    detail: null,
    contra: null,
    contraGroup: null,
    amountBrl: -19500,
    balance: null,
    ledger,
    transfer,
  };
}

const enabled = (actions: Record<string, boolean>): string[] =>
  Object.keys(actions)
    .filter((key) => actions[key])
    .sort();

describe("applicableActions", () => {
  it("offers only Novo while no row is picked, and nothing without Financeiro edit", () => {
    expect(enabled(applicableActions(null, true, [sicredi]))).toEqual(["new"]);
    expect(enabled(applicableActions(null, false, [sicredi]))).toEqual([]);
  });

  it("offers every write on a pending lançamento", () => {
    expect(enabled(applicableActions(paneRow(ledgerRow(carreta)), true, [sicredi]))).toEqual([
      "duplicate",
      "edit",
      "markPaid",
      "new",
      "remove",
      "split",
    ]);
  });

  it("neither marks paid nor splits a paid row, and does not split a row of a série or a rendimento", () => {
    const paid = { ...carreta, paidAt: "2026-09-05" };
    const parcela = { ...carreta, seriesId: "s1", seriesIndex: 6, seriesCount: 6 };
    const rendimento: Expense = { ...carreta, kind: "yield", flow: undefined };
    expect(applicableActions(paneRow(ledgerRow(paid)), true, [sicredi])).toMatchObject({
      markPaid: false,
      split: false,
      edit: true,
      duplicate: true,
    });
    expect(applicableActions(paneRow(ledgerRow(parcela)), true, [sicredi])).toMatchObject({ markPaid: true, split: false });
    expect(applicableActions(paneRow(ledgerRow(rendimento)), true, [sicredi]).split).toBe(false);
  });

  it("only removes a transferência", () => {
    const transfer = { id: "t1", fromId: "b-1", toId: "b-2", date: "2026-09-21", amountBrl: 80000 };
    expect(enabled(applicableActions(paneRow(null, transfer), true, [sicredi]))).toEqual(["new", "remove"]);
  });

  it("gives a venda of the manejos only its conta, and none while no conta can take it", () => {
    const venda = paneRow(ledgerRow(null, { status: "received", paidAt: "2026-09-20", inflow: true }));
    expect(enabled(applicableActions(venda, true, [sicredi]))).toEqual(["account", "new"]);
    expect(applicableActions(venda, true, []).account).toBe(false);
  });

  it("leaves a member without Financeiro edit only the anexos", () => {
    const withFiles = { ...carreta, attachmentCount: 2 };
    expect(enabled(applicableActions(paneRow(ledgerRow(withFiles)), false, [sicredi]))).toEqual(["attachments"]);
  });
});
