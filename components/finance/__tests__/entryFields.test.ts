import { describe, expect, it } from "vitest";
import type { BankAccount, Expense } from "@/lib/types";
import { NONE, entrySummary, entryValues, initialFields, withKind, type EntryFields } from "@/components/finance/entryFields";

const TODAY = "2026-10-01";

const SICREDI: BankAccount = {
  id: "sicredi",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 0,
  openingDate: "2026-08-31",
  isMain: true,
  pendingLines: 0,
};
const CAIXA: BankAccount = { ...SICREDI, id: "caixa", kind: "cash", name: "Caixa", isMain: false };
const CARD: BankAccount = {
  ...SICREDI,
  id: "card",
  kind: "card",
  name: "Cartão Sicredi",
  isMain: false,
  closingDay: 31,
  dueDay: 10,
};
const BANKS = [CARD, CAIXA, SICREDI];

/** A new despesa of R$ 1.500,00, paid today from the Sicredi. */
const form = (patch: Partial<EntryFields> = {}): EntryFields => ({
  ...initialFields({ defaultKind: "expense" }, BANKS, TODAY),
  amount: "1.500,00",
  ...patch,
});

describe("initialFields", () => {
  const LIVE = { id: "g-maq", name: "Máquinas e veículos", createdAt: "2026-10-01T12:00:00Z" };
  const ARCHIVED = { id: "g-old", name: "Leilões", createdAt: "2026-09-01T12:00:00Z", archivedAt: "2026-09-20T12:00:00Z" };
  const GROUPS = [LIVE, ARCHIVED];

  it("starts a new lançamento in a farm grupo only while the grupo is live", () => {
    const start = (category: string) =>
      initialFields({ defaultKind: "expense", initial: { kind: "expense", category, accountId: "diesel" } }, BANKS, TODAY, GROUPS);
    expect(start("g-maq")).toMatchObject({ category: "g-maq", accountId: "diesel" });
    // An archived grupo, or one deleted meanwhile, is no new choice: back to Nutrição, without its conta.
    expect(start("g-old")).toMatchObject({ category: "nutrition", accountId: NONE });
    expect(start("g-gone")).toMatchObject({ category: "nutrition", accountId: NONE });
  });

  it("duplicates a lançamento of an archived grupo into Nutrição, and edits it where it is", () => {
    const row = { id: "e1", kind: "expense", date: "2026-05-01", category: "g-old", amountBrl: 100, accountId: "leiloeiro", createdAt: "2026-05-01T12:00:00Z" } as Expense;
    expect(initialFields({ defaultKind: "expense", template: row }, BANKS, TODAY, GROUPS)).toMatchObject({
      category: "nutrition",
      accountId: NONE,
    });
    expect(initialFields({ defaultKind: "expense", expense: row }, BANKS, TODAY, GROUPS)).toMatchObject({
      category: "g-old",
      accountId: "leiloeiro",
    });
  });

  it("starts a new despesa paid today from the conta principal", () => {
    expect(initialFields({ defaultKind: "expense" }, BANKS, TODAY)).toMatchObject({
      kind: "expense",
      flow: "out",
      date: TODAY,
      dueDate: TODAY,
      paid: true,
      paidAt: TODAY,
      bankAccountId: "sicredi",
      accountId: NONE,
      lotId: NONE,
    });
  });

  it("starts on the picked nó", () => {
    const initial = { kind: "financing", flow: "in", accountId: "custeio", bankAccountId: "caixa" } as const;
    expect(initialFields({ defaultKind: "expense", initial }, BANKS, TODAY)).toMatchObject({
      kind: "financing",
      flow: "in",
      accountId: "custeio",
      bankAccountId: "caixa",
    });
    expect(initialFields({ defaultKind: "expense", initial: { category: "health" } }, BANKS, TODAY).category).toBe(
      "health"
    );
  });

  it("Duplicar keeps what the lançamento is and starts it today, pending, outside any série", () => {
    const template: Expense = {
      id: "trator-6",
      kind: "investment",
      flow: "out",
      date: "2026-02-10",
      category: "other",
      amountBrl: 9000.5,
      dueDate: "2026-10-10",
      paidAt: "2026-10-10",
      bankAccountId: "card",
      counterparty: "Agro Máquinas Uberaba",
      document: "NF 2.871",
      accountId: "maquinas",
      history: "Trator MF 4275",
      notes: "entrega na sede",
      seriesId: "s1",
      seriesIndex: 6,
      seriesCount: 6,
      attachmentCount: 2,
    };
    expect(initialFields({ defaultKind: "expense", template }, BANKS, TODAY)).toEqual({
      kind: "investment",
      flow: "out",
      date: TODAY,
      amount: "9000,5",
      category: "other",
      accountId: "maquinas",
      dueDate: TODAY,
      dueTouched: false,
      paid: false,
      paidAt: TODAY,
      bankAccountId: "sicredi",
      history: "Trator MF 4275",
      counterparty: "Agro Máquinas Uberaba",
      document: "NF 2.871",
      lotId: NONE,
      notes: "entrega na sede",
    });
  });

  it("edits a capital row with its movimento; one stored without it is a saída", () => {
    const row: Expense = {
      id: "l1",
      kind: "financing",
      flow: "in",
      date: "2025-11-15",
      category: "other",
      amountBrl: 150000,
      accountId: "custeio",
    };
    expect(initialFields({ defaultKind: "expense", expense: row }, BANKS, TODAY).flow).toBe("in");
    expect(initialFields({ defaultKind: "expense", expense: { ...row, flow: undefined } }, BANKS, TODAY).flow).toBe(
      "out"
    );
  });
});

describe("withKind", () => {
  it("moves Pago por off a cartão when the new direction cannot use it", () => {
    const onCard = form({ bankAccountId: "card" });
    expect(withKind(onCard, "revenue", "out", BANKS).bankAccountId).toBe("sicredi");
    expect(withKind(onCard, "investment", "out", BANKS).bankAccountId).toBe("card");
    expect(withKind(onCard, "investment", "in", BANKS).bankAccountId).toBe("sicredi");
    expect(withKind(onCard, "partners", "out", BANKS).bankAccountId).toBe("sicredi");
  });

  it("starts a new kind without conta and keeps it when only the movimento changes", () => {
    const compra = form({ kind: "investment", accountId: "maquinas" });
    expect(withKind(compra, "investment", "in", BANKS).accountId).toBe("maquinas");
    expect(withKind(compra, "partners", "out", BANKS).accountId).toBe(NONE);
  });
});

describe("entryValues", () => {
  it("refuses a capital kind without conta", () => {
    expect(entryValues(form({ kind: "partners" }), false)).toBe("Escolha a conta do plano.");
  });

  it("writes an investimento with its movimento and conta, category other and no lote", () => {
    const values = entryValues(
      form({ kind: "investment", flow: "in", category: "health", accountId: "maquinas", lotId: "engorda" }),
      false
    );
    expect(values).toMatchObject({ flow: "in", category: "other", accountId: "maquinas", lotId: null, amountBrl: 1500 });
  });

  it("writes a despesa with its grupo and lote and no movimento", () => {
    const values = entryValues(form({ category: "health", lotId: "engorda", flow: "in" }), false);
    expect(values).toMatchObject({ category: "health", lotId: "engorda" });
    expect(values).not.toHaveProperty("flow");
  });

  it("writes a receita in category other, with no movimento", () => {
    const values = entryValues(form({ kind: "revenue", category: "health" }), false);
    expect(values).toMatchObject({ category: "other" });
    expect(values).not.toHaveProperty("flow");
  });

  it("leaves a pending lançamento without payment day or conta bancária", () => {
    expect(entryValues(form({ paid: false }), false)).toMatchObject({ paidAt: null, bankAccountId: null });
  });

  it("asks the day of the recebimento on an aporte and of the pagamento on a retirada", () => {
    const aporte = form({ kind: "partners", flow: "in", accountId: "socio", paidAt: "" });
    expect(entryValues(aporte, false)).toBe("Informe a data do recebimento.");
    expect(entryValues({ ...aporte, flow: "out" }, false)).toBe("Informe a data do pagamento.");
  });

  it("reads Vencimento only when Repetir does not set it", () => {
    expect(entryValues(form({ dueDate: "" }), false)).toBe("Informe o vencimento.");
    expect(entryValues(form({ dueDate: "" }), true)).not.toBeTypeOf("string");
  });
});

describe("entrySummary", () => {
  const NAMES = { group: "Máquinas e veículos", account: "Diesel", bank: "Sicredi" };
  const brl = (text: string) => text.replace(" ", "\u00a0");

  it("says what, how much, where and that it was paid today, by which conta", () => {
    expect(entrySummary(form(), null, NAMES, TODAY)).toEqual({
      lead: "Despesa de",
      value: brl("R$ 1.500,00"),
      rest: "em Máquinas e veículos › Diesel · pago hoje · Sicredi",
    });
  });

  it("gives the vencimento of a pending lançamento and the movimento of a capital one", () => {
    const compra = form({ kind: "investment", paid: false, dueDate: "2026-10-15", accountId: "maq" });
    expect(entrySummary(compra, null, { account: "Máquinas e implementos" }, TODAY)).toEqual({
      lead: "Compra de",
      value: brl("R$ 1.500,00"),
      rest: "em Máquinas e implementos · fora do custo · vence 15/10",
    });
  });

  it("counts the parcelas and gives the first one's value and vencimento", () => {
    const rule = { mode: "installments", count: 3, frequency: "monthly", startsOn: "2026-11-05" } as const;
    expect(entrySummary(form({ amount: "100,00", paid: false }), rule, NAMES, TODAY)).toEqual({
      lead: "3 parcelas de",
      value: brl("R$ 33,33"),
      rest: "em Máquinas e veículos › Diesel · a 1ª vence 05/11",
    });
  });

  it("says nothing while the form would not save", () => {
    expect(entrySummary(form({ amount: "" }), null, NAMES, TODAY)).toBeNull();
    expect(entrySummary(form({ kind: "partners", accountId: NONE }), null, {}, TODAY)).toBeNull();
  });
});
