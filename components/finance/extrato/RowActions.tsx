"use client";

/**
 * What a row of the Extrato lets you do. A lançamento: Ver anexos when it has
 * any (Financeiro at view is enough), Editar (the EntryDialog filled in),
 * Marcar como pago / recebido while pending (asking "Pago por" when the farm
 * has two or more contas), and Remover after a confirmation — for a row of a
 * série, the choice of "Só esta", "Esta e as próximas" or "Todas". A row the
 * manejos wrote is locked and says so; a venda or compra still takes its
 * "Conta". Editing needs Financeiro at edit.
 */
import { useState } from "react";
import { CheckCircle2, Landmark, Lock, Paperclip, Pencil, Trash2 } from "lucide-react";
import type { SeriesScope } from "@/lib/types";
import type { LedgerRow } from "@/lib/domain/ledger";
import { payingAccounts } from "@/lib/domain/bankAccounts";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { SeriesScopeDialog } from "@/components/finance/SeriesScopeDialog";
import { AttachmentsDialog } from "@/components/finance/attachments/AttachmentsDialog";
import { MovementAccountDialog } from "@/components/finance/contas/MovementAccountDialog";
import { useMarkPaid } from "@/components/finance/contas/useMarkPaid";
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
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const markPaid = useMarkPaid(onDone);
  const removeExpense = useHerdStore((s) => s.removeExpense);
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [choosingAccount, setChoosingAccount] = useState(false);
  const [busy, setBusy] = useState(false);

  if (row.locked) {
    // A venda or compra keeps its value locked but takes the conta its money went through.
    // Only when a conta can take it (never a cartão), or to change the one it has.
    const takesAccount =
      canEdit &&
      (row.kind === "sale" || row.kind === "purchase") &&
      (payingAccounts(bankAccounts, "revenue").length > 0 || row.bankAccountId !== null);
    const accountButton = takesAccount ? (
      <Button
        type="button"
        variant={labeled ? "outline" : "ghost"}
        size={labeled ? "default" : "icon-sm"}
        className={labeled ? "min-h-11 w-full justify-start" : "text-ink-soft hover:text-ink"}
        aria-label={labeled ? undefined : "Conta"}
        title={labeled ? undefined : "Conta"}
        onClick={() => setChoosingAccount(true)}
      >
        <Landmark aria-hidden />
        {labeled ? "Conta" : null}
      </Button>
    ) : null;
    const accountDialog = choosingAccount ? (
      <MovementAccountDialog row={row} onOpenChange={setChoosingAccount} onDone={onDone} />
    ) : null;
    return labeled ? (
      <div className="flex flex-col gap-2">
        {accountButton}
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Lock className="size-4 shrink-0" aria-hidden />
          {LOCKED_HINT}.
        </p>
        {accountDialog}
      </div>
    ) : (
      <span className="inline-flex items-center justify-end gap-1">
        {accountButton}
        <span
          title={LOCKED_HINT}
          className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-ink-soft"
        >
          <Lock className="size-3.5" aria-hidden />
          do manejo
        </span>
        {accountDialog}
      </span>
    );
  }

  const expense = row.expense;
  if (!expense) return null;
  const hasFiles = (expense.attachmentCount ?? 0) > 0;
  if (!canEdit && !hasFiles) return null;

  const revenue = expense.kind === "revenue";
  const pending = row.paidAt === null;
  const markLabel = revenue ? "Marcar como recebido" : "Marcar como pago";

  const onMarkPaid = async () => {
    setBusy(true);
    try {
      // With two or more contas it opens "Pago por"; the hook marks, toasts and calls onDone.
      await markPaid.request(expense);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (scope: SeriesScope = "one") => {
    setBusy(true);
    try {
      await removeExpense(expense.id, scope);
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
        {hasFiles ? (
          <Button
            type="button"
            variant={variant}
            size={size}
            className={buttonClass}
            aria-label={labeled ? undefined : "Ver anexos"}
            title={labeled ? undefined : "Ver anexos"}
            onClick={() => setViewing(true)}
          >
            <Paperclip aria-hidden />
            {labeled ? "Ver anexos" : null}
          </Button>
        ) : null}
        {canEdit ? (
          <>
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
                onClick={onMarkPaid}
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
          </>
        ) : null}
      </div>

      {/* Mounted only while open, so the form starts from the row every time. */}
      {editing ? <EntryDialog open onOpenChange={setEditing} expense={expense} /> : null}
      {viewing ? <AttachmentsDialog expense={expense} onOpenChange={setViewing} /> : null}
      {markPaid.dialog}

      {expense.seriesId && confirming ? (
        <SeriesScopeDialog
          open
          onOpenChange={setConfirming}
          expense={expense}
          action="remove"
          busy={busy}
          onConfirm={(scope) => void remove(scope)}
        />
      ) : null}

      <Dialog
        open={confirming && !expense.seriesId}
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
              onClick={() => void remove()}
            >
              {busy ? "Removendo…" : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
