"use client";

/**
 * The plano de contas, the left column of Lançamentos: a search by name,
 * "Todos os lançamentos" and the six groups with their figure for the window.
 * Each row is a link that picks its nó (the URL's `conta`); the groups and the
 * grupos of Despesas open and close in place, the path to the picked nó
 * starting open. "+" opens Nova conta and the gear goes to Configurações.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  CreditCard,
  HandCoins,
  Landmark,
  ListTree,
  Lock,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  Settings2,
  Tractor,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { BankAccountKind } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import type { Period } from "@/lib/domain/period";
import { fold, nodeParam, type PlanNode, type TreeItem } from "@/lib/domain/planTree";
import { NewAccountDialog } from "@/components/finance/plano/NewAccountDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The six top groups, by their `conta` value. */
const GROUP_ICON: Record<string, LucideIcon> = {
  bancos: Landmark,
  investimentos: Tractor,
  financiamentos: HandCoins,
  socios: Users,
  despesas: Receipt,
  receitas: Banknote,
};
const BANK_ICON: Record<BankAccountKind, LucideIcon> = {
  checking: Landmark,
  cash: Wallet,
  card: CreditCard,
  investment: PiggyBank,
};
/** 6 px, then 18 px a level: group › grupo › conta. */
const INDENT = ["pl-1.5", "pl-6", "pl-[42px]"];
const ALL: PlanNode = { type: "all" };
const ALL_KEY = nodeParam(ALL);
const SELECTED = "bg-brand-soft font-medium ring-1 ring-brand/30 ring-inset";

/** The items whose name has `term`, with the groups above them; a match keeps all it holds. */
function filterTree(items: TreeItem[], term: string): TreeItem[] {
  return items.flatMap((item) => {
    if (fold(item.label).includes(term)) return [item];
    const children = item.children ? filterTree(item.children, term) : [];
    return children.length > 0 ? [{ ...item, children }] : [];
  });
}

/** Keys of the items above `key`, top first; null when it is not in the tree. */
function pathTo(items: TreeItem[], key: string): string[] | null {
  for (const item of items) {
    if (item.key === key) return [];
    const below = item.children ? pathTo(item.children, key) : null;
    if (below) return [item.key, ...below];
  }
  return null;
}

/** "84.312", "−3.240"; "—" for zero. */
function figure(value: number): string {
  if (Math.round(value) === 0) return "—";
  return `${value < 0 ? "−" : ""}${formatNumber(Math.abs(value))}`;
}

function LockMark() {
  return (
    <span title="do manejo, automático" className="inline-flex shrink-0 text-ink-soft">
      <Lock className="size-3" aria-hidden />
      <span className="sr-only">do manejo, automático</span>
    </span>
  );
}

interface TreeRowProps {
  item: TreeItem;
  depth: number;
  expanded: boolean;
  selected: boolean;
  href: string;
  onToggle(): void;
  onPick(): void;
}

function TreeRow({ item, depth, expanded, selected, href, onToggle, onPick }: TreeRowProps) {
  const top = depth === 0;
  const Icon = top ? GROUP_ICON[item.key] : item.bankKind ? BANK_ICON[item.bankKind] : undefined;
  return (
    <div className={cn("flex items-center rounded-lg", INDENT[Math.min(depth, 2)], selected && SELECTED)}>
      {item.children ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Fechar" : "Abrir"} ${item.label}`}
          disabled={item.children.length === 0}
          onClick={onToggle}
          className="flex h-11 w-6 shrink-0 items-center justify-center rounded-md text-ink-soft hover:text-ink disabled:opacity-60 md:h-[30px] md:w-5"
        >
          {expanded ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
        </button>
      ) : (
        <span aria-hidden className="w-6 shrink-0 md:w-5" />
      )}
      <Link
        href={href}
        onClick={onPick}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex min-h-11 min-w-0 flex-1 items-center gap-1.5 pr-2 text-[15px] md:min-h-[30px] md:text-sm",
          item.archived ? "text-ink-soft" : "text-ink",
          top && "font-semibold"
        )}
      >
        {Icon ? (
          <Icon className={cn("size-3.5 shrink-0", top || selected ? "text-brand" : "text-ink-soft")} aria-hidden />
        ) : null}
        <span className="truncate">{item.label}</span>
        {item.locked ? <LockMark /> : null}
        {item.tag ? (
          <span className="shrink-0 text-[10px] font-medium tracking-wide whitespace-nowrap text-ink-soft uppercase">
            {item.tag}
          </span>
        ) : null}
        <span
          className={cn(
            "ml-auto pl-2 font-mono text-xs whitespace-nowrap tabular-nums",
            Math.round(item.amountBrl) === 0 ? "text-ink-soft" : "text-ink",
            top && "font-medium"
          )}
        >
          {figure(item.amountBrl)}
        </span>
      </Link>
    </div>
  );
}

interface PlanTreeNavProps {
  tree: TreeItem[];
  /** Rows of "Todos os lançamentos" in the window. */
  allCount: number;
  /** `nodeParam` of the nó on screen. */
  selectedKey: string;
  hrefFor(node: PlanNode): string;
  period: Period;
  canEdit: boolean;
  className?: string;
}

export function PlanTreeNav({ tree, allCount, selectedKey, hrefFor, period, canEdit, className }: PlanTreeNavProps) {
  // Every top group starts open, plus the grupo that holds the picked nó.
  const [open, setOpen] = useState(
    () => new Set([...tree.map((item) => item.key), ...(pathTo(tree, selectedKey) ?? [])])
  );
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const term = fold(query.trim());
  const items = term ? filterTree(tree, term) : tree;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const reveal = (key: string) => setOpen((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  const list = (level: TreeItem[], depth: number): ReactNode => (
    <ul className="flex flex-col gap-px">
      {level.map((item) => {
        // A search opens everything it kept.
        const expanded = item.children !== undefined && (term !== "" || open.has(item.key));
        return (
          <li
            key={item.key}
            className={cn(depth === 0 && "mt-1.5 border-t border-hairline pt-1.5 first:mt-0 first:border-t-0 first:pt-0")}
          >
            <TreeRow
              item={item}
              depth={depth}
              expanded={expanded}
              selected={item.key === selectedKey}
              href={hrefFor(item.node)}
              onToggle={() => toggle(item.key)}
              onPick={() => reveal(item.key)}
            />
            {expanded && item.children?.length ? list(item.children, depth + 1) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <section
      aria-labelledby="plan-tree-title"
      className={cn("overflow-hidden rounded-lg border border-hairline bg-panel", className)}
    >
      <header className="hidden items-center justify-between gap-2 border-b border-hairline py-2 pr-2 pl-4 md:flex">
        <h2 id="plan-tree-title" className="font-heading text-base font-semibold text-ink">
          Plano de contas
        </h2>
        {canEdit ? (
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Nova conta"
              title="Nova conta"
              className="text-ink-soft"
              onClick={() => setCreating(true)}
            >
              <Plus aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="text-ink-soft" asChild>
              <Link href="/settings/plano-de-contas" aria-label="Gerenciar o plano de contas" title="Gerenciar o plano de contas">
                <Settings2 aria-hidden />
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-2 p-1.5 md:px-2 md:pt-2.5 md:pb-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-soft"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar conta"
            aria-label="Buscar conta"
            className="h-11 pl-8 md:h-8"
          />
        </div>
        <div>
          <Link
            href={hrefFor(ALL)}
            aria-current={selectedKey === ALL_KEY ? "true" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-1.5 rounded-lg pr-2 pl-1.5 text-[15px] text-ink md:min-h-[30px] md:text-sm",
              selectedKey === ALL_KEY && SELECTED
            )}
          >
            <ListTree className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
            Todos os lançamentos
            <span className="ml-auto font-mono text-xs text-ink-soft tabular-nums">{formatNumber(allCount)}</span>
          </Link>
          <div aria-hidden className="mx-1 my-1.5 h-px bg-hairline" />
          {items.length > 0 ? (
            list(items, 0)
          ) : (
            <p className="px-2 py-3 text-sm text-ink-soft">Nenhuma conta com esse nome.</p>
          )}
        </div>
      </div>

      <p className="hidden border-t border-hairline bg-surface px-4 py-2 text-[11px] leading-4 text-ink-soft md:block">
        Valores de {formatDate(period.start)} a {formatDate(period.end)} ·{" "}
        <Lock className="inline size-3 align-[-2px]" aria-hidden /> entra sozinho pelos manejos
      </p>

      {creating ? <NewAccountDialog open onOpenChange={setCreating} /> : null}
    </section>
  );
}
