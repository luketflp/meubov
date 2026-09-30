/**
 * Contas bancárias and transferências against the shared chainable db stub:
 * selects answer from a queue, writes are recorded.
 */
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

import { AddBankAccountUseCase } from "../AddBankAccount.useCase";
import { UpdateBankAccountUseCase } from "../UpdateBankAccount.useCase";
import { ArchiveBankAccountUseCase } from "../ArchiveBankAccount.useCase";
import { DeleteBankAccountUseCase } from "../DeleteBankAccount.useCase";
import { AddTransferUseCase } from "../AddTransfer.useCase";
import { UpdateTransferUseCase } from "../UpdateTransfer.useCase";
import { DeleteTransferUseCase } from "../DeleteTransfer.useCase";
import { SetMovementBankAccountUseCase } from "../SetMovementBankAccount.useCase";

const ROW = {
  id: "sicredi",
  farmId: 7,
  kind: "checking",
  name: "Sicredi",
  label: null,
  openingBalanceBrl: 1000,
  openingDate: "2026-08-31",
  isMain: true,
  closingDay: null,
  dueDay: null,
  paysFromId: null,
  csvMapping: null,
  archivedAt: null,
  createdAt: new Date("2026-09-01T12:00:00Z"),
};

beforeEach(() => {
  state.selectResults = [];
  state.updates = [];
  state.inserts = [];
  state.deletes = 0;
  state.returning = [];
});

describe("AddBankAccountUseCase", () => {
  it("makes the farm's first conta the conta principal", async () => {
    state.selectResults = [[]]; // no conta principal yet
    state.returning = [[{ ...ROW }]];
    await new AddBankAccountUseCase().run({ farmId: 7, kind: "checking", name: " Sicredi ", openingDate: "2026-08-31", openingBalanceBrl: 1000 });
    expect(state.inserts[0]).toMatchObject({ farmId: 7, name: "Sicredi", isMain: true, closingDay: null });
    expect(state.updates).toEqual([]);
  });

  it("takes the place of the current conta principal when marked", async () => {
    state.selectResults = [[{ id: "caixa" }]];
    state.returning = [[{ ...ROW }]];
    await new AddBankAccountUseCase().run({ farmId: 7, kind: "checking", name: "Sicredi", openingDate: "2026-08-31", isMain: true });
    expect(state.updates).toEqual([{ isMain: false }]);
    expect(state.inserts[0]).toMatchObject({ isMain: true });
  });

  it("keeps a cartão never principal, with what was owed on it as saldo inicial", async () => {
    state.selectResults = [[{ id: "sicredi" }], []];
    state.returning = [[{ ...ROW, kind: "card", isMain: false }]];
    await new AddBankAccountUseCase().run({
      farmId: 7,
      kind: "card",
      name: "Cartão",
      openingDate: "2026-08-31",
      openingBalanceBrl: -500,
      closingDay: 31,
      dueDay: 10,
      paysFromId: "sicredi",
    });
    expect(state.inserts[0]).toMatchObject({ isMain: false, openingBalanceBrl: -500, closingDay: 31, dueDay: 10, paysFromId: "sicredi" });
  });

  it("refuses a cartão without its days, marked principal, or paid by a conta not of the farm", async () => {
    const card = { farmId: 7, kind: "card" as const, name: "Cartão", openingDate: "2026-08-31" };
    expect(await new AddBankAccountUseCase().run({ ...card, dueDay: 10 })).toBe("card_days");
    expect(await new AddBankAccountUseCase().run({ ...card, closingDay: 1, dueDay: 10, isMain: true })).toBe("card_cannot_be_main");
    state.selectResults = [[]];
    expect(await new AddBankAccountUseCase().run({ ...card, closingDay: 1, dueDay: 10, paysFromId: "other-farm" })).toBe("invalid_pays_from");
    expect(state.inserts).toEqual([]);
  });
});

describe("UpdateBankAccountUseCase", () => {
  it("is null for another farm's conta", async () => {
    state.selectResults = [[]];
    expect(await new UpdateBankAccountUseCase().run({ farmId: 8, id: "sicredi", patch: { name: "X" } })).toBeNull();
  });

  it("keeps the conta principal until another one is marked", async () => {
    state.selectResults = [[ROW]];
    expect(await new UpdateBankAccountUseCase().run({ farmId: 7, id: "sicredi", patch: { isMain: false } })).toBe("main_required");
  });

  it("refuses to mark an archived conta principal", async () => {
    state.selectResults = [[{ ...ROW, id: "caixa", isMain: false, archivedAt: new Date("2026-09-20T12:00:00Z") }]];
    expect(await new UpdateBankAccountUseCase().run({ farmId: 7, id: "caixa", patch: { isMain: true } })).toBe("archived");
    expect(state.updates).toEqual([]);
  });

  it("takes a cartão's saldo inicial", async () => {
    state.selectResults = [[{ ...ROW, id: "card", kind: "card", isMain: false }]];
    state.returning = [[{ ...ROW, id: "card", kind: "card", isMain: false, openingBalanceBrl: -300 }]];
    await new UpdateBankAccountUseCase().run({ farmId: 7, id: "card", patch: { openingBalanceBrl: -300 } });
    expect(state.updates).toEqual([{ openingBalanceBrl: -300 }]);
  });

  it("moves the conta principal in one transaction", async () => {
    state.selectResults = [[{ ...ROW, id: "caixa", kind: "cash", isMain: false }]];
    state.returning = [[{ ...ROW, id: "caixa", kind: "cash", isMain: true }]];
    const result = await new UpdateBankAccountUseCase().run({ farmId: 7, id: "caixa", patch: { isMain: true, label: " " } });
    expect(state.updates).toEqual([{ isMain: false }, { isMain: true, label: null }]);
    expect(result).toMatchObject({ id: "caixa", isMain: true });
  });
});

describe("ArchiveBankAccountUseCase", () => {
  it("refuses the conta principal and archives any other", async () => {
    state.selectResults = [[ROW]];
    expect(await new ArchiveBankAccountUseCase().run({ farmId: 7, id: "sicredi", archived: true })).toBe("is_main");
    state.selectResults = [[{ ...ROW, isMain: false }]];
    state.returning = [[{ ...ROW, isMain: false, archivedAt: new Date("2026-09-29T12:00:00Z") }]];
    const archived = await new ArchiveBankAccountUseCase().run({ farmId: 7, id: "sicredi", archived: true });
    expect(state.updates[0].archivedAt).toBeInstanceOf(Date);
    expect(archived).toMatchObject({ archivedAt: "2026-09-29T12:00:00.000Z" });
  });
});

describe("DeleteBankAccountUseCase", () => {
  it("is not_found off the farm, in_use with rows, and deletes an unused conta", async () => {
    state.selectResults = [[]];
    expect(await new DeleteBankAccountUseCase().run({ farmId: 8, id: "sicredi" })).toBe("not_found");
    state.selectResults = [[{ ...ROW, isMain: false }], [{ used: true }]];
    expect(await new DeleteBankAccountUseCase().run({ farmId: 7, id: "sicredi" })).toBe("in_use");
    state.selectResults = [[ROW], [{ used: false }], [{ total: 2 }]];
    expect(await new DeleteBankAccountUseCase().run({ farmId: 7, id: "sicredi" })).toBe("is_main");
    expect(state.deletes).toBe(0);
    state.selectResults = [[{ ...ROW, isMain: false }], [{ used: false }]];
    expect(await new DeleteBankAccountUseCase().run({ farmId: 7, id: "sicredi" })).toBe("deleted");
    expect(state.deletes).toBe(1);
  });

  it("deletes the lone conta principal", async () => {
    state.selectResults = [[ROW], [{ used: false }], [{ total: 1 }]];
    expect(await new DeleteBankAccountUseCase().run({ farmId: 7, id: "sicredi" })).toBe("deleted");
  });
});

describe("transferências", () => {
  const input = { farmId: 7, userId: "u-1", fromId: "sicredi", toId: "caixa", date: "2026-09-15", amountBrl: 2000 };

  const SICREDI = { id: "sicredi", kind: "checking", archivedAt: null };
  const CAIXA = { id: "caixa", kind: "cash", archivedAt: null };

  it("records who moved the money", async () => {
    state.selectResults = [[SICREDI, CAIXA]];
    state.returning = [[{ id: "t-1", ...input, notes: null }]];
    const transfer = await new AddTransferUseCase().run({ ...input, notes: " Diárias " });
    expect(state.inserts[0]).toMatchObject({ farmId: 7, createdBy: "u-1", notes: "Diárias" });
    expect(transfer).toMatchObject({ id: "t-1", fromId: "sicredi", toId: "caixa", amountBrl: 2000 });
  });

  it("refuses one conta on both ends and a conta of another farm", async () => {
    expect(await new AddTransferUseCase().run({ ...input, toId: "sicredi" })).toBe("same_account");
    state.selectResults = [[SICREDI]];
    expect(await new AddTransferUseCase().run({ ...input, toId: "other-farm" })).toBe("account_not_found");
    state.selectResults = [[]];
    expect(await new UpdateTransferUseCase().run({ farmId: 8, id: "t-1", patch: { amountBrl: 1 } })).toBeNull();
    expect(state.inserts).toEqual([]);
  });

  it("refuses an archived conta and a cartão as De", async () => {
    state.selectResults = [[SICREDI, { ...CAIXA, archivedAt: new Date() }]];
    expect(await new AddTransferUseCase().run(input)).toBe("archived");
    state.selectResults = [[{ ...SICREDI, kind: "card" }, CAIXA]];
    expect(await new AddTransferUseCase().run(input)).toBe("card_from");
    // Paying the fatura: a cartão as Para is fine.
    state.selectResults = [[SICREDI, { ...CAIXA, kind: "card" }]];
    state.returning = [[{ id: "t-1", ...input, notes: null }]];
    expect(await new AddTransferUseCase().run(input)).toMatchObject({ id: "t-1" });
  });

  it("UpdateTransfer checks only a conta that changes and unpairs a linha the new value breaks", async () => {
    const row = { id: "t-1", farmId: 7, fromId: "sicredi", toId: "caixa", date: "2026-09-15", amountBrl: 2000, notes: null };
    // Amount only: no conta check; the sicredi line (−2000) no longer agrees, the caixa one is gone.
    state.selectResults = [[row], [{ id: "l-1", bankAccountId: "sicredi", amountBrl: -2000 }]];
    state.returning = [[{ ...row, amountBrl: 2500 }]];
    expect(await new UpdateTransferUseCase().run({ farmId: 7, id: "t-1", patch: { amountBrl: 2500 } })).toMatchObject({
      amountBrl: 2500,
    });
    expect(state.updates.at(-1)).toEqual({ transferId: null });

    // Date only: the linha stays.
    state.updates = [];
    state.selectResults = [[row]];
    state.returning = [[{ ...row, date: "2026-09-16" }]];
    await new UpdateTransferUseCase().run({ farmId: 7, id: "t-1", patch: { date: "2026-09-16" } });
    expect(state.updates).toHaveLength(1);

    // A new Para, archived: refused.
    state.selectResults = [[row], [{ id: "old", kind: "checking", archivedAt: new Date() }]];
    expect(await new UpdateTransferUseCase().run({ farmId: 7, id: "t-1", patch: { toId: "old" } })).toBe("archived");
  });

  it("DeleteTransfer removes the farm's transferência and is false off the farm", async () => {
    state.returning = [[{ id: "t-1" }]];
    expect(await new DeleteTransferUseCase().run({ farmId: 7, id: "t-1" })).toBe(true);
    state.returning = [[]];
    expect(await new DeleteTransferUseCase().run({ farmId: 8, id: "t-1" })).toBe(false);
  });
});

describe("SetMovementBankAccountUseCase", () => {
  it("sets the conta of a venda session, else of a legacy row, else answers null", async () => {
    state.selectResults = [[{ bankAccountId: null }], [{ kind: "checking", archivedAt: null }]];
    expect(await new SetMovementBankAccountUseCase().run({ farmId: 7, id: "m-1", bankAccountId: "sicredi" })).toEqual({
      id: "m-1",
      bankAccountId: "sicredi",
    });
    state.selectResults = [[], [{ bankAccountId: "sicredi" }]];
    expect(await new SetMovementBankAccountUseCase().run({ farmId: 7, id: "legacy", bankAccountId: null })).toEqual({
      id: "legacy",
      bankAccountId: null,
    });
    state.selectResults = [[], []];
    expect(await new SetMovementBankAccountUseCase().run({ farmId: 8, id: "m-1", bankAccountId: null })).toBeNull();
  });

  it("refuses a cartão: a venda never goes through the card", async () => {
    state.selectResults = [[{ bankAccountId: null }], [{ kind: "card", archivedAt: null }]];
    expect(await new SetMovementBankAccountUseCase().run({ farmId: 7, id: "m-1", bankAccountId: "card" })).toBe(
      "invalid_bank_account"
    );
  });

  it("keeps an unchanged (even archived) conta without checking it, and unpairs the old conta's linha", async () => {
    state.selectResults = [[{ bankAccountId: "old" }]];
    expect(await new SetMovementBankAccountUseCase().run({ farmId: 7, id: "m-1", bankAccountId: "old" })).toEqual({
      id: "m-1",
      bankAccountId: "old",
    });
    expect(state.updates).toEqual([]);

    state.selectResults = [
      [{ bankAccountId: "sicredi" }],
      [{ kind: "cash", archivedAt: null }],
      [{ id: "l-1", bankAccountId: "sicredi", amountBrl: 148320 }],
    ];
    await new SetMovementBankAccountUseCase().run({ farmId: 7, id: "m-1", bankAccountId: "caixa" });
    expect(state.updates).toEqual([{ bankAccountId: "caixa" }, { movementId: null }]);
  });
});
