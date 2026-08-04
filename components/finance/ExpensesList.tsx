"use client";

/**
 * "Despesas" section: date-desc list of the farm expenses with removal, plus
 * the register dialog in the header. Feeds (with the sanitary treatment
 * costs) every cost figure of the finance screens.
 */
import { Trash2, Wallet } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { formatDate } from "@/lib/domain/dates";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { formatCurrency } from "@/lib/domain/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { RegisterExpenseDialog } from "@/components/finance/RegisterExpenseDialog";

/** How many rows the list shows (newest first) before summarizing. */
const MAX_ROWS = 8;

export function ExpensesList() {
  const expenses = useHerdStore((s) => s.expenses);
  const removeExpense = useHerdStore((s) => s.removeExpense);
  const { addToast } = useToast();

  const sorted = [...expenses].sort((a, b) => (a.date < b.date ? 1 : -1));
  const visible = sorted.slice(0, MAX_ROWS);

  async function onRemove(id: string) {
    await removeExpense(id);
    addToast({ messageType: "success", text: "Despesa removida" });
  }

  return (
    <SectionCard title="Despesas" action={<RegisterExpenseDialog />}>
      {sorted.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma despesa lançada"
          description="Lance as despesas da fazenda para compor os custos reais do financeiro."
        />
      ) : (
        <>
          <ul className="divide-y divide-hairline">
            {visible.map((expense) => (
              <li key={expense.id} className="flex min-h-11 items-center gap-3 py-2">
                <span className="w-20 shrink-0 font-mono text-xs text-ink-soft">
                  {formatDate(expense.date)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {EXPENSE_CATEGORY_LABEL[expense.category]}
                  </p>
                  {expense.notes ? (
                    <p className="truncate text-xs text-ink-soft">{expense.notes}</p>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-sm font-medium text-ink">
                  {formatCurrency(expense.amountBrl)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover despesa"
                  className="size-9 shrink-0 text-ink-soft hover:text-overdue"
                  onClick={() => onRemove(expense.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {sorted.length > MAX_ROWS ? (
            <p className="pt-2 text-xs text-ink-soft">
              Mostrando as {MAX_ROWS} mais recentes de {sorted.length} despesas.
            </p>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
