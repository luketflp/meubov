"use client";

/**
 * The phone's sheet of one lançamento: what it is, when and how much, and the
 * toolbar's actions that apply to it, Imprimir printing this one line. A row
 * the manejos wrote takes only its conta bancária and says so.
 */
import { Lock, Printer, type LucideIcon } from "lucide-react";
import type { PaneRow, PlanNode } from "@/lib/domain/planTree";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { installmentLabel } from "@/lib/domain/series";
import { paneExportTable } from "@/lib/export/datasets/finance";
import { usePrintStore } from "@/lib/store/usePrintStore";
import { useExportContext } from "@/components/export/useExportContext";
import { LedgerStatusPill } from "@/components/finance/lancamentos/pills";
import { useEntryActions, type EntryActionKey } from "@/components/finance/lancamentos/useEntryActions";
import { BOTTOM_SHEET } from "@/components/ui/bottom-sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** The sheet's order, as the canvas; Imprimir and Excluir close it. */
const ORDER: readonly EntryActionKey[] = ["markPaid", "edit", "split", "duplicate", "attachments", "account"];

function SheetButton({
  label,
  icon: Icon,
  danger = false,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  danger?: boolean;
  onClick(): void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex min-h-12 w-full items-center gap-3 px-1 text-left text-[15px]",
          danger ? "text-overdue" : "text-ink"
        )}
      >
        <Icon className={cn("size-[18px] shrink-0", danger ? "text-overdue" : "text-ink-soft")} aria-hidden />
        {label}
      </button>
    </li>
  );
}

interface RowSheetProps {
  /** The row tapped; null keeps the sheet closed. */
  row: PaneRow | null;
  node: PlanNode;
  onOpenChange(open: boolean): void;
}

export function RowSheet({ row, node, onOpenChange }: RowSheetProps) {
  const { actions, dialogs } = useEntryActions(row, node, () => onOpenChange(false));
  const print = usePrintStore((s) => s.print);
  const exportContext = useExportContext();
  const ledger = row?.ledger ?? null;
  const expense = ledger?.expense ?? null;
  const parcela = expense ? installmentLabel(expense) : null;

  return (
    <>
      <Dialog open={row !== null} onOpenChange={onOpenChange}>
        <DialogContent className={BOTTOM_SHEET}>
          {row ? (
            <>
              <DialogHeader>
                <DialogTitle>{parcela ? `${row.history} · parcela ${parcela}` : row.history}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span>
                    {expense && ledger?.paidAt === null ? `vence ${formatDate(ledger.dueDate)}` : formatDate(row.date)}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="font-mono text-ink">{formatCurrency(Math.abs(row.amountBrl))}</span>
                  {ledger ? <LedgerStatusPill status={ledger.status} /> : null}
                </DialogDescription>
              </DialogHeader>
              <ul className="border-t border-hairline">
                {ORDER.map((key) => actions[key])
                  .filter((action) => action.enabled)
                  .map((action) => (
                    <SheetButton key={action.label} label={action.label} icon={action.icon} onClick={action.run} />
                  ))}
                <SheetButton
                  label="Imprimir"
                  icon={Printer}
                  onClick={() =>
                    print({
                      title: row.history,
                      tables: [paneExportTable([row], row.history)],
                      context: exportContext(),
                    })
                  }
                />
                {actions.remove.enabled ? (
                  <SheetButton label="Excluir" icon={actions.remove.icon} danger onClick={actions.remove.run} />
                ) : null}
              </ul>
              {ledger?.locked ? (
                <p className="flex items-center gap-2 text-sm text-ink-soft">
                  <Lock className="size-4 shrink-0" aria-hidden />
                  Vendas, compras e tratamentos vêm dos manejos.
                </p>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      {dialogs}
    </>
  );
}
