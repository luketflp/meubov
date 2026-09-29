"use client";

/**
 * "Só esta" · "Esta e as próximas" · "Todas": where an edit or a removal of a
 * row of a parcelamento or recorrência applies. Paid rows never change; the
 * copy says so.
 */
import { useState } from "react";
import type { Expense, SeriesScope } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { effectiveDueDate } from "@/lib/domain/ledger";
import { monthYear } from "@/lib/domain/series";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { InstallmentChip, RecurrenceTag } from "@/components/finance/SeriesMarkers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface SeriesScopeDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  expense: Expense;
  action: "edit" | "remove";
  /** The valor before and after the edit, when it changed. */
  amountChange?: { from: number; to: number } | null;
  busy?: boolean;
  onConfirm(scope: SeriesScope): void;
}

export function SeriesScopeDialog({
  open,
  onOpenChange,
  expense,
  action,
  amountChange,
  busy = false,
  onConfirm,
}: SeriesScopeDialogProps) {
  const accounts = useHerdStore((s) => s.accounts);
  const expenses = useHerdStore((s) => s.expenses);
  const [scope, setScope] = useState<SeriesScope>("following");

  const recurring = expense.seriesFrequency !== undefined;
  const edit = action === "edit";
  const noun = recurring ? "conta recorrente" : "parcela";
  const rows = expenses.filter((e) => e.seriesId === expense.seriesId);
  const unpaid = rows.filter((e) => !e.paidAt).length;
  const firstDue = rows.map(effectiveDueDate).sort()[0] ?? effectiveDueDate(expense);
  const due = effectiveDueDate(expense);
  const group = expense.kind === "revenue" ? "revenue" : expense.category;
  const name = [accountName(expense.accountId, accounts) ?? ACCOUNT_GROUP_LABEL[group], expense.counterparty]
    .filter(Boolean)
    .join(" · ");
  const items = recurring ? "contas" : "parcelas";

  const options: { scope: SeriesScope; label: string; hint: string }[] = [
    {
      scope: "one",
      label: "Só esta",
      hint: recurring
        ? `a conta de ${formatDate(due)}`
        : `a parcela ${expense.seriesIndex}/${expense.seriesCount}`,
    },
    {
      scope: "following",
      label: "Esta e as próximas",
      hint: `${formatDate(due).slice(0, 5)} em diante · as anteriores ficam como estão · ${
        edit ? "as pagas não mudam" : "as já pagas ficam"
      }`,
    },
    {
      scope: "all",
      label: "Todas",
      hint: edit
        ? `as ${rows.length} ${items} desde ${monthYear(firstDue)} · as já pagas guardam o valor pago`
        : `as ${unpaid} não pagas · as já pagas ficam`,
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {edit ? "Editar" : "Remover"} {noun}
          </DialogTitle>
          <DialogDescription>
            {name} · <InstallmentChip expense={expense} />
            <RecurrenceTag expense={expense} />.
            {edit && amountChange ? (
              <>
                {" "}
                O valor passa de <span className="font-mono">{formatCurrency(amountChange.from)}</span> para{" "}
                <span className="font-mono">{formatCurrency(amountChange.to)}</span>.
              </>
            ) : null}{" "}
            {edit ? "Onde aplicar?" : "O que remover?"}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium text-ink">
            {edit ? "Aplicar a mudança em" : "Remover"}
          </legend>
          {options.map((option) => (
            <label
              key={option.scope}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5",
                scope === option.scope ? "border-brand bg-brand-soft" : "border-hairline"
              )}
            >
              <input
                type="radio"
                name="series-scope"
                checked={scope === option.scope}
                onChange={() => setScope(option.scope)}
                className="mt-0.5 size-4 accent-brand"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                <span className="block text-xs text-ink-soft">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 md:min-h-9"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={edit ? "default" : "destructive"}
            className="min-h-11 md:min-h-9"
            disabled={busy}
            onClick={() => onConfirm(scope)}
          >
            {edit ? "Salvar" : busy ? "Removendo…" : "Remover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
