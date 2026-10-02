"use client";

/**
 * The bar over the plano de contas and the pane (md+). Novo starts a
 * lançamento on the nó picked; the rest acts on the lançamento picked with its
 * radio, and a button that does not apply to it is disabled. Imprimir prints
 * the rows on screen. Without Financeiro edit only Ver anexos and Imprimir stay.
 */
import { Plus, Printer } from "lucide-react";
import type { PaneRow, PlanNode } from "@/lib/domain/planTree";
import { formatCurrency } from "@/lib/domain/format";
import { installmentLabel } from "@/lib/domain/series";
import { useCan } from "@/lib/store/usePermissions";
import { useEntryActions, type EntryAction } from "@/components/finance/lancamentos/useEntryActions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Separator() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-hairline" />;
}

function ToolButton({ action, danger = false }: { action: EntryAction; danger?: boolean }) {
  const Icon = action.icon;
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={!action.enabled}
      onClick={action.run}
      className={cn(
        "text-[13px] disabled:opacity-45",
        danger ? "text-overdue hover:text-overdue [&_svg]:text-overdue" : "text-ink [&_svg]:text-ink-soft"
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {action.label}
    </Button>
  );
}

interface LancamentosToolbarProps {
  node: PlanNode;
  row: PaneRow | null;
  onPrint(): void;
  /** After a change that may have removed or replaced the picked row. */
  onDone(): void;
}

export function LancamentosToolbar({ node, row, onPrint, onDone }: LancamentosToolbarProps) {
  const canEdit = useCan("finance", "edit");
  const { actions, dialogs } = useEntryActions(row, node, onDone);
  const expense = row?.ledger?.expense ?? null;
  const parcela = expense ? installmentLabel(expense) : null;
  const picked = row
    ? [row.history, parcela ? `parcela ${parcela}` : null, formatCurrency(Math.abs(row.amountBrl))]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div
      role="toolbar"
      aria-label="Ações do lançamento"
      className="hidden flex-wrap items-center gap-0.5 rounded-lg border border-hairline bg-panel py-1.5 pr-3 pl-1.5 md:flex"
    >
      {canEdit ? (
        <>
          <Button type="button" onClick={actions.new.run}>
            <Plus aria-hidden />
            Novo
          </Button>
          <Separator />
          <ToolButton action={actions.edit} />
          <ToolButton action={actions.remove} danger />
          <Separator />
          <ToolButton action={actions.markPaid} />
          <ToolButton action={actions.split} />
          <ToolButton action={actions.duplicate} />
          <Separator />
        </>
      ) : null}
      {/* Shown only on a row they apply to: a venda or compra of the manejos, a lançamento with anexos. */}
      {actions.account.enabled ? <ToolButton action={actions.account} /> : null}
      {actions.attachments.enabled ? <ToolButton action={actions.attachments} /> : null}
      <Button
        type="button"
        variant="ghost"
        onClick={onPrint}
        className="text-[13px] text-ink [&_svg]:text-ink-soft"
      >
        <Printer aria-hidden className="size-3.5" />
        Imprimir
      </Button>
      <span className="ml-auto min-w-0 truncate pl-3 text-xs text-ink-soft">
        {picked ? (
          <>
            Selecionado: <span className="text-ink">{picked}</span>
          </>
        ) : canEdit ? (
          "Escolha um lançamento na lista para editar"
        ) : (
          "Escolha um lançamento na lista"
        )}
      </span>
      {dialogs}
    </div>
  );
}
