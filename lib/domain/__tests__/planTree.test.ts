import { describe, expect, it } from "vitest";
import type { Account, BankAccount, Expense, GroupKind, Movement, PlanGroup, Transfer } from "@/lib/types";
import { formatCurrency } from "@/lib/domain/format";
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
// archived caixa; the eleven grupos a farm starts with, contas in every tipo;
// lançamentos of every kind.
const TODAY = "2026-09-24";
const PERIOD = { start: "2026-07-01", end: "2026-09-30" };

const group = (id: string, kind: GroupKind, name: string, archivedAt?: string): PlanGroup => ({
  id,
  kind,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...(archivedAt && { archivedAt }),
});
const planGroups: PlanGroup[] = [
  group("receitas", "revenue", "Receitas"),
  group("nutrition", "expense", "Nutrição"),
  group("pasture", "expense", "Pastagem"),
  group("labor", "expense", "Mão de obra"),
  group("health", "expense", "Sanidade"),
  group("breeding", "expense", "Reprodução"),
  group("admin", "expense", "Administrativo"),
  group("other", "expense", "Outros"),
  group("investimentos", "investment", "Investimentos"),
  group("financiamentos", "financing", "Financiamentos"),
  group("socios", "partners", "Sócios"),
];

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
  { id: "inv-maq", group: "investimentos", name: "Máquinas e implementos" },
  { id: "inv-benf", group: "investimentos", name: "Benfeitorias" },
  { id: "fin-custeio", group: "financiamentos", name: "Custeio Sicredi" },
  { id: "fin-consorcio", group: "financiamentos", name: "Consórcio trator", openingBalanceBrl: 100000, openingDate: "2026-07-31" },
  { id: "soc-lucro", group: "socios", name: "Distribuição de lucro" },
  { id: "nut-sal", group: "nutrition", name: "Sal mineral" },
  { id: "hea-vac", group: "health", name: "Vacinas" },
  { id: "adm-tel", group: "admin", name: "Telefone", archivedAt: "2026-09-01T00:00:00.000Z" },
  { id: "rev-aluguel", group: "receitas", name: "Aluguel de pasto" },
  { id: "rev-esterco", group: "receitas", name: "Venda de esterco", archivedAt: "2026-09-01T00:00:00.000Z" },
];
const account = (id: string): Account => accounts.find((a) => a.id === id)!;

const entry = (id: string, patch: Partial<Expense>): Expense => ({
  id,
  kind: "expense",
  date: "2026-09-01",
  // The grupo of its conta, as the form writes it.
  category: accounts.find((a) => a.id === patch.accountId)?.group ?? "other",
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
  entry("y-1", { kind: "yield", category: undefined, date: "2026-09-01", amountBrl: 250, paidAt: "2026-09-01", bankAccountId: "rdc" }),
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
  lots: [{ id: "lot-1", name: "Lote do Rio" }],
  bankAccounts: [CARTAO, BB, SICREDI, CAIXA, RDC, OLD],
  transfers: [T_APL],
  planGroups,
};

describe("nodeParam and parseNode", () => {
  const nodes: PlanNode[] = [
    { type: "all" },
    { type: "banks" },
    { type: "bank", id: "sicredi" },
    { type: "kind", kind: "investment" },
    { type: "kind", kind: "financing" },
    { type: "kind", kind: "partners" },
    { type: "kind", kind: "expense" },
    { type: "kind", kind: "revenue" },
    { type: "group", id: "nutrition" },
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

  it("reads back every nó, every grupo of every tipo included", () => {
    const grupos: PlanNode[] = planGroups.map((g) => ({ type: "group", id: g.id }));
    for (const node of [...nodes, ...grupos]) expect(parseNode(nodeParam(node))).toEqual(node);
  });

  it("reads an absent, empty, unknown or malformed value as null", () => {
    for (const value of [null, undefined, "", "nope", "Bancos", "banco", "banco:", "conta:", "grupo:", "expense"]) {
      expect(parseNode(value)).toBeNull();
    }
  });

  it("still reads a conta or a grupo that was deleted; nodeSummary is what finds it gone", () => {
    expect(parseNode("conta:deleted")).toEqual({ type: "account", id: "deleted" });
    expect(parseNode("grupo:grupo-apagado")).toEqual({ type: "group", id: "grupo-apagado" });
  });
});

describe("legacyNode", () => {
  it("turns the old Extrato filters into a nó", () => {
    expect(legacyNode({ conta: "nut-sal" })).toEqual({ type: "account", id: "nut-sal" });
    expect(legacyNode({ tipo: "expense" })).toEqual({ type: "kind", kind: "expense" });
    expect(legacyNode({ tipo: "revenue" })).toEqual({ type: "kind", kind: "revenue" });
    expect(legacyNode({ tipo: "sale" })).toEqual({ type: "auto", which: "sales" });
    expect(legacyNode({ tipo: "purchase" })).toEqual({ type: "auto", which: "purchases" });
  });

  it("prefers conta over tipo, and ignores the old grupo keys, which name nothing now", () => {
    expect(legacyNode({ conta: "nut-sal", grupo: "admin", tipo: "sale" })).toEqual({ type: "account", id: "nut-sal" });
    expect(legacyNode({ grupo: "admin", tipo: "sale" })).toEqual({ type: "auto", which: "sales" });
    for (const grupo of ["nutrition", "revenue", "capital"]) expect(legacyNode({ grupo })).toBeNull();
  });

  it("is null when no old filter was set or the values are unknown, a tratamento's tipo included", () => {
    expect(legacyNode({})).toBeNull();
    expect(legacyNode({ tipo: null, grupo: null, conta: null })).toBeNull();
    expect(legacyNode({ conta: "", grupo: "nope", tipo: "toString" })).toBeNull();
    expect(legacyNode({ tipo: "treatment" })).toBeNull();
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

  it("lists Bancos e caixa and the five tipos in order, each saying what its figure is", () => {
    expect(tree.map((i) => [i.key, i.label, i.tag, i.amountBrl])).toEqual([
      ["bancos", "Bancos e caixa", "saldo", 57650],
      ["investimentos", "Investimentos", "no período", 35500],
      ["financiamentos", "Financiamentos", "devedor", 105000],
      ["socios", "Sócios", "retirado", 5000],
      ["despesas", "Despesas", "custo (COE)", 1590],
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

  it("lists a tipo with a single grupo flat: its contas, with Compra de gado locked last", () => {
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

  it("opens Despesas into its seven grupos, alphabetical, no tratamento under Sanidade", () => {
    const grupos = top("despesas").children ?? [];
    expect(grupos.map((i) => i.key)).toEqual(
      ["admin", "labor", "nutrition", "other", "pasture", "breeding", "health"].map((c) => `grupo:${c}`)
    );
    const grupo = (c: string) => grupos.find((i) => i.key === `grupo:${c}`)!;
    expect(["nutrition", "health", "admin", "pasture"].map((c) => grupo(c).amountBrl)).toEqual([1200, 300, 90, 0]);
    expect(figures(grupo("health").children)).toEqual([["Vacinas", 300]]);
    expect(grupo("pasture").children).toEqual([]);
  });

  it("opens Receitas, a single grupo, with Venda de gado locked first and then its contas", () => {
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
    expect(["i-historico", "i-trator", "e-diesel", "m-sale"].map((id) => [line(id).history, line(id).detail])).toEqual([
      ["Carreta agrícola 4 t", "Agropecuária Sertão · entrega na sede · NF 11.640"],
      ["Agro Máquinas Uberaba", "Trator MF 4275 · NF 2.871"],
      ["Diesel do trator", "NF 77"],
      ["Frigorífico Minerva", "manejo · 1 animal"],
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
    const others: PlanNode[] = [{ type: "kind", kind: "investment" }, { type: "kind", kind: "revenue" }];
    for (const node of others) expect(ids(rows(node))).not.toContain("y-1");
  });

  it("shows a financiamento by competência, the latest vencimento first, with the saldo devedor after each paid line", () => {
    expect(rows({ type: "account", id: "fin-custeio" }).map((r) => [r.id, r.date, r.amountBrl, r.balance, r.contra])).toEqual([
      ["f-p3", "2026-07-15", -10000, null, null],
      ["f-p2", "2026-07-15", -10000, 10000, "Sicredi"],
      ["f-p1", "2026-07-15", -10000, 20000, "Sicredi"],
      ["f-lib", "2026-07-15", 30000, 30000, "Sicredi"],
    ]);
    const kind = rows({ type: "kind", kind: "financing" });
    expect(ids(kind)).toEqual(["f-lib-pend", "f-c1", "f-old", "f-p3", "f-p2", "f-p1", "f-lib"]);
    expect(kind.every((r) => r.balance === null)).toBe(true);
    expect(rows({ type: "group", id: "financiamentos" })).toEqual(kind);
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
    expect(rows({ type: "kind", kind: "investment" }).map((r) => [r.id, r.amountBrl, r.contra, r.contraGroup])).toEqual([
      ["i-cerca", -2000, null, null],
      ["i-rocadeira", -18500, "Sicredi", "Bancos e caixa"],
      ["i-venda", 5000, "Banco do Brasil", "Bancos e caixa"],
      ["m-buy", -20000, "Banco do Brasil", "Bancos e caixa"],
    ]);
    expect(ids(rows({ type: "kind", kind: "expense" }))).toEqual(["e-vac", "e-sal", "e-tel"]);
    expect(ids(rows({ type: "group", id: "health" }))).toEqual(["e-vac"]);
    expect(ids(rows({ type: "kind", kind: "revenue" }))).toEqual(["m-sale", "r-aluguel"]);
    expect(ids(rows({ type: "group", id: "receitas" }))).toEqual(["r-aluguel"]);
    expect(ids(rows({ type: "kind", kind: "partners" }))).toEqual(["p-ret", "p-aporte"]);
    expect(ids(rows({ type: "auto", which: "sales" }))).toEqual(["m-sale"]);
    expect(ids(rows({ type: "auto", which: "purchases" }))).toEqual(["m-buy"]);
    expect(ids(rows({ type: "account", id: "inv-maq" }))).toEqual(["i-rocadeira", "i-venda"]);
  });

  it("puts no rendimento and no line of the manejos in a grupo, whatever its id", () => {
    for (const id of ["capital", "revenue"]) expect(rows({ type: "group", id })).toEqual([]);
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
    const financing = nodeRows({ type: "kind", kind: "financing" }, inputs, PERIOD, TODAY);
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
      ["Despesas (COE)", 1590, "despesas lançadas", "ink"],
      ["Resultado", 50410, "receitas − custo", "healthy"],
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
    expect(summary({ type: "kind", kind: "investment" })).toMatchObject({
      crumb: null,
      title: "Investimentos",
      pills: [
        { text: "investimento", tone: "scheduled" },
        { text: "fora do custo (COE)", tone: "muted" },
      ],
    });
    expect(strip({ type: "kind", kind: "investment" })).toEqual([
      ["Investido no período", 35500, "3 compras · pela data da compra", "ink"],
      ["Pago", 38500, "saiu do caixa", "ink"],
      ["A pagar", 2000, "1 lançamento · próxima 10/10", "attention"],
      ["Desde o início", 42500, "tudo o que entrou no grupo", "ink"],
    ]);
    // Investimentos has a single grupo: the crumb names the tipo only.
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
    expect(summary({ type: "kind", kind: "financing" })?.figures[0].amountBrl).toBe(105000);
    expect(summary({ type: "kind", kind: "financing" })?.paidShare).toBeCloseTo(25000 / 130000);
    expect(summary({ type: "group", id: "financiamentos" })?.figures[0].amountBrl).toBe(105000);
    expect(summary({ type: "kind", kind: "investment" })?.paidShare).toBeUndefined();
  });

  it("shows what the sócios took out, put in and the net", () => {
    expect(strip({ type: "kind", kind: "partners" })).toEqual([
      ["Retirado", 6000, "1 retirada", "ink"],
      ["Aportado", 1000, "1 aporte", "healthy"],
      ["Líquido", 5000, "retirado − aportado", "ink"],
      ["A pagar", 0, "nada a pagar", "ink"],
    ]);
  });

  it("shows a grupo de despesa with its share of the COE", () => {
    expect(summary({ type: "group", id: "health" })).toMatchObject({
      crumb: "Despesas",
      title: "Sanidade",
      pills: [{ text: "custo (COE)", tone: "muted" }],
    });
    expect(strip({ type: "group", id: "health" })).toEqual([
      ["No período", 300, "1 lançamento", "ink"],
      ["Pago", 0, "saiu do caixa", "ink"],
      ["A pagar", 300, "1 lançamento · próxima 15/10", "attention"],
      ["% do COE", "19 %", `de ${formatCurrency(1590)}`, "ink"],
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
  const initial = (node: PlanNode) => entryInitialFor(node, accounts, inputs.bankAccounts, planGroups);

  it("starts Novo with nothing on todos, Bancos e caixa and the lines of the manejos", () => {
    expect(initial({ type: "all" })).toEqual({});
    expect(initial({ type: "banks" })).toEqual({});
    expect(initial({ type: "auto", which: "sales" })).toEqual({});
  });

  it("starts on the picked conta bancária, a rendimento on an aplicação", () => {
    expect(initial({ type: "bank", id: "sicredi" })).toEqual({ bankAccountId: "sicredi" });
    expect(initial({ type: "bank", id: "rdc" })).toEqual({ kind: "yield", bankAccountId: "rdc" });
  });

  it("starts with the tipo, the grupo and the conta", () => {
    expect(initial({ type: "kind", kind: "financing" })).toEqual({ kind: "financing", flow: "out" });
    expect(initial({ type: "kind", kind: "expense" })).toEqual({ kind: "expense" });
    expect(initial({ type: "kind", kind: "revenue" })).toEqual({ kind: "revenue" });
    expect(initial({ type: "group", id: "breeding" })).toEqual({ kind: "expense", category: "breeding" });
    expect(initial({ type: "group", id: "socios" })).toEqual({ kind: "partners", category: "socios" });
    expect(initial({ type: "account", id: "nut-sal" })).toEqual({ kind: "expense", category: "nutrition", accountId: "nut-sal" });
    expect(initial({ type: "account", id: "rev-aluguel" })).toEqual({ kind: "revenue", category: "receitas", accountId: "rev-aluguel" });
    expect(initial({ type: "account", id: "soc-lucro" })).toEqual({ kind: "partners", category: "socios", accountId: "soc-lucro" });
  });

  it("starts with nothing on a conta or grupo that is gone", () => {
    expect(initial({ type: "account", id: "gone" })).toEqual({});
    expect(initial({ type: "group", id: "grupo-apagado" })).toEqual({});
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
      { id: "fin-old", group: "financiamentos", name: "Antigo", openingBalanceBrl: 5000, openingDate: "2026-01-01", archivedAt: "2026-02-01T00:00:00.000Z" },
      { id: "fin-zero", group: "financiamentos", name: "Quitado" },
    ];
    const parcelaOld = entry("f-old-p", { kind: "financing", flow: "out", accountId: "fin-old", date: "2026-09-01", dueDate: "2026-10-01", amountBrl: 700 });
    expect(capitalSummary({ ...inputs, accounts: more, expenses: [...expenses, parcelaOld] }, PERIOD, TODAY)).toMatchObject({
      debt: 105000,
      debtAccounts: 2,
      nextInstallment: { dueDate: "2026-10-15", amountBrl: 10000 },
    });
  });
});


describe("grupos of every tipo", () => {
  const ARRENDAMENTOS = "6f1c2b8e-4a3d-4e5f-9b7a-1c2d3e4f5a6b";
  const ARRENDAMENTO = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  const VELHO = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
  const PRONAF = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";
  const farm: PlanInputs = {
    ...inputs,
    planGroups: [
      ...planGroups,
      group(ARRENDAMENTOS, "revenue", "Arrendamentos"),
      group(ARRENDAMENTO, "expense", "Arrendamento", "2026-09-20T00:00:00.000Z"),
      group(VELHO, "expense", "Grupo velho", "2026-05-01T00:00:00.000Z"),
      group(PRONAF, "financing", "Pronaf"),
    ],
    accounts: [...accounts, { id: "arr-vizinho", group: ARRENDAMENTOS, name: "Pasto do vizinho" }],
    expenses: [
      ...expenses,
      entry("r-vizinho", { kind: "revenue", category: ARRENDAMENTOS, accountId: "arr-vizinho", date: "2026-09-02", amountBrl: 700, paidAt: "2026-09-02", bankAccountId: "caixa" }),
      entry("g-arrend", { category: ARRENDAMENTO, date: "2026-08-10", amountBrl: 3000 }),
      // Its grupo is gone (an old snapshot): it still reads, as "Grupo removido".
      entry("g-gone", { category: "grupo-apagado", date: "2026-09-03", amountBrl: 50 }),
    ],
  };
  const top = (key: string, period = PERIOD) => planTree(farm, period, TODAY).find((i) => i.key === key)!;
  const summary = (node: PlanNode) => nodeSummary(node, farm, PERIOD, TODAY);

  it("lists the grupo items once a tipo has two, each opening into its contas", () => {
    const receitas = top("receitas");
    expect(receitas.children?.map((i) => [i.key, i.label, i.amountBrl])).toEqual([
      ["venda-de-gado", "Venda de gado", 50000],
      [`grupo:${ARRENDAMENTOS}`, "Arrendamentos", 700],
      ["grupo:receitas", "Receitas", 2000],
    ]);
    expect(receitas.children?.[1].children?.map((i) => [i.key, i.amountBrl])).toEqual([["conta:arr-vizinho", 700]]);
    expect(receitas.amountBrl).toBe(52700);
    // The tipo's pane holds the same rows however the tree draws it.
    expect(nodeRows({ type: "kind", kind: "revenue" }, farm, PERIOD, TODAY).map((r) => r.id)).toEqual(["m-sale", "r-aluguel", "r-vizinho"]);
  });

  it("gives a financiamento grupo the saldo devedor of its contas", () => {
    expect(top("financiamentos").children?.map((i) => [i.label, i.amountBrl, i.children?.length])).toEqual([
      ["Financiamentos", 105000, 2],
      ["Pronaf", 0, 0],
    ]);
  });

  it("keeps an archived financiamento grupo while one of its contas still owes", () => {
    const ANTIGO = "3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a";
    const owing: PlanInputs = {
      ...farm,
      planGroups: [...farm.planGroups, group(ANTIGO, "financing", "Banco antigo", "2026-01-01T00:00:00.000Z")],
      accounts: [
        ...farm.accounts,
        { id: "fin-antigo", group: ANTIGO, name: "Custeio 2024", openingBalanceBrl: 8000, openingDate: "2025-12-31" },
      ],
    };
    const fin = planTree(owing, PERIOD, TODAY).find((i) => i.key === "financiamentos")!;
    expect(fin.children?.map((i) => [i.label, i.amountBrl, i.archived])).toEqual([
      ["Banco antigo", 8000, true],
      ["Financiamentos", 105000, false],
      ["Pronaf", 0, false],
    ]);
    // The tipo's devedor is the sum of what it lists.
    expect(fin.amountBrl).toBe(113000);
    expect(nodeSummary({ type: "account", id: "fin-antigo" }, owing, PERIOD, TODAY)?.crumb).toBe("Financiamentos › Banco antigo");
  });

  it("lists an archived grupo only while it has a line in the window, a removed one last", () => {
    expect(top("despesas").children?.map((i) => [i.label, i.amountBrl, i.archived])).toEqual([
      ["Administrativo", 90, false],
      ["Arrendamento", 3000, true],
      ["Mão de obra", 0, false],
      ["Nutrição", 1200, false],
      ["Outros", 0, false],
      ["Pastagem", 0, false],
      ["Reprodução", 0, false],
      ["Sanidade", 300, false],
      ["Grupo removido", 50, false],
    ]);
    expect(top("despesas").children?.reduce((sum, i) => sum + i.amountBrl, 0)).toBe(top("despesas").amountBrl);
    // In September Arrendamento has no line: it leaves the tree. Grupo velho never shows.
    const september = top("despesas", { start: "2026-09-01", end: "2026-09-30" }).children?.map((i) => i.label);
    expect(september).not.toContain("Arrendamento");
    expect(JSON.stringify(planTree(farm, PERIOD, TODAY))).not.toContain(VELHO);
  });

  it("names the grupo in a conta's crumb only when the tipo shows more than one", () => {
    expect(summary({ type: "account", id: "rev-aluguel" })).toMatchObject({ crumb: "Receitas › Receitas", title: "Aluguel de pasto" });
    expect(nodeSummary({ type: "account", id: "rev-aluguel" }, inputs, PERIOD, TODAY)?.crumb).toBe("Receitas");
    expect(summary({ type: "account", id: "arr-vizinho" })?.crumb).toBe("Receitas › Arrendamentos");
  });

  it("titles a grupo by its name under its tipo, a removed one Grupo removido", () => {
    expect(summary({ type: "group", id: ARRENDAMENTOS })).toMatchObject({
      crumb: "Receitas",
      title: "Arrendamentos",
      pills: [{ text: "receita", tone: "muted" }],
    });
    expect(summary({ type: "group", id: "grupo-apagado" })).toMatchObject({ crumb: "Despesas", title: "Grupo removido" });
    expect(nodeRows({ type: "group", id: "grupo-apagado" }, farm, PERIOD, TODAY).map((r) => [r.id, r.history])).toEqual([
      ["g-gone", "Grupo removido"],
    ]);
    // An id no line ever had: an empty pane, still titled.
    expect(nodeRows({ type: "group", id: "nunca" }, farm, PERIOD, TODAY)).toEqual([]);
    expect(summary({ type: "group", id: "nunca" })?.title).toBe("Grupo removido");
  });

  it("starts Novo in the grupo, with its tipo", () => {
    expect(entryInitialFor({ type: "group", id: ARRENDAMENTOS }, farm.accounts, [], farm.planGroups)).toEqual({
      kind: "revenue",
      category: ARRENDAMENTOS,
    });
    expect(entryInitialFor({ type: "account", id: "arr-vizinho" }, farm.accounts, [], farm.planGroups)).toEqual({
      kind: "revenue",
      category: ARRENDAMENTOS,
      accountId: "arr-vizinho",
    });
  });
});

describe("a tratamento with cost", () => {
  // The store's data has the tratamentos; handed in whole, they still make no line and no cost.
  const withTreatments = {
    ...inputs,
    treatments: [makeTreatment({ animalEarTag: "BR-001", date: "2026-09-08", status: "done", costBrl: 5 })],
  };

  it("makes no line in any nó and leaves the COE to the despesas alone", () => {
    expect(planTree(withTreatments, PERIOD, TODAY)).toEqual(planTree(inputs, PERIOD, TODAY));
    expect(nodeRows({ type: "all" }, withTreatments, PERIOD, TODAY)).toEqual(nodeRows({ type: "all" }, inputs, PERIOD, TODAY));
    const despesas = expenses.filter((e) => e.kind === "expense" && e.date >= PERIOD.start).reduce((sum, e) => sum + e.amountBrl, 0);
    expect(nodeSummary({ type: "all" }, withTreatments, PERIOD, TODAY)?.figures[1].amountBrl).toBe(despesas);
  });
});
