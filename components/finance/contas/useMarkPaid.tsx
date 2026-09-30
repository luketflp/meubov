"use client";

/**
 * "Marcar como pago / recebido" with the conta. With one conta (or none) the
 * lançamento is marked at once from it; with two or more, a small dialog asks
 * "Pago por" and the day first. The hook toasts either way.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import type { Expense } from "@/lib/types";
import { payingAccounts } from "@/lib/domain/bankAccounts";
import { todayISO } from "@/lib/domain/dates";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { PaidByField, defaultPaidBy } from "@/components/finance/contas/PaidByField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function useMarkPaid(onDone?: () => void): {
  /** Marks now, or opens the dialog; resolves once the silent mark settled. */
  request(expense: Expense): Promise<void>;
  dialog: ReactNode;
} {
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const markExpensePaid = useHerdStore((s) => s.markExpensePaid);
  const { addToast } = useToast();
  const [target, setTarget] = useState<Expense | null>(null);

  const mark = async (expense: Expense, paidAt: string, bankAccountId: string | null) => {
    await markExpensePaid(expense.id, paidAt, bankAccountId);
    addToast({ messageType: "success", text: expense.kind === "revenue" ? "Marcado como recebido" : "Marcado como pago" });
    onDone?.();
  };

  const request = async (expense: Expense) => {
    const options = payingAccounts(bankAccounts, expense.kind);
    if (options.length >= 2) {
      setTarget(expense);
      return;
    }
    try {
      await mark(expense, todayISO(), options[0]?.id ?? null);
    } catch {
      // apiFail already toasted
    }
  };

  const dialog = target ? (
    <MarkPaidDialog
      expense={target}
      onClose={() => setTarget(null)}
      onConfirm={(paidAt, bankAccountId) => mark(target, paidAt, bankAccountId)}
    />
  ) : null;
  return { request, dialog };
}

function MarkPaidDialog({
  expense,
  onClose,
  onConfirm,
}: {
  expense: Expense;
  onClose(): void;
  onConfirm(paidAt: string, bankAccountId: string): Promise<void>;
}) {
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const revenue = expense.kind === "revenue";
  const [paidAt, setPaidAt] = useState(todayISO());
  const [bankAccountId, setBankAccountId] = useState(() => defaultPaidBy(bankAccounts, expense.kind));
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (paidAt === "" || bankAccountId === "") return;
    setBusy(true);
    try {
      await onConfirm(paidAt, bankAccountId);
      onClose();
    } catch {
      // apiFail already toasted
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{revenue ? "Marcar como recebido" : "Marcar como pago"}</DialogTitle>
          <DialogDescription>{revenue ? "Em que conta o dinheiro entrou?" : "De que conta o dinheiro saiu?"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <PaidByField
            id="mark-paid-account"
            accounts={bankAccounts}
            kind={expense.kind}
            value={bankAccountId}
            onChange={setBankAccountId}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="mark-paid-date">{revenue ? "Recebido em" : "Pago em"}</Label>
            <Input
              id="mark-paid-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="min-h-11 font-mono"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" className="min-h-11 md:min-h-9" disabled={busy || paidAt === ""}>
              {revenue ? "Marcar recebido" : "Marcar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
