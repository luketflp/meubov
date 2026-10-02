/**
 * What the URL's query means to Lançamentos: the nó `conta` picks, and the old
 * Extrato's query (its links and bookmarks) turned into this page's. Pure: the
 * page, the redirect and the tests call it.
 */
import type { Period } from "@/lib/domain/period";
import {
  legacyNode,
  nodeParam,
  nodeSummary,
  parseNode,
  type NodeSummary,
  type PlanInputs,
  type PlanNode,
} from "@/lib/domain/planTree";

const ALL: PlanNode = { type: "all" };
/** The old filters that keep their key and value. */
const KEPT = ["de", "ate", "q", "lote"] as const;
/** The old status choices that meant a pending lançamento. */
const PENDING = ["payable", "receivable", "overdue"];

export interface ResolvedNode {
  /** The nó of the URL; null when it is absent, malformed or gone. */
  picked: PlanNode | null;
  /** What the pane shows: the nó picked, else "todos". */
  node: PlanNode;
  summary: NodeSummary;
}

/** The nó of `conta`. One that is malformed or no longer exists reads as none, and the pane shows "todos". */
export function resolveNode(param: string | null, inputs: PlanInputs, period: Period, todayIso: string): ResolvedNode {
  const parsed = parseNode(param);
  const summary = parsed ? nodeSummary(parsed, inputs, period, todayIso) : null;
  if (parsed && summary) return { picked: parsed, node: parsed, summary };
  // "todos" always exists.
  return { picked: null, node: ALL, summary: nodeSummary(ALL, inputs, period, todayIso)! };
}

/**
 * The old Extrato's query as this page's: the window, the search and the lote
 * stay; a pending status ("a pagar", "a receber", "vencidas") becomes
 * "pendentes" and any other goes; tipo, grupo and conta become the nó.
 */
export function legacySearch(query: Record<string, string | string[] | undefined>): string {
  // A repeated key keeps its first value.
  const one = (key: string): string | null => [query[key]].flat()[0] ?? null;
  const next = new URLSearchParams();
  for (const key of KEPT) {
    const value = one(key);
    if (value) next.set(key, value);
  }
  const node = legacyNode({ tipo: one("tipo"), grupo: one("grupo"), conta: one("conta") });
  if (node) next.set("conta", nodeParam(node));
  if (PENDING.includes(one("status") ?? "")) next.set("status", "pendentes");
  return next.toString();
}
