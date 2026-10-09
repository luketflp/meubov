import { describe, expect, it } from "vitest";
import type { BankAccount, Expense, GroupKind, PlanGroup, StatementLine } from "@/lib/types";
import { groupsOf } from "@/lib/domain/groups";
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

const group = (id: string, kind: GroupKind, name: string, archivedAt?: string): PlanGroup => ({
  id,
  kind,
  name,
  createdAt: "2026-01-01T12:00:00Z",
  ...(archivedAt ? { archivedAt } : {}),
});
/** By name the despesas are Leilões (archived), Máquinas e veículos, Nutrição; Financiamentos has only an archived grupo. */
const GROUPS: PlanGroup[] = [
  group("g-nut", "expense", "Nutrição"),
  group("g-maq", "expense", "Máquinas e veículos"),
  group("g-old", "expense", "Leilões", "2026-09-20T12:00:00Z"),
  group("g-rec", "revenue", "Receitas"),
  group("g-inv", "investment", "Investimentos"),
  group("g-ben", "investment", "Benfeitorias"),
  group("g-pronaf", "financing", "Pronaf", "2026-09-20T12:00:00Z"),
  group("g-soc", "partners", "Sócios"),
];

/** A new despesa of R$ 1.500,00 in Máquinas e veículos, paid today from the Sicredi. */
const form = (patch: Partial<EntryFields> = {}): EntryFields => ({
  ...initialFields({ defaultKind: "expense" }, BANKS, TODAY, GROUPS),
  amount: "1.500,00",
  ...patch,
});

describe("initialFields", () => {
  it("starts a new lançamento in the first active grupo of its tipo, or in none", () => {
    const start = (defaultKind: Expense["kind"]) => initialFields({ defaultKind }, BANKS, TODAY, GROUPS).category;
    expect(start("expense")).toBe("g-maq");
    expect(start("revenue")).toBe("g-rec");
    expect(start("investment")).toBe("g-ben");
    // No active grupo de financiamento: saving asks for one.
    expect(start("financing")).toBe("");
  });

  it("starts in the picked grupo only while it is active and of the tipo", () => {
    const start = (kind: Expense["kind"], category: string) =>
      initialFields({ defaultKind: "expense", initial: { kind, category, accountId: "diesel" } }, BANKS, TODAY, GROUPS);
    expect(start("expense", "g-nut")).toMatchObject({ category: "g-nut", accountId: "diesel" });
    // An archived grupo, one deleted meanwhile or one of another tipo is no new choice: the first one, without its conta.
    expect(start("expense", "g-old")).toMatchObject({ category: "g-maq", accountId: NONE });
    expect(start("expense", "g-gone")).toMatchObject({ category: "g-maq", accountId: NONE });
    expect(start("revenue", "g-nut")).toMatchObject({ category: "g-rec", accountId: NONE });
  });

  it("duplicates a lançamento of an archived grupo into the first active one, and edits it where it is", () => {
    const row = { id: "e1", kind: "expense", date: "2026-05-01", category: "g-old", amountBrl: 100, accountId: "leiloeiro", createdAt: "2026-05-01T12:00:00Z" } as Expense;
    expect(initialFields({ defaultKind: "expense", template: row }, BANKS, TODAY, GROUPS)).toMatchObject({
      category: "g-maq",
      accountId: NONE,
    });
    expect(initialFields({ defaultKind: "expense", expense: row }, BANKS, TODAY, GROUPS)).toMatchObject({
      category: "g-old",
      accountId: "leiloeiro",
    });
    // The Grupo picker of that edit still lists it.
    expect(groupsOf(GROUPS, "expense", { keep: row.category }).map((g) => g.id)).toEqual(["g-old", "g-maq", "g-nut"]);
  });

  it("starts a new despesa paid today from the conta principal", () => {
    expect(initialFields({ defaultKind: "expense" }, BANKS, TODAY, GROUPS)).toMatchObject({
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
    const initial = { kind: "partners", flow: "in", category: "g-soc", accountId: "aporte", bankAccountId: "caixa" } as const;
    expect(initialFields({ defaultKind: "expense", initial }, BANKS, TODAY, GROUPS)).toMatchObject({
      kind: "partners",
      flow: "in",
      category: "g-soc",
      accountId: "aporte",
      bankAccountId: "caixa",
    });
    expect(initialFields({ defaultKind: "expense", initial: { category: "g-nut" } }, BANKS, TODAY, GROUPS).category).toBe(
      "g-nut"
    );
  });

  it("starts a linha do extrato as a despesa or a receita in the first grupo of that tipo", () => {
    const line: StatementLine = {
      id: "l1",
      importId: "i1",
      bankAccountId: "caixa",
      date: "2026-09-12",
      description: "PIX AGROPECUARIA",
      amountBrl: -320,
      status: "pending",
    };
    expect(initialFields({ defaultKind: "expense", fromLine: line }, BANKS, TODAY, GROUPS)).toMatchObject({
      kind: "expense",
      category: "g-maq",
      amount: "320",
    });
    expect(
      initialFields({ defaultKind: "expense", fromLine: { ...line, amountBrl: 500 } }, BANKS, TODAY, GROUPS)
    ).toMatchObject({ kind: "revenue", category: "g-rec" });
  });

  it("Duplicar keeps what the lançamento is and starts it today, pending, outside any série", () => {
    const template: Expense = {
      id: "trator-6",
      kind: "investment",
      flow: "out",
      date: "2026-02-10",
      category: "g-inv",
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
    expect(initialFields({ defaultKind: "expense", template }, BANKS, TODAY, GROUPS)).toEqual({
      kind: "investment",
      flow: "out",
      date: TODAY,
      amount: "9000,5",
      category: "g-inv",
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
      category: "g-pronaf",
      amountBrl: 150000,
      accountId: "custeio",
    };
    expect(initialFields({ defaultKind: "expense", expense: row }, BANKS, TODAY, GROUPS).flow).toBe("in");
    expect(
      initialFields({ defaultKind: "expense", expense: { ...row, flow: undefined } }, BANKS, TODAY, GROUPS).flow
    ).toBe("out");
  });
});

describe("withKind", () => {
  it("moves Pago por off a cartão when the new direction cannot use it", () => {
    const onCard = form({ bankAccountId: "card" });
    expect(withKind(onCard, "revenue", "out", BANKS, GROUPS).bankAccountId).toBe("sicredi");
    expect(withKind(onCard, "investment", "out", BANKS, GROUPS).bankAccountId).toBe("card");
    expect(withKind(onCard, "investment", "in", BANKS, GROUPS).bankAccountId).toBe("sicredi");
    expect(withKind(onCard, "partners", "out", BANKS, GROUPS).bankAccountId).toBe("sicredi");
  });

  it("moves a new tipo to its first grupo without conta, and keeps both when only the movimento changes", () => {
    const compra = form({ kind: "investment", category: "g-inv", accountId: "maquinas" });
    expect(withKind(compra, "investment", "in", BANKS, GROUPS)).toMatchObject({ category: "g-inv", accountId: "maquinas" });
    expect(withKind(compra, "partners", "out", BANKS, GROUPS)).toMatchObject({ category: "g-soc", accountId: NONE });
    expect(withKind(compra, "revenue", "out", BANKS, GROUPS)).toMatchObject({ category: "g-rec", accountId: NONE });
    expect(withKind(compra, "financing", "out", BANKS, GROUPS)).toMatchObject({ category: "", accountId: NONE });
  });
});

describe("entryValues", () => {
  it("refuses a capital kind without conta", () => {
    expect(entryValues(form({ kind: "partners", category: "g-soc" }), false)).toBe("Escolha a conta do plano.");
  });

  it("refuses a lançamento without grupo, whatever its tipo", () => {
    expect(entryValues(form({ category: "" }), false)).toBe("Escolha o grupo.");
    expect(entryValues(form({ kind: "revenue", category: "" }), false)).toBe("Escolha o grupo.");
    expect(entryValues(form({ kind: "financing", category: "", accountId: "custeio" }), false)).toBe("Escolha o grupo.");
  });

  it("writes an investimento with its movimento, grupo and conta and no lote", () => {
    const values = entryValues(
      form({ kind: "investment", flow: "in", category: "g-inv", accountId: "maquinas", lotId: "engorda" }),
      false
    );
    expect(values).toMatchObject({ flow: "in", category: "g-inv", accountId: "maquinas", lotId: null, amountBrl: 1500 });
  });

  it("writes a despesa with its grupo and lote and no movimento", () => {
    const values = entryValues(form({ category: "g-nut", lotId: "engorda", flow: "in" }), false);
    expect(values).toMatchObject({ category: "g-nut", lotId: "engorda" });
    expect(values).not.toHaveProperty("flow");
  });

  it("writes a receita in its grupo, with no movimento", () => {
    const values = entryValues(form({ kind: "revenue", category: "g-rec" }), false);
    expect(values).toMatchObject({ category: "g-rec" });
    expect(values).not.toHaveProperty("flow");
  });

  it("leaves a pending lançamento without payment day or conta bancária", () => {
    expect(entryValues(form({ paid: false }), false)).toMatchObject({ paidAt: null, bankAccountId: null });
  });

  it("asks the day of the recebimento on an aporte and of the pagamento on a retirada", () => {
    const aporte = form({ kind: "partners", flow: "in", category: "g-soc", accountId: "socio", paidAt: "" });
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
  const brl = (text: string) => text.replace(" ", " ");

  it("says what, how much, where and that it was paid today, by which conta", () => {
    expect(entrySummary(form(), null, NAMES, TODAY)).toEqual({
      lead: "Despesa de",
      value: brl("R$ 1.500,00"),
      rest: "em Máquinas e veículos › Diesel · pago hoje · Sicredi",
    });
  });

  it("names the grupo of a receita", () => {
    const receita = form({ kind: "revenue", category: "g-rec" });
    expect(entrySummary(receita, null, { group: "Receitas", bank: "Sicredi" }, TODAY)).toEqual({
      lead: "Receita de",
      value: brl("R$ 1.500,00"),
      rest: "em Receitas · recebido hoje · Sicredi",
    });
  });

  it("gives the vencimento of a pending lançamento and the movimento of a capital one", () => {
    const compra = form({ kind: "investment", category: "g-inv", paid: false, dueDate: "2026-10-15", accountId: "maq" });
    expect(entrySummary(compra, null, { group: "Investimentos", account: "Máquinas e implementos" }, TODAY)).toEqual({
      lead: "Compra de",
      value: brl("R$ 1.500,00"),
      rest: "em Investimentos › Máquinas e implementos · fora do custo · vence 15/10",
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
    expect(entrySummary(form({ kind: "partners", category: "g-soc", accountId: NONE }), null, {}, TODAY)).toBeNull();
    expect(entrySummary(form({ category: "" }), null, NAMES, TODAY)).toBeNull();
  });
});
