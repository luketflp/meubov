/**
 * What marks a row of a série or with anexos, on Contas, Últimos lançamentos
 * and the Extrato: the "2/3" chip of a parcela, the repeat icon with "todo dia
 * 20" of an ocorrência, the paperclip with the count of anexos.
 */
import { Paperclip, Repeat } from "lucide-react";
import type { Expense } from "@/lib/types";
import { installmentLabel, recurrenceLabel } from "@/lib/domain/series";

export function InstallmentChip({ expense }: { expense: Expense | null }) {
  const label = expense ? installmentLabel(expense) : null;
  if (!expense || !label) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-hairline bg-surface px-1.5 font-mono text-[11px] leading-4 font-medium text-ink">
      <span aria-hidden>{label}</span>
      <span className="sr-only">
        parcela {expense.seriesIndex} de {expense.seriesCount}
      </span>
    </span>
  );
}

export function RecurrenceTag({ expense }: { expense: Expense | null }) {
  const label = expense ? recurrenceLabel(expense) : null;
  if (!label) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-ink-soft">
      <Repeat className="size-3" aria-hidden />
      {label}
    </span>
  );
}

export function AttachmentCount({ expense }: { expense: Expense | null }) {
  const count = expense?.attachmentCount ?? 0;
  if (count === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] leading-4 text-ink-soft">
      <Paperclip className="size-3" aria-hidden />
      <span aria-hidden>{count}</span>
      <span className="sr-only">{count === 1 ? "1 anexo" : `${count} anexos`}</span>
    </span>
  );
}
