"use client";

/**
 * "Por grupo" on the phone: a card per grupo with its % usado, the bar and
 * orçado / realizado / previsto; a card opens to its contas and, for whoever
 * edits the Financeiro, to "Editar orçamento de <grupo>".
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import type { ExpenseCategory } from "@/lib/types";
import type { BudgetLine, BudgetTone, BudgetView } from "@/lib/domain/budget";
import { formatNumber } from "@/lib/domain/format";
import { BudgetMeter, usedText } from "@/components/finance/orcamento/BudgetMeter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PILL: Record<BudgetTone, string> = {
  brand: "bg-healthy-soft text-healthy",
  attention: "bg-attention-soft text-attention",
  overdue: "bg-overdue-soft text-overdue",
  none: "bg-surface text-ink-soft",
};

const WORD: Record<BudgetTone, string> = { brand: "dentro", attention: "no limite", overdue: "acima", none: "" };

interface BudgetCardsProps {
  view: BudgetView;
  canEdit: boolean;
  onEdit(category: ExpenseCategory): void;
  /** "Orçar um grupo". */
  onAdd(): void;
}

export function BudgetCards({ view, canEdit, onEdit, onAdd }: BudgetCardsProps) {
  const [open, setOpen] = useState<ExpenseCategory | null>(null);
  return (
    <section aria-labelledby="budget-cards-title" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="budget-cards-title" className="font-heading text-base font-semibold text-ink">
          Por grupo
        </h2>
        <p className="text-xs text-ink-soft">valores em R$</p>
      </div>
      <ul className="flex flex-col gap-2">
        {view.groups.map((group) => {
          const isOpen = open === group.category;
          const panel = `budget-card-${group.category}`;
          return (
            <li key={group.key} className="overflow-hidden rounded-lg border border-hairline bg-panel">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => setOpen(isOpen ? null : group.category)}
                className="flex min-h-11 w-full flex-col gap-2.5 px-3.5 py-3 text-left"
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[15px] leading-[22px] font-medium text-ink">{group.label}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Pill line={group} />
                    {isOpen ? (
                      <ChevronDown className="size-4 text-ink-soft" aria-hidden />
                    ) : (
                      <ChevronRight className="size-4 text-ink-soft" aria-hidden />
                    )}
                  </span>
                </span>
                {group.usedPct !== null ? <BudgetMeter pct={group.usedPct} tone={group.tone} className="w-full" /> : null}
                <Figures line={group} />
              </button>
              {isOpen ? (
                <div id={panel} className="border-t border-hairline">
                  {group.accounts.length > 0 ? (
                    <ul className="divide-y divide-hairline">
                      {group.accounts.map((account) => (
                        <li key={account.key} className="flex flex-col gap-2 px-3.5 py-2.5">
                          <span className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-sm text-ink">{account.label}</span>
                            <Pill line={account} />
                          </span>
                          <Figures line={account} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3.5 py-2.5 text-xs text-ink-soft">
                      Nenhuma conta do grupo tem orçamento ou despesa nesta safra.
                    </p>
                  )}
                  {canEdit ? (
                    <div className="border-t border-hairline p-1.5">
                      <Button variant="ghost" className="min-h-11 w-full" onClick={() => onEdit(group.category)}>
                        <Pencil aria-hidden />
                        Editar orçamento de {group.label}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <Button variant="outline" className="min-h-11" onClick={onAdd}>
          <Plus aria-hidden />
          Orçar um grupo
        </Button>
      ) : null}
    </section>
  );
}

/** "108 % · acima", "sem orçamento". */
function Pill({ line }: { line: BudgetLine }) {
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", PILL[line.tone])}>
      {line.usedPct === null
        ? line.hasBudget
          ? "nada orçado até hoje"
          : "sem orçamento"
        : `${usedText(line.usedPct)} · ${WORD[line.tone]}`}
    </span>
  );
}

function Figures({ line }: { line: BudgetLine }) {
  const over = line.hasBudget && line.forecast > line.budgetedTotal;
  const cells: [string, string, boolean][] = [
    ["Orçado", line.hasBudget ? formatNumber(line.budgetedTotal) : "—", false],
    ["Realizado", formatNumber(line.realizedToDate), false],
    ["Previsto", formatNumber(line.forecast), over],
  ];
  return (
    <span className="grid grid-cols-3 gap-2">
      {cells.map(([label, value, overdue]) => (
        <span key={label} className="min-w-0">
          <span className="block text-[10px] font-medium tracking-wide text-ink-soft uppercase">{label}</span>
          <span className={cn("block font-mono text-[13px] leading-5 whitespace-nowrap", overdue ? "text-overdue" : "text-ink")}>
            {value}
          </span>
        </span>
      ))}
    </span>
  );
}
