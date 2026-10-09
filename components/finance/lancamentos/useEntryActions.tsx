"use client";

/**
 * What the toolbar and the phone's row sheet do to the lançamento picked, and
 * which of it applies: Novo (on the nó), Editar, Excluir (a série asks how
 * far, a transferência goes whole), Marcar como pago / recebido, Parcelar,
 * Duplicar, Ver anexos and, on a venda or compra of the manejos, only its
 * Conta. Writes need Financeiro at edit; Ver anexos needs only view. The
 * caller renders `dialogs`.
 */
import { useState, type ReactNode } from "react";
import {
  CircleCheck,
  Copy,
  Landmark,
  Paperclip,
  Pencil,
  Plus,
  Split,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { BankAccount, SeriesScope } from "@/lib/types";
import { payingAccounts } from "@/lib/domain/bankAccounts";
import { entryInitialFor, type PaneRow, type PlanNode } from "@/lib/domain/planTree";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { SeriesScopeDialog } from "@/components/finance/SeriesScopeDialog";
import { AttachmentsDialog } from "@/components/finance/attachments/AttachmentsDialog";
import { MovementAccountDialog } from "@/components/finance/contas/MovementAccountDialog";
import { useMarkPaid } from "@/components/finance/contas/useMarkPaid";
import { SplitDialog } from "@/components/finance/lancamentos/SplitDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type EntryActionKey =
  | "new"
  | "edit"
  | "remove"
  | "markPaid"
  | "split"
  | "duplicate"
  | "attachments"
  | "account";

export interface EntryAction {
  label: string;
  icon: LucideIcon;
  /** Applies to the row picked and the user may do it. */
  enabled: boolean;
  run(): void;
}

/** Which actions apply to `row` (null: none picked) for a user with or without Financeiro edit. */
export function applicableActions(
  row: PaneRow | null,
  canEdit: boolean,
  bankAccounts: BankAccount[]
): Record<EntryActionKey, boolean> {
  const ledger = row?.ledger ?? null;
  const expense = ledger?.expense ?? null;
  const pending = expense !== null && !expense.paidAt;
  return {
    new: canEdit,
    // TransferDialog only creates: a transferência is removed, never edited, here.
    edit: canEdit && expense !== null,
    remove: canEdit && (expense !== null || (row?.transfer ?? null) !== null),
    markPaid: canEdit && pending,
    split: canEdit && pending && !expense.seriesId && expense.kind !== "yield",
    duplicate: canEdit && expense !== null,
    attachments: (expense?.attachmentCount ?? 0) > 0,
    // A venda or compra keeps its value but takes the conta its money went through, when one can take it.
    account:
      canEdit &&
      (ledger?.kind === "sale" || ledger?.kind === "purchase") &&
      (payingAccounts(bankAccounts, "revenue").length > 0 || ledger.bankAccountId !== null),
  };
}

export function useEntryActions(
  row: PaneRow | null,
  node: PlanNode,
  /** After a change that may have removed or replaced the row. */
  onDone?: () => void
): { actions: Record<EntryActionKey, EntryAction>; dialogs: ReactNode } {
  const canEdit = useCan("finance", "edit");
  const accounts = useHerdStore((s) => s.accounts);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const planGroups = useHerdStore((s) => s.planGroups);
  const removeExpense = useHerdStore((s) => s.removeExpense);
  const removeTransfer = useHerdStore((s) => s.removeTransfer);
  const markPaid = useMarkPaid(onDone);
  const { addToast } = useToast();
  const [open, setOpen] = useState<EntryActionKey | null>(null);
  const [busy, setBusy] = useState(false);

  const ledger = row?.ledger ?? null;
  const expense = ledger?.expense ?? null;
  const transfer = row?.transfer ?? null;
  const can = applicableActions(row, canEdit, bankAccounts);
  const close = () => setOpen(null);
  const show = (key: EntryActionKey) => () => setOpen(key);

  const onMarkPaid = async () => {
    if (!expense) return;
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
      if (transfer) await removeTransfer(transfer.id);
      else if (expense) await removeExpense(expense.id, scope);
      addToast({ messageType: "success", text: transfer ? "Transferência excluída" : "Lançamento excluído" });
      setOpen(null);
      onDone?.();
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
    }
  };

  const actions: Record<EntryActionKey, EntryAction> = {
    new: { label: "Novo", icon: Plus, enabled: can.new, run: show("new") },
    edit: { label: "Editar", icon: Pencil, enabled: can.edit, run: show("edit") },
    remove: { label: "Excluir", icon: Trash2, enabled: can.remove, run: show("remove") },
    markPaid: {
      label: ledger?.inflow ? "Marcar como recebido" : "Marcar como pago",
      icon: CircleCheck,
      enabled: can.markPaid && !busy,
      run: () => void onMarkPaid(),
    },
    split: { label: "Parcelar", icon: Split, enabled: can.split, run: show("split") },
    duplicate: { label: "Duplicar", icon: Copy, enabled: can.duplicate, run: show("duplicate") },
    attachments: { label: "Ver anexos", icon: Paperclip, enabled: can.attachments, run: show("attachments") },
    account: { label: "Conta", icon: Landmark, enabled: can.account, run: show("account") },
  };

  // A row of a série asks how far the removal goes; anything else asks once.
  const confirming = open === "remove" && (transfer !== null || (expense !== null && !expense.seriesId));

  const dialogs = (
    <>
      {/* Mounted only while open, so each form starts from the row. */}
      {open === "new" ? (
        <EntryDialog open onOpenChange={close} initial={entryInitialFor(node, accounts, bankAccounts, planGroups)} />
      ) : null}
      {open === "edit" && expense ? <EntryDialog open onOpenChange={close} expense={expense} /> : null}
      {open === "duplicate" && expense ? <EntryDialog open onOpenChange={close} template={expense} /> : null}
      {open === "split" && expense ? <SplitDialog expense={expense} onOpenChange={close} onDone={onDone} /> : null}
      {open === "attachments" && expense ? <AttachmentsDialog expense={expense} onOpenChange={close} /> : null}
      {open === "account" && ledger ? (
        <MovementAccountDialog row={ledger} onOpenChange={close} onDone={onDone} />
      ) : null}
      {markPaid.dialog}

      {open === "remove" && expense?.seriesId ? (
        <SeriesScopeDialog
          open
          onOpenChange={(next) => {
            if (!next && !busy) close();
          }}
          expense={expense}
          action="remove"
          busy={busy}
          onConfirm={(scope) => void remove(scope)}
        />
      ) : null}

      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !busy) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transfer ? "Excluir transferência?" : "Excluir lançamento?"}</DialogTitle>
            <DialogDescription>
              {transfer
                ? "O dinheiro volta para a conta de onde saiu."
                : "Ele sai do extrato, dos saldos e dos indicadores."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11 md:min-h-9" disabled={busy} onClick={close}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 md:min-h-9"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { actions, dialogs };
}
