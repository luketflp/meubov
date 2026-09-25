"use client";

/**
 * What a row of the Extrato lets you do. A lançamento: Editar (the
 * EntryDialog filled in), Marcar como pago / recebido while pending, and
 * Remover after a confirmation. A row the manejos wrote is locked and says
 * so. The buttons need Financeiro at edit.
 */
import { useState } from "react";
import { CheckCircle2, Lock, Pencil, Trash2 } from "lucide-react";
import type { LedgerRow } from "@/lib/domain/ledger";
import { todayISO } from "@/lib/domain/dates";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { EntryDialog } from "@/components/finance/EntryDialog";
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

const LOCKED_HINT = "Vendas, compras e tratamentos vêm dos manejos";

interface RowActionsProps {
  row: LedgerRow;
  /** Full-width buttons with their names, for the phone's row sheet. */
  labeled?: boolean;
  /** After the row was marked paid or removed (the phone closes its sheet). */
  onDone?: () => void;
}

export function RowActions({ row, labeled = false, onDone }: RowActionsProps) {
  const canEdit = useCan("finance", "edit");
  const markExpensePaid = useHerdStore((s) => s.markExpensePaid);
  const removeExpense = useHerdStore((s) => s.removeExpense);
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (row.locked) {
    return labeled ? (
      <p className="flex items-center gap-2 text-sm text-ink-soft">
        <Lock className="size-4 shrink-0" aria-hidden />
        {LOCKED_HINT}.
      </p>
    ) : (
      <span
        title={LOCKED_HINT}
        className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-ink-soft"
      >
        <Lock className="size-3.5" aria-hidden />
        do manejo
      </span>
    );
  }

  const expense = row.expense;
  if (!canEdit || !expense) return null;

  const revenue = expense.kind === "revenue";
  const pending = row.paidAt === null;
  const markLabel = revenue ? "Marcar como recebido" : "Marcar como pago";

  const markPaid = async () => {
    setBusy(true);
    try {
      await markExpensePaid(expense.id, todayISO());
      addToast({ messageType: "success", text: revenue ? "Marcado como recebido" : "Marcado como pago" });
      onDone?.();
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeExpense(expense.id);
      addToast({ messageType: "success", text: "Lançamento removido" });
      setConfirming(false);
      onDone?.();
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
    }
  };

  const variant = labeled ? "outline" : "ghost";
  const size = labeled ? "default" : "icon-sm";
  const buttonClass = labeled ? "min-h-11 w-full justify-start" : "text-ink-soft hover:text-ink";

  return (
    <>
      <div className={labeled ? "flex flex-col gap-2" : "flex items-center justify-end gap-0.5"}>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={buttonClass}
          aria-label={labeled ? undefined : "Editar lançamento"}
          title={labeled ? undefined : "Editar"}
          onClick={() => setEditing(true)}
        >
          <Pencil aria-hidden />
          {labeled ? "Editar" : null}
        </Button>
        {pending ? (
          <Button
            type="button"
            variant={variant}
            size={size}
            className={buttonClass}
            aria-label={labeled ? undefined : markLabel}
            title={labeled ? undefined : markLabel}
            disabled={busy}
            onClick={markPaid}
          >
            <CheckCircle2 aria-hidden />
            {labeled ? markLabel : null}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={variant}
          size={size}
          className={cn(buttonClass, "hover:text-overdue")}
          aria-label={labeled ? undefined : "Remover lançamento"}
          title={labeled ? undefined : "Remover"}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden />
          {labeled ? "Remover" : null}
        </Button>
      </div>

      {/* Mounted only while open, so the form starts from the row every time. */}
      {editing ? <EntryDialog open onOpenChange={setEditing} expense={expense} /> : null}

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!busy) setConfirming(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover lançamento?</DialogTitle>
            <DialogDescription>
              Essa {revenue ? "receita" : "despesa"} some do extrato e dos indicadores.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 md:min-h-9"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 md:min-h-9"
              disabled={busy}
              onClick={remove}
            >
              {busy ? "Removendo…" : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
