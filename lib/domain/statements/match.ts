/**
 * Conciliação suggestions: which MeuBov record a linha do extrato confirms.
 * Same side (saída ↔ despesa, compra, transferência out; entrada ↔ receita,
 * venda, transferência in), value equal to the centavo, not yet paired, of
 * this conta or of none, within ±5 days. Pure.
 */
import type { BankAccount, Expense, Movement, StatementLine, Transfer } from "@/lib/types";
import { daysBetween } from "@/lib/domain/dates";
import { effectiveDueDate } from "@/lib/domain/ledger";

export type CandidateKind = "expense" | "revenue" | "sale" | "purchase" | "transferOut" | "transferIn";

/** What POST /statement-lines/:id/match pairs a line with. */
export interface MatchTarget {
  kind: "expense" | "movement" | "transfer";
  id: string;
}

export interface Candidate {
  target: MatchTarget;
  kind: CandidateKind;
  /** Vencimento of a pending lançamento, payment day of a paid one, date of the rest. */
  date: string;
  /** Always positive. */
  amountBrl: number;
  /** Counterparty, or the other conta of a transferência. */
  name: string | null;
  /** A lançamento still waiting for payment. */
  pending: boolean;
  expense?: Expense;
  movement?: Movement;
  transfer?: Transfer;
}

export type Confidence = "high" | "medium";

export interface Suggestion {
  candidate: Candidate;
  confidence: Confidence;
  /** Days from the candidate's date to the line's (line − candidate). */
  dayDiff: number;
  sameName: boolean;
}

/** Days a candidate may sit from the line. */
export const MATCH_WINDOW_DAYS = 5;
/** Days within which a candidate may be "alta". */
const HIGH_WINDOW_DAYS = 2;

const OUTFLOW: ReadonlySet<CandidateKind> = new Set(["expense", "purchase", "transferOut"]);

/** True when the candidate moves money the same way as the line. */
export function sameSide(line: Pick<StatementLine, "amountBrl">, kind: CandidateKind): boolean {
  return line.amountBrl < 0 === OUTFLOW.has(kind);
}

const toCents = (value: number) => Math.round(Math.abs(value) * 100);

/** Lower case, no accents, split into words. */
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A word of 4+ letters of the name appears in the description. */
function nameInDescription(name: string | null, description: string): boolean {
  if (!name) return false;
  const inLine = new Set(words(description));
  return words(name).some((w) => w.length >= 4 && /[a-z]/.test(w) && inLine.has(w));
}

/**
 * What `pairedIds` holds for the record a line points at: the lançamento or
 * venda id, or `${transferId}:${accountId}` — a transferência has two sides
 * and pairs once per conta.
 */
export function pairKey(line: {
  bankAccountId: string;
  expenseId?: string | null;
  movementId?: string | null;
  transferId?: string | null;
}): string | undefined {
  if (line.transferId) return `${line.transferId}:${line.bankAccountId}`;
  return line.expenseId ?? line.movementId ?? undefined;
}

/**
 * Every record a line of `accountId` may confirm: lançamentos of this conta
 * or of none, vendas/compras likewise, and transferências in or out of it —
 * minus those already paired (`pairKey`). A lançamento of no conta paid on
 * or before the conta's opening date is inside its saldo inicial: left out.
 */
export function candidatesFor(
  accountId: string,
  inputs: { expenses: Expense[]; movements: Movement[]; transfers: Transfer[]; bankAccounts: BankAccount[] },
  pairedIds: ReadonlySet<string>
): Candidate[] {
  const ours = (id: string | undefined) => id === undefined || id === accountId;
  const openingDate = inputs.bankAccounts.find((a) => a.id === accountId)?.openingDate;
  const out: Candidate[] = [];
  for (const e of inputs.expenses) {
    if (pairedIds.has(e.id) || !ours(e.bankAccountId)) continue;
    if (e.bankAccountId === undefined && e.paidAt && openingDate && e.paidAt <= openingDate) continue;
    out.push({
      target: { kind: "expense", id: e.id },
      kind: e.kind === "revenue" ? "revenue" : "expense",
      date: e.paidAt ?? effectiveDueDate(e),
      amountBrl: e.amountBrl,
      name: e.counterparty ?? null,
      pending: e.paidAt === undefined,
      expense: e,
    });
  }
  for (const m of inputs.movements) {
    if (pairedIds.has(m.id) || !ours(m.bankAccountId) || m.amountBrl === undefined || m.type === "transfer") continue;
    const sale = m.type === "sale";
    out.push({
      target: { kind: "movement", id: m.id },
      kind: sale ? "sale" : "purchase",
      date: m.date,
      amountBrl: m.amountBrl,
      name: sale ? m.destination : m.origin,
      pending: false,
      movement: m,
    });
  }
  const nameOf = (id: string) => inputs.bankAccounts.find((a) => a.id === id)?.name ?? null;
  for (const t of inputs.transfers) {
    if (pairedIds.has(`${t.id}:${accountId}`)) continue;
    if (t.fromId === accountId || t.toId === accountId) {
      const outgoing = t.fromId === accountId;
      out.push({
        target: { kind: "transfer", id: t.id },
        kind: outgoing ? "transferOut" : "transferIn",
        date: t.date,
        amountBrl: t.amountBrl,
        name: nameOf(outgoing ? t.toId : t.fromId),
        pending: false,
        transfer: t,
      });
    }
  }
  return out;
}

/**
 * Suggestions for each pending line, best first. Alta when the date is within
 * 2 days and a word of the counterparty is in the description, or when it is
 * the only candidate within 2 days; média otherwise. A candidate already alta
 * for an earlier line (by date) is only média for the next ones.
 */
export function suggestMatches(lines: StatementLine[], candidates: Candidate[]): Map<string, Suggestion[]> {
  const result = new Map<string, Suggestion[]>();
  const highGiven = new Set<string>();
  // Bucketed by value, so a long extrato stays linear-ish.
  const byValue = new Map<number, Candidate[]>();
  for (const c of candidates) {
    const key = toCents(c.amountBrl);
    const bucket = byValue.get(key);
    if (bucket) bucket.push(c);
    else byValue.set(key, [c]);
  }
  const pending = lines
    .filter((l) => l.status === "pending")
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1));
  for (const line of pending) {
    const pool = (byValue.get(toCents(line.amountBrl)) ?? [])
      .filter((c) => sameSide(line, c.kind))
      .map((c) => ({ c, dayDiff: daysBetween(c.date, line.date) }))
      .filter(({ dayDiff }) => Math.abs(dayDiff) <= MATCH_WINDOW_DAYS);
    const near = pool.filter(({ dayDiff }) => Math.abs(dayDiff) <= HIGH_WINDOW_DAYS).length;
    const suggestions = pool
      .map(({ c, dayDiff }): Suggestion => {
        const sameName = nameInDescription(c.name, line.description);
        const high =
          Math.abs(dayDiff) <= HIGH_WINDOW_DAYS && (sameName || near === 1) && !highGiven.has(c.target.id);
        return { candidate: c, confidence: high ? "high" : "medium", dayDiff, sameName };
      })
      .sort(
        (a, b) =>
          Math.abs(a.dayDiff) - Math.abs(b.dayDiff) ||
          (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1)
      );
    for (const s of suggestions) if (s.confidence === "high") highGiven.add(s.candidate.target.id);
    if (suggestions.length > 0) result.set(line.id, suggestions);
  }
  return result;
}

/**
 * "Outro lançamento" search: records of the line's side worth `amountBrl`,
 * any date, closest to the line first.
 */
export function candidatesByValue(line: StatementLine, candidates: Candidate[], amountBrl: number): Candidate[] {
  return candidates
    .filter((c) => sameSide(line, c.kind) && toCents(c.amountBrl) === toCents(amountBrl))
    .sort((a, b) => Math.abs(daysBetween(a.date, line.date)) - Math.abs(daysBetween(b.date, line.date)));
}

/** "mesmo valor, mesma data, mesmo favorecido" · "mesmo valor, 3 dias antes do vencimento". */
export function suggestionReason(s: Suggestion): string {
  const days = Math.abs(s.dayDiff);
  const when =
    days === 0
      ? "mesma data"
      : `${s.candidate.pending ? "pago " : ""}${days} ${days === 1 ? "dia" : "dias"} ${s.dayDiff < 0 ? "antes" : "depois"} ${s.candidate.pending ? "do vencimento" : "da data"}`;
  return ["mesmo valor", when, s.sameName ? "mesmo favorecido" : null].filter(Boolean).join(", ");
}
