/**
 * Extrato import and conciliação against the shared chainable db stub:
 * selects answer from a queue in call order, writes are recorded, and
 * `returning()` answers from its own queue.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
    inserts: [] as unknown[],
    deletes: 0,
    returning: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/api/__tests__/dbStub")).createDbStub(state),
}));

import { ImportStatementUseCase } from "../ImportStatement.useCase";
import { GetImportUseCase } from "../GetImport.useCase";
import { ResolveLineUseCase } from "../ResolveLine.useCase";
import { ConfirmHighUseCase } from "../ConfirmHigh.useCase";

const OFX = readFileSync(
  join(__dirname, "../../../../../domain/statements/__tests__/fixtures/sicredi-1x.ofx"),
  "utf8"
);

const ACCOUNT = {
  id: "sicredi",
  farmId: 7,
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 1000,
  openingDate: "2026-09-15",
  isMain: true,
  csvMapping: null,
  archivedAt: null,
};

const IMPORT_ROW = {
  id: "imp-1",
  farmId: 7,
  bankAccountId: "sicredi",
  fileName: "extrato.ofx",
  format: "ofx",
  periodFrom: "2026-09-01",
  periodTo: "2026-09-26",
  bankBalanceBrl: 84312.4,
  bankBalanceDate: "2026-09-26",
  lineCount: 4,
  skippedCount: 1,
  createdAt: new Date("2026-09-29T12:00:00Z"),
  createdBy: "u-1",
};

const LINE = {
  id: "l-1",
  farmId: 7,
  bankAccountId: "sicredi",
  importId: "imp-1",
  date: "2026-09-18",
  description: "PIX ENVIADO AGROPECUARIA SERTAO",
  amountBrl: -4850,
  externalId: "f:202609180002",
  status: "pending",
  expenseId: null,
  movementId: null,
  transferId: null,
  ignoreReason: null,
  resolvedAt: null,
  resolvedBy: null,
};

const EXPENSE = {
  id: "e-1",
  farmId: 7,
  kind: "expense",
  date: "2026-09-10",
  category: "nutrition",
  amountBrl: 4850,
  notes: null,
  dueDate: "2026-09-18",
  paidAt: null,
  counterparty: "Agropecuária Sertão",
  document: null,
  accountId: null,
  lotId: null,
  seriesId: null,
  seriesIndex: null,
  bankAccountId: null,
};

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
  state.deletes = 0;
  state.returning = [];
});

const importRun = (patch: Partial<Parameters<ImportStatementUseCase["run"]>[0]> = {}) =>
  new ImportStatementUseCase().run({
    farmId: 7,
    userId: "u-1",
    bankAccountId: "sicredi",
    fileName: "extrato.ofx",
    content: OFX,
    ...patch,
  });

describe("ImportStatementUseCase", () => {
  it("skips the lines already imported and sets aside those before the saldo inicial", async () => {
    state.selectResults = [[ACCOUNT], [{ externalId: "f:202609200003" }]];
    state.returning = [[IMPORT_ROW], [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], [IMPORT_ROW]];
    const result = await importRun();
    expect(result).toMatchObject({ newLines: 4, skipped: 1, import: { id: "imp-1", bankBalanceBrl: 84312.4 } });
    expect(state.inserts[0]).toMatchObject({ periodFrom: "2026-09-01", createdBy: "u-1" });
    // The counts are what was actually written.
    expect(state.updates[0]).toEqual({ lineCount: 4, skippedCount: 1 });
    const lines = state.inserts[1] as Record<string, unknown>[];
    expect(lines.map((l) => [l.date, l.status, l.ignoreReason])).toEqual([
      ["2026-09-10", "ignored", "antes do saldo inicial"],
      ["2026-09-18", "pending", null],
      ["2026-09-23", "pending", null],
      ["2026-09-24", "pending", null],
    ]);
  });

  it("counts only the lines it wrote, and rolls back when a concurrent import wrote them all", async () => {
    state.selectResults = [[ACCOUNT], []];
    state.returning = [[IMPORT_ROW], [{ id: "a" }, { id: "b" }], [{ ...IMPORT_ROW, lineCount: 2, skippedCount: 3 }]];
    expect(await importRun()).toMatchObject({ newLines: 2, skipped: 3, import: { lineCount: 2 } });
    expect(state.updates[0]).toEqual({ lineCount: 2, skippedCount: 3 });

    state.updates = [];
    state.selectResults = [[ACCOUNT], []];
    state.returning = [[IMPORT_ROW], []];
    expect(await importRun()).toBe("nothing_new");
    expect(state.updates).toEqual([]);
  });

  it("is not_found for an archived conta", async () => {
    state.selectResults = [[{ ...ACCOUNT, archivedAt: new Date("2026-09-20T12:00:00Z") }]];
    expect(await importRun()).toBe("not_found");
  });

  it("refuses a file with nothing new", async () => {
    state.selectResults = [
      [ACCOUNT],
      ["f:202609100001", "f:202609180002", "f:202609200003", "f:202609230004", "f:202609240005"].map((externalId) => ({
        externalId,
      })),
    ];
    expect(await importRun()).toBe("nothing_new");
    expect(state.inserts).toEqual([]);
  });

  it("is not_found for another farm's conta and refuses a caixa", async () => {
    state.selectResults = [[]];
    expect(await importRun()).toBe("not_found");
    state.selectResults = [[{ ...ACCOUNT, kind: "cash" }]];
    expect(await importRun()).toBe("not_checking");
  });

  it("asks for the columns of a CSV once, then keeps them on the conta", async () => {
    const csv = "Data;Histórico;Valor\n20/09/2026;PIX RECEBIDO;1.500,00\n";
    state.selectResults = [[ACCOUNT]];
    expect(await importRun({ fileName: "extrato.csv", content: csv })).toBe("mapping_required");
    const mapping = {
      delimiter: ";",
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      dateFormat: "dmy" as const,
      decimal: "," as const,
      skipRows: 1,
    };
    state.selectResults = [[ACCOUNT], []];
    state.returning = [[{ ...IMPORT_ROW, format: "csv" }], [{ id: "a" }], [{ ...IMPORT_ROW, format: "csv" }]];
    expect(await importRun({ fileName: "extrato.csv", content: csv, mapping })).toMatchObject({ newLines: 1 });
    expect(state.updates).toEqual([{ lineCount: 1, skippedCount: 0 }, { csvMapping: mapping }]);
  });

  it("passes the parser's code along", async () => {
    state.selectResults = [[ACCOUNT]];
    expect(await importRun({ content: "<OFX><STMTTRN><DTPOSTED>2026<TRNAMT>1</STMTTRN></OFX>" })).toBe("bad_date:1");
  });
});

describe("GetImportUseCase", () => {
  it("is null for another farm's import", async () => {
    state.selectResults = [[]];
    expect(await new GetImportUseCase().run({ farmId: 8, id: "imp-1" })).toBeNull();
  });

  it("answers the lines and every record already paired, a transferência per conta", async () => {
    state.selectResults = [
      [IMPORT_ROW],
      [LINE],
      [
        { bankAccountId: "caixa", expenseId: "e-9", movementId: null, transferId: null },
        { bankAccountId: "caixa", expenseId: null, movementId: null, transferId: "t-2" },
      ],
    ];
    const view = await new GetImportUseCase().run({ farmId: 7, id: "imp-1" });
    expect(view?.lines).toHaveLength(1);
    expect(view?.pairedIds).toEqual(["e-9", "t-2:caixa"]);
  });
});

const resolveRun = (action: Parameters<ResolveLineUseCase["run"]>[0]["action"], lineId = "l-1") =>
  new ResolveLineUseCase().run({ farmId: 7, userId: "u-1", lineId, action });

describe("ResolveLineUseCase", () => {
  it("pays a pending lançamento on the line's date from its conta", async () => {
    state.selectResults = [[LINE], [EXPENSE]];
    state.returning = [
      [{ ...EXPENSE, paidAt: "2026-09-18", bankAccountId: "sicredi" }],
      [{ ...LINE, status: "matched", expenseId: "e-1" }],
    ];
    const result = await resolveRun({ type: "match", target: { kind: "expense", id: "e-1" } });
    expect(state.updates[0]).toEqual({ paidAt: "2026-09-18", bankAccountId: "sicredi" });
    expect(state.updates[1]).toMatchObject({ status: "matched", expenseId: "e-1", resolvedBy: "u-1" });
    expect(result).toMatchObject({ line: { status: "matched" }, expense: { paidAt: "2026-09-18", bankAccountId: "sicredi" } });
  });

  it("refuses a lançamento paid by another conta and one on the other side", async () => {
    state.selectResults = [[LINE], [{ ...EXPENSE, paidAt: "2026-09-18", bankAccountId: "caixa" }]];
    expect(await resolveRun({ type: "match", target: { kind: "expense", id: "e-1" } })).toBe("paid_by_other");
    state.selectResults = [[LINE], [{ ...EXPENSE, kind: "revenue" }]];
    expect(await resolveRun({ type: "match", target: { kind: "expense", id: "e-1" } })).toBe("wrong_side");
    expect(state.updates).toEqual([]);
  });

  it("gives a venda without conta the line's conta", async () => {
    const receipt = { ...LINE, amountBrl: 148320 };
    state.selectResults = [[receipt], [{ kind: "sale", bankAccountId: null, totalAmountBrl: 148320 }]];
    state.returning = [[{ ...receipt, status: "matched", movementId: "m-1" }]];
    const result = await resolveRun({ type: "match", target: { kind: "movement", id: "m-1" } });
    expect(state.updates[0]).toEqual({ bankAccountId: "sicredi" });
    expect(result).toMatchObject({ movement: { id: "m-1", bankAccountId: "sicredi" } });
  });

  it("pays a pending lançamento of another value at the line's value", async () => {
    state.selectResults = [[LINE], [{ ...EXPENSE, amountBrl: 4800 }]];
    state.returning = [[{ ...EXPENSE, amountBrl: 4850, paidAt: "2026-09-18", bankAccountId: "sicredi" }], [{ ...LINE, status: "matched" }]];
    await resolveRun({ type: "match", target: { kind: "expense", id: "e-1" } });
    expect(state.updates[0]).toEqual({ paidAt: "2026-09-18", bankAccountId: "sicredi", amountBrl: 4850 });
  });

  it("refuses a paid lançamento, a venda and a transferência of another value", async () => {
    state.selectResults = [[LINE], [{ ...EXPENSE, amountBrl: 4800, paidAt: "2026-09-18", bankAccountId: "sicredi" }]];
    expect(await resolveRun({ type: "match", target: { kind: "expense", id: "e-1" } })).toBe("amount_differs");
    const receipt = { ...LINE, amountBrl: 148320 };
    // A session priced per animal: the sum of what each animal handled was worth.
    state.selectResults = [[receipt], [{ kind: "sale", bankAccountId: null, totalAmountBrl: null }], [{ total: 148000 }]];
    expect(await resolveRun({ type: "match", target: { kind: "movement", id: "m-1" } })).toBe("amount_differs");
    state.selectResults = [[LINE], [{ id: "t-1", farmId: 7, fromId: "sicredi", toId: "caixa", amountBrl: 4000 }]];
    expect(await resolveRun({ type: "match", target: { kind: "transfer", id: "t-1" } })).toBe("amount_differs");
    expect(state.updates).toEqual([]);
  });

  it("refuses an entrada as a transferência from a cartão", async () => {
    state.selectResults = [[{ ...LINE, amountBrl: 500 }], [{ id: "card", kind: "card" }]];
    expect(await resolveRun({ type: "transfer", otherAccountId: "card" })).toBe("card_from");
    expect(state.inserts).toEqual([]);
  });

  it("creates the lançamento paid on the line's date by its conta", async () => {
    state.selectResults = [[LINE], [{ kind: "checking", archivedAt: null }]];
    state.returning = [
      [{ ...EXPENSE, paidAt: "2026-09-18", bankAccountId: "sicredi" }],
      [{ ...LINE, status: "created", expenseId: "e-1" }],
    ];
    const result = await resolveRun({
      type: "create",
      // Value and payment day the form sent are pinned to the line's.
      entry: { date: "2026-09-18", category: "health", amountBrl: 1, paidAt: "2026-09-01", notes: "PIX ENVIADO AGROPECUARIA SERTAO" },
    });
    expect(state.inserts[0]).toMatchObject({
      kind: "expense",
      category: "health",
      amountBrl: 4850,
      paidAt: "2026-09-18",
      bankAccountId: "sicredi",
    });
    expect(result).toMatchObject({ line: { status: "created", expenseId: "e-1" } });
  });

  it("turns a saque into a transferência to the other conta", async () => {
    const saque = { ...LINE, amountBrl: -1000, description: "SAQUE CAIXA 24H" };
    state.selectResults = [[saque], [{ id: "caixa" }]];
    state.returning = [
      [{ id: "t-1", farmId: 7, fromId: "sicredi", toId: "caixa", date: "2026-09-18", amountBrl: 1000, notes: "SAQUE CAIXA 24H" }],
      [{ ...saque, status: "transfer", transferId: "t-1" }],
    ];
    const result = await resolveRun({ type: "transfer", otherAccountId: "caixa" });
    expect(state.inserts[0]).toMatchObject({ fromId: "sicredi", toId: "caixa", amountBrl: 1000, date: "2026-09-18" });
    expect(result).toMatchObject({ line: { status: "transfer" }, transfer: { id: "t-1" } });
    state.selectResults = [[saque]];
    expect(await resolveRun({ type: "transfer", otherAccountId: "sicredi" })).toBe("same_account");
  });

  it("ignores with a reason, refuses a second decision, and undoes back to pending", async () => {
    state.selectResults = [[LINE]];
    state.returning = [[{ ...LINE, status: "ignored", ignoreReason: "tarifa já lançada" }]];
    await resolveRun({ type: "ignore", reason: " tarifa já lançada " });
    expect(state.updates[0]).toMatchObject({ status: "ignored", ignoreReason: "tarifa já lançada" });

    state.selectResults = [[{ ...LINE, status: "ignored" }]];
    expect(await resolveRun({ type: "ignore", reason: "duplicada" })).toBe("not_pending");

    state.selectResults = [[{ ...LINE, status: "matched", expenseId: "e-1" }]];
    state.returning = [[LINE]];
    const undone = await resolveRun({ type: "undo" });
    expect(state.updates[1]).toMatchObject({ status: "pending", expenseId: null, movementId: null, transferId: null });
    expect(undone).toMatchObject({ line: { status: "pending" } });
    // The lançamento stays paid: undo writes the line only.
    expect(state.updates).toHaveLength(2);
  });

  it("is not_found for another farm's line and target_not_found for another farm's record", async () => {
    state.selectResults = [[]];
    expect(await resolveRun({ type: "ignore", reason: "outro" })).toBe("not_found");
    state.selectResults = [[LINE], []];
    expect(await resolveRun({ type: "match", target: { kind: "transfer", id: "t-other" } })).toBe("target_not_found");
    expect(state.updates).toEqual([]);
  });
});

describe("ConfirmHighUseCase", () => {
  it("confirms each pair and counts the refused ones", async () => {
    state.selectResults = [
      [LINE],
      [{ ...EXPENSE, paidAt: "2026-09-18", bankAccountId: "sicredi" }],
      [{ ...LINE, id: "l-2" }],
      [{ ...EXPENSE, id: "e-2", paidAt: "2026-09-18", bankAccountId: "caixa" }],
    ];
    state.returning = [[{ ...LINE, status: "matched", expenseId: "e-1" }]];
    const result = await new ConfirmHighUseCase().run({
      farmId: 7,
      userId: "u-1",
      importId: "imp-1",
      pairs: [
        { lineId: "l-1", kind: "expense", id: "e-1" },
        { lineId: "l-2", kind: "expense", id: "e-2" },
      ],
    });
    expect(result.resolved.map((r) => r.line.id)).toEqual(["l-1"]);
    expect(result.refused).toBe(1);
  });
});
