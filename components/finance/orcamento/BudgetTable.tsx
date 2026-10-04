"use client";

/**
 * "Por grupo" on md+: a row per grupo with its orçado for the whole safra,
 * the realizado to date, the % usado against the orçado to date (bar and
 * number), where the safra is heading and the month by month; a grupo opens
 * to its contas, and the pencil (Financeiro edit only) edits its orçamento.
 * A Total row (the grupos with a budget) and the legend close it.
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import type { ExpenseCategory } from "@/lib/types";
import type { BudgetLine, BudgetTone, BudgetView } from "@/lib/domain/budget";
import { MONTH_ABBREV } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { BudgetMeter, TONE_BAR, TONE_TEXT, reais, usedText } from "@/components/finance/orcamento/BudgetMeter";
import { Sparkline } from "@/components/finance/orcamento/Sparkline";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const HEAD = "h-10 px-2 text-[11px] font-medium tracking-wide whitespace-nowrap text-ink-soft uppercase";

const LEGEND: readonly [BudgetTone, string][] = [
  ["brand", "até 90 %"],
  ["attention", "91 a 100 %"],
  ["overdue", "acima de 100 %"],
];

/** What a row shows; the Total row has no line of its own. */
type Figures = Pick<BudgetLine, "hasBudget" | "budgetedTotal" | "realizedToDate" | "usedPct" | "tone" | "forecast">;

interface BudgetTableProps {
  view: BudgetView;
  canEdit: boolean;
  onEdit(category: ExpenseCategory): void;
  /** "Orçar um grupo". */
  onAdd(): void;
}

export function BudgetTable({ view, canEdit, onEdit, onAdd }: BudgetTableProps) {
  const [open, setOpen] = useState<ReadonlySet<ExpenseCategory>>(() => new Set());
  const toggle = (category: ExpenseCategory) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(category)) next.add(category);
      return next;
    });
  const first = MONTH_ABBREV[view.months[0].month - 1];
  const last = MONTH_ABBREV[view.months[11].month - 1];

  return (
    <SectionCard
      title="Por grupo"
      subtitle={
        canEdit
          ? "abra um grupo para ver as contas · o lápis edita o orçado e a distribuição por mês"
          : "abra um grupo para ver as contas"
      }
      bodyClassName="p-0"
      action={
        canEdit ? (
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus aria-hidden />
            Orçar um grupo
          </Button>
        ) : undefined
      }
    >
      <table className="w-full border-collapse">
        <caption className="sr-only">Orçamento por grupo</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(HEAD, "pl-4 text-left")}>
              Grupo › Conta
            </th>
            <th scope="col" className={cn(HEAD, "w-[110px] text-right")}>
              Orçado (R$)
            </th>
            <th scope="col" className={cn(HEAD, "w-[120px] text-right")}>
              Realizado (R$)
            </th>
            <th scope="col" className={cn(HEAD, "w-[170px] text-left")}>
              % usado
            </th>
            <th scope="col" className={cn(HEAD, "w-[140px] text-right")}>
              Previsto até o fim
            </th>
            <th scope="col" className={cn(HEAD, "w-[150px] text-left")}>
              Mês a mês
            </th>
            <th scope="col" className={cn(HEAD, "w-12 pr-4")}>
              <span className="sr-only">Editar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {view.groups.map((group) => {
            const isOpen = open.has(group.category);
            return (
              <Fragment key={group.key}>
                <tr className={cn("border-t border-hairline", isOpen && "bg-surface")}>
                  <td className="py-2 pr-2 pl-4">
                    {group.accounts.length > 0 ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggle(group.category)}
                        className="inline-flex min-h-8 items-center gap-2 text-sm font-medium text-ink"
                      >
                        {isOpen ? (
                          <ChevronDown className="size-4 text-ink-soft" aria-hidden />
                        ) : (
                          <ChevronRight className="size-4 text-ink-soft" aria-hidden />
                        )}
                        {group.label}
                      </button>
                    ) : (
                      <span className="inline-flex min-h-8 items-center pl-6 text-sm font-medium text-ink">
                        {group.label}
                      </span>
                    )}
                    {group.accountsSum !== null ? (
                      <span className="block pl-6 text-xs text-attention">as contas somam {reais(group.accountsSum)}</span>
                    ) : null}
                  </td>
                  <FigureCells line={group} />
                  <td className="px-2 py-2">
                    <Sparkline
                      label={group.label}
                      budgeted={group.budgeted}
                      realized={group.realized}
                      todayIndex={view.todayIndex}
                    />
                  </td>
                  <td className="py-2 pr-4 pl-2 text-right">
                    {canEdit ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar orçamento de ${group.label}`}
                        title={`Editar orçamento de ${group.label}`}
                        onClick={() => onEdit(group.category)}
                      >
                        <Pencil aria-hidden />
                      </Button>
                    ) : null}
                  </td>
                </tr>
                {isOpen
                  ? group.accounts.map((account) => (
                      <tr key={account.key} className="border-t border-hairline bg-surface/60">
                        <td className="py-2.5 pr-2 pl-4">
                          <span className="block pl-6 text-sm text-ink">{account.label}</span>
                        </td>
                        <FigureCells line={account} variant="account" />
                        <td />
                        <td />
                      </tr>
                    ))
                  : null}
              </Fragment>
            );
          })}
          <tr className="border-t border-hairline bg-surface">
            <th scope="row" className="py-2.5 pr-2 pl-4 text-left text-sm font-semibold text-ink">
              Total
            </th>
            <FigureCells line={{ ...view.totals, hasBudget: true }} variant="total" />
            <td />
            <td />
          </tr>
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hairline px-4 py-2.5 text-xs text-ink-soft">
        <div className="flex flex-wrap items-center gap-4">
          {LEGEND.map(([tone, label]) => (
            <span key={tone} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("h-1.5 w-2.5 rounded-full", TONE_BAR[tone])} />
              {label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <svg width="16" height="8" aria-hidden>
            <line x1="0" y1="4" x2="16" y2="4" strokeWidth="1.25" className="stroke-ink opacity-70" />
          </svg>
          orçado do mês
          <span aria-hidden className="ml-2 h-2.5 w-[7px] rounded-[1px] bg-brand opacity-55" />
          realizado · {first} a {last}
        </div>
      </div>
    </SectionCard>
  );
}

/** Orçado, Realizado, % usado and Previsto of one row; the previsto turns overdue above the orçado. */
function FigureCells({ line, variant = "group" }: { line: Figures; variant?: "group" | "account" | "total" }) {
  const number = cn(
    "font-mono tabular-nums text-ink",
    variant === "account" ? "text-[13px]" : "text-sm",
    variant === "total" && "font-medium"
  );
  const over = line.hasBudget && line.forecast > line.budgetedTotal;
  return (
    <>
      <td className="px-2 py-2.5 text-right">
        <span className={cn(number, variant === "account" && "text-ink-soft")}>
          {line.hasBudget ? formatNumber(line.budgetedTotal) : "—"}
        </span>
      </td>
      <td className="px-2 py-2.5 text-right">
        <span className={number}>{formatNumber(line.realizedToDate)}</span>
      </td>
      <td className="px-2 py-2.5">
        {line.usedPct === null ? (
          <span className="text-xs text-ink-soft">{line.hasBudget ? "nada orçado até hoje" : "sem orçamento"}</span>
        ) : (
          <span className="flex items-center gap-2.5">
            <BudgetMeter pct={line.usedPct} tone={line.tone} className="w-24 shrink-0" />
            <span className={cn("min-w-11 font-mono text-[13px] font-medium", TONE_TEXT[line.tone])}>
              {usedText(line.usedPct)}
            </span>
          </span>
        )}
      </td>
      <td className="px-2 py-2.5 text-right">
        <span className={cn(number, over && "text-overdue")}>{formatNumber(line.forecast)}</span>
      </td>
    </>
  );
}
