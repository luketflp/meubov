import { describe, expect, it } from "vitest";
import { paneExportTable } from "@/lib/export/datasets/finance";
import { withoutMoney } from "@/lib/export/table";
import type { LedgerRow } from "@/lib/domain/ledger";
import type { PaneRow } from "@/lib/domain/planTree";

const ledger: LedgerRow = {
  id: "e1",
  kind: "expense",
  date: "2026-09-22",
  dueDate: "2026-10-22",
  paidAt: "2026-09-22",
  status: "paid",
  group: "nutrition",
  groupLabel: "Nutrição",
  account: "Ração e suplemento",
  bankAccountId: "b-1",
  history: null,
  counterparty: "Boleto Nutron",
  document: "NF 20.118",
  lotId: null,
  lotName: null,
  amountBrl: 4000,
  notes: null,
  locked: false,
  headCount: null,
  expense: null,
  inflow: false,
};

const boleto: PaneRow = {
  id: "e1",
  date: "2026-09-22",
  history: "Boleto Nutron",
  detail: "NF 20.118",
  contra: "Ração e suplemento",
  contraGroup: "Despesas › Nutrição",
  amountBrl: -4000,
  balance: 96204.75,
  ledger,
  transfer: null,
};

const aplicacao: PaneRow = {
  id: "t1",
  date: "2026-09-21",
  history: "Aplicação",
  detail: "transferência entre contas",
  contra: "Aplicação RDC Sicredi",
  contraGroup: "Bancos e caixa",
  amountBrl: -80000,
  balance: 100204.75,
  ledger: null,
  transfer: { id: "t1", fromId: "b-1", toId: "b-2", date: "2026-09-21", amountBrl: 80000 },
};

describe("paneExportTable", () => {
  it("writes the rows of a nó as shown: value signed, the saldo after each line", () => {
    const table = paneExportTable([boleto, aplicacao], "Sicredi");
    expect(table.title).toBe("Sicredi");
    expect(table.columns.map((c) => [c.header, c.kind])).toEqual([
      ["Data", "date"],
      ["Histórico", undefined],
      ["Detalhe", undefined],
      ["Contra partida", undefined],
      ["Grupo", undefined],
      ["Vencimento", "date"],
      ["Lote", undefined],
      ["Valor (R$)", "money"],
      ["Saldo (R$)", "money"],
      ["Status", undefined],
    ]);
    expect(table.rows).toEqual([
      [
        "2026-09-22",
        "Boleto Nutron",
        "NF 20.118",
        "Ração e suplemento",
        "Despesas › Nutrição",
        "2026-10-22",
        "Fazenda",
        -4000,
        96204.75,
        "Pago",
      ],
      [
        "2026-09-21",
        "Aplicação",
        "transferência entre contas",
        "Aplicação RDC Sicredi",
        "Bancos e caixa",
        null,
        null,
        -80000,
        100204.75,
        null,
      ],
    ]);
  });

  it("drops Valor and Saldo when money is hidden", () => {
    const table = withoutMoney(paneExportTable([boleto], "Sicredi"), false);
    const headers = table.columns.map((c) => c.header);
    expect(headers).not.toContain("Valor (R$)");
    expect(headers).not.toContain("Saldo (R$)");
    expect(table.rows[0]).toHaveLength(8);
  });
});
