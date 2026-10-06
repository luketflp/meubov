import { describe, expect, it } from "vitest";
import type { Account, BankAccount, Expense, ExpenseGroup, Movement, Transfer } from "@/lib/types";
import { formatCurrency } from "@/lib/domain/format";
import { BUILTIN_CATEGORIES } from "@/lib/domain/groups";
import {
  capitalSummary,
  debtBalance,
  entryInitialFor,
  filterPaneRows,
  legacyNode,
  nodeParam,
  nodeRows,
  nodeSummary,
  parseNode,
  planTree,
  type PaneRow,
  type PlanInputs,
  type PlanNode,
  type TreeItem,
} from "@/lib/domain/planTree";
import { makeManejoSession, makeTreatment } from "./fixtures";

// One small farm: two contas correntes, a caixa, an aplicação, a cartão and an
// archived caixa; contas in every group; lançamentos of every kind.
const TODAY = "2026-09-24";
const PERIOD = { start: "2026-07-01", end: "2026-09-30" };
const TREATMENT = "treatment:2026-09-08:Vacina aftosa";

const bank = (patch: Pick<BankAccount, "id" | "kind" | "name"> & Partial<BankAccount>): BankAccount => ({
  openingBalanceBrl: 0,
  openingDate: "2026-06-30",
  isMain: false,
  pendingLines: 0,
  ...patch,
});
const SICREDI = bank({
  id: "sicredi",
  kind: "checking",
  name: "Sicredi",
  openingBalanceBrl: 10000,
  isMain: true,
  pendingLines: 5,
  reconciledUntil: "2026-09-20",
  lastImportId: "imp-1",
});
const BB = bank({ id: "bb", kind: "checking", name: "Banco do Brasil", openingBalanceBrl: 30000 });
const CAIXA = bank({ id: "caixa", kind: "cash", name: "Caixa da fazenda", openingBalanceBrl: 500 });
const RDC = bank({ id: "rdc", kind: "investment", name: "Aplicação RDC" });
const CARTAO = bank({ id: "cartao", kind: "card", name: "Cartão Sicredi", closingDay: 31, dueDay: 10, paysFromId: "sicredi" });
const OLD = bank({ id: "old", kind: "cash", name: "Cofre antigo", archivedAt: "2026-01-10T00:00:00.000Z" });

const accounts: Account[] = [
  { id: "inv-maq", group: "investment", name: "Máquinas e implementos" },
  { id: "inv-benf", group: "investment", name: "Benfeitorias" },
  { id: "fin-custeio", group: "financing", name: "Custeio Sicredi" },
  { id: "fin-consorcio", group: "financing", name: "Consórcio trator", openingBalanceBrl: 100000, openingDate: "2026-07-31" },
  { id: "soc-lucro", group: "partners", name: "Distribuição de lucro" },
  { id: "nut-sal", group: "nutrition", name: "Sal mineral" },
  { id: "hea-vac", group: "health", name: "Vacinas" },
  { id: "adm-tel", group: "admin", name: "Telefone", archivedAt: "2026-09-01T00:00:00.000Z" },
  { id: "rev-aluguel", group: "revenue", name: "Aluguel de pasto" },
  { id: "rev-esterco", group: "revenue", name: "Venda de esterco", archivedAt: "2026-09-01T00:00:00.000Z" },
];
const account = (id: string): Account => accounts.find((a) => a.id === id)!;

const entry = (id: string, patch: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-01",
  category: "other",
  amountBrl: 100,
  ...patch,
});
/** Parcela `index` of 3 of the custeio's pagamentos, all with the liberação's competência. */
const parcela = (index: number, dueDate: string, paid: boolean): Expense =>
  entry(`f-p${index}`, {
    kind: "financing",
    flow: "out",
    accountId: "fin-custeio",
    date: "2026-07-15",
    dueDate,
    amountBrl: 10000,
    seriesId: "s-custeio",
    seriesIndex: index,
    seriesCount: 3,
    ...(paid && { paidAt: dueDate, bankAccountId: "sicredi" }),
  });

const expenses: Expense[] = [
  entry("e-sal", {
    category: "nutrition",
    accountId: "nut-sal",
    date: "2026-09-10",
    amountBrl: 1200,
    paidAt: "2026-09-10",
    bankAccountId: "sicredi",
    counterparty: "Agrovét Casa do Campo",
    document: "NF 4.812",
    lotId: "lot-1",
  }),
  entry("e-vac", { category: "health", accountId: "hea-vac", date: "2026-09-15", dueDate: "2026-10-15", amountBrl: 300 }),
  entry("e-tel", { category: "admin", accountId: "adm-tel", date: "2026-08-05", amountBrl: 90, paidAt: "2026-08-05", bankAccountId: "cartao" }),
  // Competência before the window, paid inside it: only the caixa shows it.
  entry("e-old", { category: "nutrition", accountId: "nut-sal", date: "2026-06-20", amountBrl: 400, paidAt: "2026-07-02", bankAccountId: "caixa" }),
  entry("r-aluguel", {
    kind: "revenue",
    accountId: "rev-aluguel",
    date: "2026-09-12",
    amountBrl: 2000,
    paidAt: "2026-09-14",
    bankAccountId: "bb",
    counterparty: "Fazenda Vizinha",
  }),
  entry("i-rocadeira", {
    kind: "investment",
    flow: "out",
    accountId: "inv-maq",
    date: "2026-09-18",
    amountBrl: 18500,
    paidAt: "2026-09-18",
    bankAccountId: "sicredi",
    counterparty: "Agro Máquinas",
    document: "NF 3.318",
  }),
  entry("i-venda", { kind: "investment", flow: "in", accountId: "inv-maq", date: "2026-08-20", amountBrl: 5000, paidAt: "2026-08-20", bankAccountId: "bb" }),
  entry("i-cerca", { kind: "investment", flow: "out", accountId: "inv-benf", date: "2026-09-20", dueDate: "2026-10-10", amountBrl: 2000 }),
  // Before the window and before Sicredi's opening date: only "Desde o início" counts it.
  entry("i-old", { kind: "investment", flow: "out", accountId: "inv-maq", date: "2026-03-10", amountBrl: 7000, paidAt: "2026-03-10", bankAccountId: "sicredi" }),
  entry("f-lib", {
    kind: "financing",
    flow: "in",
    accountId: "fin-custeio",
    date: "2026-07-15",
    amountBrl: 30000,
    paidAt: "2026-07-15",
    bankAccountId: "sicredi",
    document: "cédula 40/02871",
  }),
  parcela(1, "2026-08-15", true),
  parcela(2, "2026-09-15", true),
  parcela(3, "2026-10-15", false),
  // Paid on the consórcio's opening date: already inside its saldo inicial.
  entry("f-old", { kind: "financing", flow: "out", accountId: "fin-consorcio", date: "2026-07-20", amountBrl: 5000, paidAt: "2026-07-31" }),
  entry("f-c1", { kind: "financing", flow: "out", accountId: "fin-consorcio", date: "2026-08-31", amountBrl: 5000, paidAt: "2026-08-31", bankAccountId: "sicredi" }),
  // A liberação still pending: not owed yet.
  entry("f-lib-pend", { kind: "financing", flow: "in", accountId: "fin-consorcio", date: "2026-09-22", amountBrl: 20000 }),
  entry("p-ret", {
    kind: "partners",
    flow: "out",
    accountId: "soc-lucro",
    date: "2026-09-05",
    amountBrl: 6000,
    paidAt: "2026-09-05",
    bankAccountId: "sicredi",
    counterparty: "Lucas",
  }),
  entry("p-aporte", { kind: "partners", flow: "in", accountId: "soc-lucro", date: "2026-08-01", amountBrl: 1000, paidAt: "2026-08-01", bankAccountId: "caixa" }),
  entry("y-1", { kind: "yield", date: "2026-09-01", amountBrl: 250, paidAt: "2026-09-01", bankAccountId: "rdc" }),
];

const movements: Movement[] = [
  { id: "m-sale", type: "sale", date: "2026-09-20", quantity: 10, origin: "Engorda", destination: "Frigorífico Minerva", amountBrl: 50000, bankAccountId: "sicredi" },
  { id: "m-buy", type: "purchase", date: "2026-08-10", quantity: 8, origin: "Leilão Central", destination: "Recria", amountBrl: 20000, bankAccountId: "bb" },
];

const T_APL: Transfer = { id: "t-apl", fromId: "sicredi", toId: "rdc", date: "2026-09-21", amountBrl: 10000 };

const inputs: PlanInputs = {
  expenses,
  accounts,
  movements,
  manejoSessions: [],
  animals: [],
  treatments: [
    makeTreatment({ id: "t-1", animalEarTag: "BR-001", date: "2026-09-08", status: "done", costBrl: 5 }),
    makeTreatment({ id: "t-2", animalEarTag: "BR-002", date: "2026-09-08", status: "done", costBrl: 5 }),
  ],
  lots: [{ id: "lot-1", name: "Lote do Rio" }],
  bankAccounts: [CARTAO, BB, SICREDI, CAIXA, RDC, OLD],
  transfers: [T_APL],
  expenseGroups: [],
};

describe("nodeParam and parseNode", () => {
  const nodes: PlanNode[] = [
    { type: "all" },
    { type: "banks" },
    { type: "bank", id: "sicredi" },
    { type: "group", group: "investment" },
    { type: "group", group: "financing" },
    { type: "group", group: "partners" },
    { type: "group", group: "expenses" },
    { type: "group", group: "revenue" },
    { type: "group", group: "nutrition" },
    { type: "account", id: "nut-sal" },
    { type: "auto", which: "purchases" },
    { type: "auto", which: "sales" },
  ];

  it("writes each nó as its URL value", () => {
    expect(nodes.map((node) => nodeParam(node))).toEqual([
      "todos",
      "bancos",
      "banco:sicredi",
      "investimentos",
      "financiamentos",
      "socios",
      "despesas",
      "receitas",
      "grupo:nutrition",
      "conta:nut-sal",
      "compra-de-gado",
      "venda-de-gado",
    ]);
  });

  it("reads back every nó, every grupo de despesa included", () => {
    const grupos: PlanNode[] = BUILTIN_CATEGORIES.map((group) => ({ type: "group", group }));
    for (const node of [...nodes, ...grupos]) expect(parseNode(nodeParam(node))).toEqual(node);
  });

  it("reads an absent, empty, unknown or malformed value as null", () => {
    for (const value of [null, undefined, "", "nope", "Bancos", "banco", "banco:", "conta:", "grupo:", "grupo:revenue", "grupo:expenses", "grupo:investment"]) {
      expect(parseNode(value)).toBeNull();
    }
  });

  it("still reads a conta that was deleted; nodeSummary is what finds it gone", () => {
    expect(parseNode("conta:deleted")).toEqual({ type: "account", id: "deleted" });
  });
});

describe("legacyNode", () => {
  it("turns the old Extrato filters into a nó", () => {
    expect(legacyNode({ conta: "nut-sal" })).toEqual({ type: "account", id: "nut-sal" });
    expect(legacyNode({ grupo: "revenue" })).toEqual({ type: "group", group: "revenue" });
    expect(legacyNode({ grupo: "nutrition" })).toEqual({ type: "group", group: "nutrition" });
    expect(legacyNode({ grupo: "capital" })).toEqual({ type: "auto", which: "purchases" });
    expect(legacyNode({ tipo: "expense" })).toEqual({ type: "group", group: "expenses" });
    expect(legacyNode({ tipo: "revenue" })).toEqual({ type: "group", group: "revenue" });
    expect(legacyNode({ tipo: "sale" })).toEqual({ type: "auto", which: "sales" });
    expect(legacyNode({ tipo: "purchase" })).toEqual({ type: "auto", which: "purchases" });
    expect(legacyNode({ tipo: "treatment" })).toEqual({ type: "group", group: "health" });
  });

  it("prefers conta over grupo over tipo", () => {
    expect(legacyNode({ conta: "nut-sal", grupo: "admin", tipo: "sale" })).toEqual({ type: "account", id: "nut-sal" });
    expect(legacyNode({ grupo: "admin", tipo: "sale" })).toEqual({ type: "group", group: "admin" });
    expect(legacyNode({ grupo: "nope", tipo: "sale" })).toEqual({ type: "auto", which: "sales" });
  });

  it("is null when no old filter was set or the values are unknown", () => {
    expect(legacyNode({})).toBeNull();
    expect(legacyNode({ tipo: null, grupo: null, conta: null })).toBeNull();
    expect(legacyNode({ conta: "", grupo: "nope", tipo: "toString" })).toBeNull();
  });
});

describe("debtBalance", () => {
  it("adds the liberações received and takes the pagamentos paid, each on its payment day", () => {
    const custeio = account("fin-custeio");
    expect(debtBalance(custeio, expenses, "2026-07-14")).toBe(0);
    expect(debtBalance(custeio, expenses, "2026-07-15")).toBe(30000);
    expect(debtBalance(custeio, expenses, "2026-08-15")).toBe(20000);
    expect(debtBalance(custeio, expenses, TODAY)).toBe(10000);
  });

  it("starts from the saldo inicial, ignoring what was paid on or before its date and a liberação still pending", () => {
    const consorcio = account("fin-consorcio");
    expect(debtBalance(consorcio, expenses, "2026-07-30")).toBe(100000);
    expect(debtBalance(consorcio, expenses, "2026-07-31")).toBe(100000);
    expect(debtBalance(consorcio, expenses, "2026-08-31")).toBe(95000);
    expect(debtBalance(consorcio, expenses, "2026-12-31")).toBe(95000);
  });
});

describe("planTree", () => {
  const tree = planTree(inputs, PERIOD, TODAY);
  const top = (key: string): TreeItem => tree.find((i) => i.key === key)!;
  const figures = (items: TreeItem[] = []) => items.map((i) => [i.label, i.amountBrl]);

  it("lists the six groups in order, each saying what its figure is", () => {
    expect(tree.map((i) => [i.key, i.label, i.tag, i.amountBrl])).toEqual([
      ["bancos", "Bancos e caixa", "saldo", 57650],
      ["investimentos", "Investimentos", "no período", 35500],
      ["financiamentos", "Financiamentos", "devedor", 105000],
      ["socios", "Sócios", "retirado", 5000],
      ["despesas", "Despesas", "custo (COE)", 1600],
      ["receitas", "Receitas", "no período", 52000],
    ]);
  });

  it("shows each conta bancária with its saldo today, the conta principal first and the cartão last", () => {
    expect(top("bancos").children?.map((i) => [i.key, i.bankKind, i.amountBrl, i.archived])).toEqual([
      ["banco:sicredi", "checking", 29300, false],
      ["banco:bb", "checking", 17000, false],
      ["banco:caixa", "cash", 1100, false],
      ["banco:rdc", "investment", 10250, false],
      ["banco:cartao", "card", -90, false],
    ]);
  });

  it("sums investimentos, financiamentos and sócios per conta, with Compra de gado locked last", () => {
    expect(figures(top("investimentos").children)).toEqual([
      ["Benfeitorias", 2000],
      ["Máquinas e implementos", 13500],
      ["Compra de gado", 20000],
    ]);
    expect(top("investimentos").children?.at(-1)).toMatchObject({ key: "compra-de-gado", locked: true });
    expect(figures(top("financiamentos").children)).toEqual([
      ["Consórcio trator", 95000],
      ["Custeio Sicredi", 10000],
    ]);
    expect(figures(top("socios").children)).toEqual([["Distribuição de lucro", 5000]]);
  });

  it("opens Despesas into the seven grupos with the treatments under Sanidade", () => {
    const grupos = top("despesas").children ?? [];
    expect(grupos.map((i) => i.key)).toEqual(BUILTIN_CATEGORIES.map((c) => `grupo:${c}`));
    const grupo = (c: string) => grupos.find((i) => i.key === `grupo:${c}`)!;
    expect(["nutrition", "health", "admin", "pasture"].map((c) => grupo(c).amountBrl)).toEqual([1200, 310, 90, 0]);
    expect(figures(grupo("health").children)).toEqual([["Vacinas", 300]]);
    expect(grupo("pasture").children).toEqual([]);
  });

  it("opens Receitas with Venda de gado locked first", () => {
    expect(figures(top("receitas").children)).toEqual([
      ["Venda de gado", 50000],
      ["Aluguel de pasto", 2000],
    ]);
    expect(top("receitas").children?.[0]).toMatchObject({ key: "venda-de-gado", locked: true });
  });

  it("keeps an archived conta only while it has a line in the window", () => {
    const admin = (items: TreeItem[]) =>
      items.find((i) => i.key === "despesas")?.children?.find((i) => i.key === "grupo:admin")?.children;
    expect(admin(tree)).toEqual([expect.objectContaining({ key: "conta:adm-tel", archived: true, amountBrl: 90 })]);
    expect(admin(planTree(inputs, { start: "2026-09-01", end: "2026-09-30" }, TODAY))).toEqual([]);
    expect(JSON.stringify(tree)).not.toContain("rev-esterco");
    expect(top("bancos").children?.map((i) => i.key)).not.toContain("banco:old");
    const moved = { ...inputs, transfers: [...inputs.transfers, { id: "t-old", fromId: "old", toId: "caixa", date: "2026-09-02", amountBrl: 50 }] };
    expect(planTree(moved, PERIOD, TODAY)[0].children?.find((i) => i.key === "banco:old")).toMatchObject({
      archived: true,
      amountBrl: -50,
    });
  });
});

describe("nodeRows", () => {
  const rows = (node: PlanNode, period = PERIOD) => nodeRows(node, inputs, period, TODAY);
  const ids = (list: PaneRow[]) => list.map((r) => r.id);

  it("gives a conta bancária its movimentação by payment day with the saldo after each line", () => {
    const sicredi = rows({ type: "bank", id: "sicredi" });
    expect(sicredi.map((r) => [r.id, r.date, r.amountBrl, r.balance])).toEqual([
      ["t-apl", "2026-09-21", -10000, 29300],
      ["m-sale", "2026-09-20", 50000, 39300],
      ["i-rocadeira", "2026-09-18", -18500, -10700],
      ["f-p2", "2026-09-15", -10000, 7800],
      ["e-sal", "2026-09-10", -1200, 17800],
      ["p-ret", "2026-09-05", -6000, 19000],
      ["f-c1", "2026-08-31", -5000, 25000],
      ["f-p1", "2026-08-15", -10000, 30000],
      ["f-lib", "2026-07-15", 30000, 40000],
    ]);
    expect(sicredi[0]).toMatchObject({ ledger: null, transfer: T_APL });
    expect(sicredi[3].ledger?.expense?.id).toBe("f-p2");
  });

  it("names the conta do plano as the contra partida of a conta bancária's line", () => {
    expect(rows({ type: "bank", id: "sicredi" }).map((r) => [r.id, r.history, r.detail, r.contra, r.contraGroup])).toEqual([
      ["t-apl", "Transferência para Aplicação RDC", null, "Aplicação RDC", "transferência"],
      ["m-sale", "Frigorífico Minerva", null, "Venda de gado", "Receitas"],
      ["i-rocadeira", "Agro Máquinas", "NF 3.318", "Máquinas e implementos", "Investimentos"],
      ["f-p2", "Custeio Sicredi", "parcela 2/3", "Custeio Sicredi", "Financiamentos"],
      ["e-sal", "Agrovét Casa do Campo", "NF 4.812", "Sal mineral", "Despesas › Nutrição"],
      ["p-ret", "Lucas", null, "Distribuição de lucro", "Sócios"],
      ["f-c1", "Consórcio trator", null, "Consórcio trator", "Financiamentos"],
      ["f-p1", "Custeio Sicredi", "parcela 1/3", "Custeio Sicredi", "Financiamentos"],
      ["f-lib", "Custeio Sicredi", "cédula 40/02871", "Custeio Sicredi", "Financiamentos"],
    ]);
  });

  it("puts the histórico (or who) over pago para, observação, documento and the manejo's line, never repeating it", () => {
    const farm: PlanInputs = {
      ...inputs,
      expenses: [
        entry("i-trator", {
          kind: "investment",
          flow: "out",
          accountId: "inv-maq",
          date: "2026-09-03",
          counterparty: "Agro Máquinas Uberaba",
          notes: "Trator MF 4275",
          document: "NF 2.871",
        }),
        entry("e-diesel", { category: "admin", date: "2026-09-02", notes: "Diesel do trator", document: "NF 77" }),
        entry("i-historico", {
          kind: "investment",
          flow: "out",
          accountId: "inv-maq",
          date: "2026-09-04",
          history: "Carreta agrícola 4 t",
          counterparty: "Agropecuária Sertão",
          notes: "entrega na sede",
          document: "NF 11.640",
        }),
      ],
      manejoSessions: [
        makeManejoSession({
          id: "m-sale",
          date: "2026-09-20",
          status: "closed",
          kind: "sale",
          counterparty: "Frigorífico Minerva",
          animals: [{ earTag: "BR-101", outcome: "done" }],
        }),
      ],
    };
    const lines = nodeRows({ type: "all" }, farm, PERIOD, TODAY);
    const line = (id: string) => lines.find((r) => r.id === id)!;
    expect(["i-historico", "i-trator", "e-diesel", "m-sale", TREATMENT].map((id) => [line(id).history, line(id).detail])).toEqual([
      ["Carreta agrícola 4 t", "Agropecuária Sertão · entrega na sede · NF 11.640"],
      ["Agro Máquinas Uberaba", "Trator MF 4275 · NF 2.871"],
      ["Diesel do trator", "NF 77"],
      ["Frigorífico Minerva", "manejo · 1 animal"],
      ["Vacina aftosa", null],
    ]);
  });

  it("takes a line paid in the window even when its competência is older", () => {
    expect(rows({ type: "bank", id: "caixa" }).map((r) => [r.id, r.date, r.balance])).toEqual([
      ["p-aporte", "2026-08-01", 1100],
      ["e-old", "2026-07-02", 100],
    ]);
    expect(ids(rows({ type: "account", id: "nut-sal" }))).toEqual(["e-sal"]);
  });

  it("puts a rendimento in its aplicação, in Bancos e caixa and in todos only", () => {
    expect(rows({ type: "bank", id: "rdc" }).map((r) => [r.id, r.history, r.contra, r.contraGroup, r.amountBrl, r.balance])).toEqual([
      ["t-apl", "Transferência de Sicredi", "Sicredi", "transferência", 10000, 10250],
      ["y-1", "Rendimento", "Rendimento", null, 250, 250],
    ]);
    expect(ids(rows({ type: "all" }))).toContain("y-1");
    expect(ids(rows({ type: "banks" }))).toContain("y-1");
    const others: PlanNode[] = [{ type: "group", group: "investment" }, { type: "group", group: "revenue" }];
    for (const node of others) expect(ids(rows(node))).not.toContain("y-1");
  });

  it("shows a financiamento by competência, the latest vencimento first, with the saldo devedor after each paid line", () => {
    expect(rows({ type: "account", id: "fin-custeio" }).map((r) => [r.id, r.date, r.amountBrl, r.balance, r.contra])).toEqual([
      ["f-p3", "2026-07-15", -10000, null, null],
      ["f-p2", "2026-07-15", -10000, 10000, "Sicredi"],
      ["f-p1", "2026-07-15", -10000, 20000, "Sicredi"],
      ["f-lib", "2026-07-15", 30000, 30000, "Sicredi"],
    ]);
    const group = rows({ type: "group", group: "financing" });
    expect(ids(group)).toEqual(["f-lib-pend", "f-c1", "f-old", "f-p3", "f-p2", "f-p1", "f-lib"]);
    expect(group.every((r) => r.balance === null)).toBe(true);
  });

  it("leaves a line inside the saldo inicial without saldo devedor and runs the saldo through lines paid on one day", () => {
    expect(rows({ type: "account", id: "fin-consorcio" }).map((r) => [r.id, r.balance])).toEqual([
      ["f-lib-pend", null],
      ["f-c1", 95000],
      ["f-old", null],
    ]);
    const sameDay = [
      entry("d-1", { kind: "financing", flow: "out", accountId: "fin-custeio", date: "2026-09-02", amountBrl: 300, paidAt: "2026-09-02" }),
      entry("d-2", { kind: "financing", flow: "out", accountId: "fin-custeio", date: "2026-09-02", amountBrl: 200, paidAt: "2026-09-02" }),
    ];
    const custeio = nodeRows({ type: "account", id: "fin-custeio" }, { ...inputs, expenses: [...expenses, ...sameDay] }, PERIOD, TODAY);
    const after = new Map(custeio.map((r) => [r.id, r.balance]));
    expect([after.get("d-1"), after.get("d-2"), after.get("f-p2")]).toEqual([19700, 19500, 9500]);
  });

  it("gives every other nó its rows by competência, newest first, signed, with the conta bancária as contra partida", () => {
    expect(rows({ type: "group", group: "investment" }).map((r) => [r.id, r.amountBrl, r.contra, r.contraGroup])).toEqual([
      ["i-cerca", -2000, null, null],
      ["i-rocadeira", -18500, "Sicredi", "Bancos e caixa"],
      ["i-venda", 5000, "Banco do Brasil", "Bancos e caixa"],
      ["m-buy", -20000, "Banco do Brasil", "Bancos e caixa"],
    ]);
    expect(ids(rows({ type: "group", group: "expenses" }))).toEqual(["e-vac", "e-sal", TREATMENT, "e-tel"]);
    expect(ids(rows({ type: "group", group: "health" }))).toEqual(["e-vac", TREATMENT]);
    expect(ids(rows({ type: "group", group: "revenue" }))).toEqual(["m-sale", "r-aluguel"]);
    expect(ids(rows({ type: "group", group: "partners" }))).toEqual(["p-ret", "p-aporte"]);
    expect(ids(rows({ type: "auto", which: "sales" }))).toEqual(["m-sale"]);
    expect(ids(rows({ type: "auto", which: "purchases" }))).toEqual(["m-buy"]);
    expect(ids(rows({ type: "account", id: "inv-maq" }))).toEqual(["i-rocadeira", "i-venda"]);
    expect(rows({ type: "group", group: "health" }).find((r) => r.id === TREATMENT)).toMatchObject({
      history: "Vacina aftosa",
      amountBrl: -10,
    });
  });

  it("shows in Bancos e caixa the movimentação of every conta by payment day, both sides of each transferência", () => {
    const banks = rows({ type: "banks" });
    expect(ids(banks)).toEqual([
      "t-apl:sicredi",
      "t-apl:rdc",
      "m-sale",
      "i-rocadeira",
      "f-p2",
      "r-aluguel",
      "e-sal",
      "p-ret",
      "y-1",
      "f-c1",
      "i-venda",
      "f-p1",
      "m-buy",
      "e-tel",
      "p-aporte",
      "f-lib",
      "e-old",
    ]);
    // Competência in June, paid in July: the conta shows it on the payment day, as its own nó does.
    expect(banks.find((r) => r.id === "e-old")).toMatchObject({ date: "2026-07-02", contra: "Caixa da fazenda", balance: null });
    expect(banks.slice(0, 2).map((r) => [r.amountBrl, r.contra, r.contraGroup, r.transfer?.id])).toEqual([
      [-10000, "Aplicação RDC", "transferência", "t-apl"],
      [10000, "Sicredi", "transferência", "t-apl"],
    ]);
    expect(banks.find((r) => r.id === "e-tel")).toMatchObject({ contra: "Cartão Sicredi", amountBrl: -90 });
  });

  it("is empty for a conta that no longer exists", () => {
    expect(rows({ type: "bank", id: "gone" })).toEqual([]);
    expect(rows({ type: "account", id: "gone" })).toEqual([]);
  });
});

describe("filterPaneRows", () => {
  const filter = (rows: PaneRow[], patch: Partial<Parameters<typeof filterPaneRows>[1]>) =>
    filterPaneRows(rows, { lotId: "all", pendingOnly: false, search: "", ...patch }).map((r) => r.id);
  const banks = nodeRows({ type: "banks" }, inputs, PERIOD, TODAY);
  const sicredi = nodeRows({ type: "bank", id: "sicredi" }, inputs, PERIOD, TODAY);

  it("filters by lote, a transferência passing only “all”", () => {
    expect(filter(banks, {})).toHaveLength(banks.length);
    expect(filter(banks, { lotId: "lot-1" })).toEqual(["e-sal"]);
    const farm = filter(banks, { lotId: "farm" });
    expect(farm).toHaveLength(banks.length - 3);
    expect(farm).not.toContain("t-apl:sicredi");
  });

  it("keeps only what is still to pay or receive", () => {
    const financing = nodeRows({ type: "group", group: "financing" }, inputs, PERIOD, TODAY);
    expect(filter(financing, { pendingOnly: true })).toEqual(["f-lib-pend", "f-p3"]);
    expect(filter(sicredi, { pendingOnly: true })).toEqual([]);
  });

  it("searches history, detail and contra partida without accents or case", () => {
    expect(filter(sicredi, { search: "agrovet" })).toEqual(["e-sal"]);
    expect(filter(sicredi, { search: "PARCELA 2" })).toEqual(["f-p2"]);
    expect(filter(sicredi, { search: "nutricao" })).toEqual(["e-sal"]);
    expect(filter(sicredi, { search: "transferencia" })).toEqual(["t-apl"]);
    expect(filter(sicredi, { search: "  socios " })).toEqual(["p-ret"]);
  });
});

describe("nodeSummary", () => {
  const summary = (node: PlanNode) => nodeSummary(node, inputs, PERIOD, TODAY);
  const strip = (node: PlanNode) => summary(node)?.figures.map((f) => [f.label, f.text ?? f.amountBrl, f.sub, f.tone]);

  it("is null for a nó whose conta no longer exists, as an old link may carry", () => {
    expect(summary({ type: "bank", id: "gone" })).toBeNull();
    expect(summary(parseNode("conta:deleted")!)).toBeNull();
  });

  it("sums receitas, COE, resultado and what stays out of it on todos", () => {
    expect(summary({ type: "all" })).toMatchObject({ crumb: null, title: "Todos os lançamentos", pills: [] });
    expect(strip({ type: "all" })).toEqual([
      ["Receitas", 52000, "vendas e outras receitas", "healthy"],
      ["Despesas (COE)", 1600, "despesas e tratamentos", "ink"],
      ["Resultado", 50400, "receitas − custo", "healthy"],
      ["Fora do resultado", -30250, "capital, dívidas e sócios · entradas − saídas", "ink"],
    ]);
  });

  it("shows a conta corrente's saldo, entradas, saídas and conciliação", () => {
    expect(summary({ type: "bank", id: "sicredi" })).toMatchObject({
      crumb: "Bancos e caixa",
      title: "Sicredi",
      pills: [
        { text: "conta corrente", tone: "muted" },
        { text: "principal", tone: "brand" },
      ],
      bank: SICREDI,
    });
    expect(strip({ type: "bank", id: "sicredi" })).toEqual([
      ["Saldo hoje", 29300, "em 24/09/2026", "ink"],
      ["Entradas no período", 80000, "2 recebimentos", "healthy"],
      ["Saídas no período", 60700, "7 pagamentos", "ink"],
      ["Conciliação", "até 20/09", "5 linhas do banco a conciliar", "attention"],
    ]);
    expect(summary({ type: "bank", id: "sicredi" })?.figures[3].amountBrl).toBeNull();
  });

  it("swaps the fourth figure on a caixa, a cartão and an aplicação", () => {
    expect(strip({ type: "bank", id: "caixa" })?.[3]).toEqual(["Lançamentos", "2", "no período", "ink"]);
    expect(strip({ type: "bank", id: "cartao" })?.[3]).toEqual(["Fatura aberta", 90, "vence 10/10/2026", "attention"]);
    expect(strip({ type: "bank", id: "rdc" })?.[3]).toEqual(["Rendimento no período", 250, "1 rendimento", "healthy"]);
    expect(summary({ type: "bank", id: "rdc" })?.pills).toEqual([{ text: "aplicação", tone: "muted" }]);
  });

  it("adds the contas up on Bancos e caixa by payment day, leaving out the cartões and the transferências between contas", () => {
    expect(strip({ type: "banks" })).toEqual([
      ["Saldo em contas", 57650, "hoje · sem os cartões", "ink"],
      ["Entradas no período", 88250, "6 recebimentos", "healthy"],
      ["Saídas no período", 71100, "8 pagamentos", "ink"],
      ["Cartões", 90, "a pagar · fora do saldo", "attention"],
    ]);
  });

  it("counts the payment of a fatura as a saída of the contas", () => {
    const fatura: Transfer = { id: "t-fat", fromId: "sicredi", toId: "cartao", date: "2026-09-10", amountBrl: 90 };
    const figures = nodeSummary({ type: "banks" }, { ...inputs, transfers: [T_APL, fatura] }, PERIOD, TODAY)?.figures;
    expect([figures?.[2].amountBrl, figures?.[2].sub]).toEqual([71190, "9 pagamentos"]);
  });

  it("shows an investimento's compras, what was paid, what is still to pay and the total since the start", () => {
    expect(summary({ type: "group", group: "investment" })).toMatchObject({
      crumb: null,
      title: "Investimentos",
      pills: [
        { text: "investimento", tone: "scheduled" },
        { text: "fora do custo (COE)", tone: "muted" },
      ],
    });
    expect(strip({ type: "group", group: "investment" })).toEqual([
      ["Investido no período", 35500, "3 compras · pela data da compra", "ink"],
      ["Pago", 38500, "saiu do caixa", "ink"],
      ["A pagar", 2000, "1 lançamento · próxima 10/10", "attention"],
      ["Desde o início", 42500, "tudo o que entrou no grupo", "ink"],
    ]);
    expect(summary({ type: "account", id: "inv-maq" })).toMatchObject({
      crumb: "Investimentos",
      title: "Máquinas e implementos",
      account: account("inv-maq"),
    });
    expect(strip({ type: "account", id: "inv-maq" })?.[3]).toEqual(["Desde o início", 20500, "tudo o que entrou nesta conta", "ink"]);
    expect(summary({ type: "auto", which: "purchases" })).toMatchObject({ crumb: "Investimentos", title: "Compra de gado" });
  });

  it("shows a financiamento's saldo devedor, liberado, pago, próxima parcela and how much is quitado", () => {
    expect(summary({ type: "account", id: "fin-custeio" })).toMatchObject({
      crumb: "Financiamentos",
      title: "Custeio Sicredi",
      pills: [
        { text: "financiamento", tone: "fmd" },
        { text: "fora do resultado", tone: "muted" },
      ],
    });
    expect(strip({ type: "account", id: "fin-custeio" })).toEqual([
      ["Saldo devedor", 10000, "1 parcela a pagar", "ink"],
      ["Liberado", 30000, "1 liberação", "scheduled"],
      ["Pago", 20000, "2 parcelas", "ink"],
      ["Próxima parcela", 10000, "vence 15/10/2026", "attention"],
    ]);
    expect(summary({ type: "account", id: "fin-custeio" })?.paidShare).toBeCloseTo(2 / 3);
    expect(strip({ type: "account", id: "fin-consorcio" })?.[3]).toEqual(["Próxima parcela", "—", "nenhuma parcela a pagar", "ink"]);
    // Liberado and Pago are what moved the saldo devedor: since the saldo inicial, whatever the window.
    expect(strip({ type: "account", id: "fin-consorcio" })?.slice(0, 3)).toEqual([
      ["Saldo devedor", 95000, "nenhuma parcela a pagar", "ink"],
      ["Liberado", 0, "0 liberações", "scheduled"],
      ["Pago", 5000, "1 parcela", "ink"],
    ]);
    expect(nodeSummary({ type: "account", id: "fin-custeio" }, inputs, { start: "2026-09-01", end: "2026-09-30" }, TODAY)?.figures[2].amountBrl).toBe(20000);
    expect(summary({ type: "account", id: "fin-consorcio" })?.paidShare).toBeCloseTo(0.05);
    expect(summary({ type: "group", group: "financing" })?.figures[0].amountBrl).toBe(105000);
    expect(summary({ type: "group", group: "financing" })?.paidShare).toBeCloseTo(25000 / 130000);
    expect(summary({ type: "group", group: "investment" })?.paidShare).toBeUndefined();
  });

  it("shows what the sócios took out, put in and the net", () => {
    expect(strip({ type: "group", group: "partners" })).toEqual([
      ["Retirado", 6000, "1 retirada", "ink"],
      ["Aportado", 1000, "1 aporte", "healthy"],
      ["Líquido", 5000, "retirado − aportado", "ink"],
      ["A pagar", 0, "nada a pagar", "ink"],
    ]);
  });

  it("shows a grupo de despesa with its share of the COE", () => {
    expect(summary({ type: "group", group: "health" })).toMatchObject({
      crumb: "Despesas",
      title: "Sanidade",
      pills: [{ text: "custo (COE)", tone: "muted" }],
    });
    expect(strip({ type: "group", group: "health" })).toEqual([
      ["No período", 310, "2 lançamentos", "ink"],
      ["Pago", 10, "saiu do caixa", "ink"],
      ["A pagar", 300, "1 lançamento · próxima 15/10", "attention"],
      ["% do COE", "19 %", `de ${formatCurrency(1600)}`, "ink"],
    ]);
    expect(summary({ type: "account", id: "nut-sal" })).toMatchObject({ crumb: "Despesas › Nutrição", title: "Sal mineral" });
    expect(summary({ type: "account", id: "adm-tel" })?.pills).toContainEqual({ text: "arquivada", tone: "muted" });
  });

  it("shows a receita with what came in and its share of the receita", () => {
    expect(summary({ type: "auto", which: "sales" })).toMatchObject({ crumb: "Receitas", title: "Venda de gado" });
    expect(strip({ type: "auto", which: "sales" })).toEqual([
      ["No período", 50000, "1 lançamento", "ink"],
      ["Recebido", 50000, "entrou no caixa", "healthy"],
      ["A receber", 0, "nada a receber", "ink"],
      ["% da receita", "96 %", `de ${formatCurrency(52000)}`, "ink"],
    ]);
  });
});

describe("entryInitialFor", () => {
  const initial = (node: PlanNode) => entryInitialFor(node, accounts, inputs.bankAccounts);

  it("starts Novo with nothing on todos, Bancos e caixa and the lines of the manejos", () => {
    expect(initial({ type: "all" })).toEqual({});
    expect(initial({ type: "banks" })).toEqual({});
    expect(initial({ type: "auto", which: "sales" })).toEqual({});
  });

  it("starts on the picked conta bancária, a rendimento on an aplicação", () => {
    expect(initial({ type: "bank", id: "sicredi" })).toEqual({ bankAccountId: "sicredi" });
    expect(initial({ type: "bank", id: "rdc" })).toEqual({ kind: "yield", bankAccountId: "rdc" });
  });

  it("starts with the kind of the group, the grupo and the conta", () => {
    expect(initial({ type: "group", group: "financing" })).toEqual({ kind: "financing" });
    expect(initial({ type: "group", group: "expenses" })).toEqual({ kind: "expense" });
    expect(initial({ type: "group", group: "breeding" })).toEqual({ kind: "expense", category: "breeding" });
    expect(initial({ type: "group", group: "revenue" })).toEqual({ kind: "revenue" });
    expect(initial({ type: "account", id: "nut-sal" })).toEqual({ kind: "expense", category: "nutrition", accountId: "nut-sal" });
    expect(initial({ type: "account", id: "rev-aluguel" })).toEqual({ kind: "revenue", accountId: "rev-aluguel" });
    expect(initial({ type: "account", id: "soc-lucro" })).toEqual({ kind: "partners", accountId: "soc-lucro" });
    expect(initial({ type: "account", id: "gone" })).toEqual({});
  });
});

describe("capitalSummary", () => {
  it("adds up the Painel's capital, dívidas e sócios", () => {
    expect(capitalSummary(inputs, PERIOD, TODAY)).toEqual({
      invested: 35500,
      investedAssets: 15500,
      investedCattle: 20000,
      applications: 10250,
      yieldInPeriod: 250,
      debt: 105000,
      debtAccounts: 2,
      nextInstallment: { dueDate: "2026-10-15", amountBrl: 10000 },
      withdrawn: 5000,
    });
  });

  it("leaves archived financiamentos out and counts only the contas that still owe", () => {
    const more: Account[] = [
      ...accounts,
      { id: "fin-old", group: "financing", name: "Antigo", openingBalanceBrl: 5000, openingDate: "2026-01-01", archivedAt: "2026-02-01T00:00:00.000Z" },
      { id: "fin-zero", group: "financing", name: "Quitado" },
    ];
    const parcelaOld = entry("f-old-p", { kind: "financing", flow: "out", accountId: "fin-old", date: "2026-09-01", dueDate: "2026-10-01", amountBrl: 700 });
    expect(capitalSummary({ ...inputs, accounts: more, expenses: [...expenses, parcelaOld] }, PERIOD, TODAY)).toMatchObject({
      debt: 105000,
      debtAccounts: 2,
      nextInstallment: { dueDate: "2026-10-15", amountBrl: 10000 },
    });
  });
});

describe("the farm's grupos de despesa", () => {
  const MAQ = "6f1c2b8e-4a3d-4e5f-9b7a-1c2d3e4f5a6b";
  const ARRENDAMENTO = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  const VELHO = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
  const groups: ExpenseGroup[] = [
    { id: MAQ, name: "Máquinas e veículos", createdAt: "2026-08-01T12:00:00.000Z" },
    { id: ARRENDAMENTO, name: "Arrendamento", archivedAt: "2026-09-20T00:00:00.000Z", createdAt: "2026-07-01T12:00:00.000Z" },
    { id: VELHO, name: "Grupo velho", archivedAt: "2026-05-01T00:00:00.000Z", createdAt: "2026-01-01T12:00:00.000Z" },
  ];
  const farm: PlanInputs = {
    ...inputs,
    expenseGroups: groups,
    accounts: [...accounts, { id: "maq-diesel", group: MAQ, name: "Diesel" }],
    expenses: [
      ...expenses,
      entry("g-diesel", { category: MAQ, accountId: "maq-diesel", date: "2026-09-02", amountBrl: 700, paidAt: "2026-09-02", bankAccountId: "caixa" }),
      entry("g-arrend", { category: ARRENDAMENTO, date: "2026-08-10", amountBrl: 3000 }),
      // Its grupo is gone (an old snapshot): it still reads, as "Grupo removido".
      entry("g-gone", { category: "grupo-apagado", date: "2026-09-03", amountBrl: 50 }),
    ],
  };
  const despesas = (period = PERIOD) => planTree(farm, period, TODAY).find((i) => i.key === "despesas")!;

  it("writes and reads a farm grupo by its id, and any other key as a grupo", () => {
    const node: PlanNode = { type: "group", group: MAQ };
    expect(nodeParam(node)).toBe(`grupo:${MAQ}`);
    expect(parseNode(`grupo:${MAQ}`)).toEqual(node);
    expect(parseNode("grupo:grupo-apagado")).toEqual({ type: "group", group: "grupo-apagado" });
    // The old Extrato only knew the seven.
    expect(legacyNode({ grupo: MAQ })).toBeNull();
  });

  it("lists them after the seven, an archived one only while it has a line in the window, a removed one last", () => {
    const tree = despesas();
    expect(tree.children?.slice(7).map((i) => [i.key, i.label, i.amountBrl, i.archived])).toEqual([
      [`grupo:${ARRENDAMENTO}`, "Arrendamento", 3000, true],
      [`grupo:${MAQ}`, "Máquinas e veículos", 700, false],
      ["grupo:grupo-apagado", "Grupo removido", 50, false],
    ]);
    expect(tree.children?.reduce((sum, i) => sum + i.amountBrl, 0)).toBe(tree.amountBrl);
    expect(tree.children?.find((i) => i.key === `grupo:${MAQ}`)?.children?.map((i) => [i.label, i.amountBrl])).toEqual([
      ["Diesel", 700],
    ]);
    // In September Arrendamento has no line: it leaves the tree.
    expect(despesas({ start: "2026-09-01", end: "2026-09-30" }).children?.slice(7).map((i) => i.label)).toEqual([
      "Máquinas e veículos",
      "Grupo removido",
    ]);
  });

  it("titles a farm grupo by its name, a removed one Grupo removido, and puts its contas under it", () => {
    const summary = (node: PlanNode) => nodeSummary(node, farm, PERIOD, TODAY);
    expect(summary({ type: "group", group: MAQ })).toMatchObject({
      crumb: "Despesas",
      title: "Máquinas e veículos",
      pills: [{ text: "custo (COE)", tone: "muted" }],
    });
    expect(summary({ type: "account", id: "maq-diesel" })).toMatchObject({ crumb: "Despesas › Máquinas e veículos", title: "Diesel" });
    expect(summary({ type: "group", group: "grupo-apagado" })).toMatchObject({ crumb: "Despesas", title: "Grupo removido" });
    expect(nodeRows({ type: "group", group: "grupo-apagado" }, farm, PERIOD, TODAY).map((r) => [r.id, r.history])).toEqual([
      ["g-gone", "Grupo removido"],
    ]);
    // A key no line ever had: an empty pane, still titled.
    expect(nodeRows({ type: "group", group: "nunca" }, farm, PERIOD, TODAY)).toEqual([]);
    expect(summary({ type: "group", group: "nunca" })?.title).toBe("Grupo removido");
    expect(nodeRows({ type: "bank", id: "caixa" }, farm, PERIOD, TODAY).find((r) => r.id === "g-diesel")).toMatchObject({
      contra: "Diesel",
      contraGroup: "Despesas › Máquinas e veículos",
    });
  });

  it("starts Novo as a despesa of the farm grupo", () => {
    expect(entryInitialFor({ type: "group", group: MAQ }, farm.accounts)).toEqual({ kind: "expense", category: MAQ });
    expect(entryInitialFor({ type: "account", id: "maq-diesel" }, farm.accounts)).toEqual({
      kind: "expense",
      category: MAQ,
      accountId: "maq-diesel",
    });
  });
});
