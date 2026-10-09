/**
 * What a lançamento is and which way its money goes. `kind` says what the
 * money is; the direction derives from it, and from `flow` on the three kinds
 * outside the resultado (investimento, financiamento, sócios). Pure.
 */
import type {
  AccountGroup,
  BankAccountKind,
  CapitalGroup,
  EntryFlow,
  EntryKind,
  ExpenseCategory,
} from "@/lib/types";

/** The three kinds outside the resultado, in screen order. */
export const CAPITAL_GROUPS: readonly CapitalGroup[] = ["investment", "financing", "partners"];

/** Investimento, financiamento or sócios: a movimento, with a `flow`. */
export function isCapitalKind(kind: EntryKind): kind is CapitalGroup {
  return (CAPITAL_GROUPS as readonly EntryKind[]).includes(kind);
}

/** in: receita, rendimento, and a capital row whose flow is "in". Capital rows without flow are "out". */
export function entryFlow(e: { kind: EntryKind; flow?: EntryFlow | null }): EntryFlow {
  if (e.kind === "revenue" || e.kind === "yield") return "in";
  return isCapitalKind(e.kind) && e.flow === "in" ? "in" : "out";
}

export function isInflow(e: { kind: EntryKind; flow?: EntryFlow | null }): boolean {
  return entryFlow(e) === "in";
}

/** The COE takes only these. */
export function isCost(e: { kind: EntryKind }): boolean {
  return e.kind === "expense";
}

/** The receita takes only these. */
export function isRevenue(e: { kind: EntryKind }): boolean {
  return e.kind === "revenue";
}

/** Grupo of the plano a lançamento sits in; null for a rendimento, which has none. */
export function entryGroup(e: { kind: EntryKind; category?: ExpenseCategory }): AccountGroup | null {
  return e.category ?? null;
}

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  expense: "Despesa",
  revenue: "Receita",
  investment: "Investimento",
  financing: "Financiamento",
  partners: "Sócios",
  yield: "Rendimento",
};

/** The movimento of each capital kind, by direction. */
export const FLOW_LABEL: Record<CapitalGroup, Record<EntryFlow, string>> = {
  investment: { out: "Compra", in: "Venda do bem" },
  financing: { out: "Pagamento", in: "Liberação" },
  partners: { out: "Retirada", in: "Aporte" },
};

/**
 * Which conta bancária kinds may pay or receive a lançamento. A cartão pays a
 * despesa or the compra of an investimento, nothing else; an aplicação only
 * earns its rendimento (money reaches it and leaves it by transferência); a
 * conta corrente and the caixa take everything but a rendimento.
 */
export function mayPayFrom(bank: BankAccountKind, kind: EntryKind, flow?: EntryFlow | null): boolean {
  if (bank === "investment") return kind === "yield";
  if (kind === "yield") return false;
  if (bank === "card") return kind === "expense" || (kind === "investment" && entryFlow({ kind, flow }) === "out");
  return true;
}
