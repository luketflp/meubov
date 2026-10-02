"use client";

/**
 * "Lançar rendimento": what an aplicação earned. It is received on its own
 * date into the aplicação, raises its saldo and stays out of the receita: no
 * conta do plano, vencimento or repetition. With `expense` it edits that
 * rendimento (the same three fields).
 */
import { useState, type FormEvent } from "react";
import type { Expense } from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { parseAmount } from "@/components/finance/parseAmount";
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
import { Textarea } from "@/components/ui/textarea";

export function YieldDialog({
  open,
  onOpenChange,
  bankAccountId,
  expense,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The aplicação. */
  bankAccountId: string;
  expense?: Expense;
}) {
  const name = useHerdStore((s) => s.bankAccounts.find((a) => a.id === bankAccountId)?.name);
  // While saving the dialog stays: Esc, outside click and Cancelar wait.
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar rendimento" : "Lançar rendimento"}</DialogTitle>
          <DialogDescription>
            {name ?? "Aplicação"} · soma no saldo da aplicação e fica fora da receita.
          </DialogDescription>
        </DialogHeader>
        <YieldForm
          bankAccountId={bankAccountId}
          expense={expense}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function YieldForm({
  bankAccountId,
  expense,
  onBusyChange,
  onDone,
}: {
  bankAccountId: string;
  expense?: Expense;
  onBusyChange(busy: boolean): void;
  onDone(): void;
}) {
  const addExpense = useHerdStore((s) => s.addExpense);
  const updateExpense = useHerdStore((s) => s.updateExpense);
  const { addToast } = useToast();
  const [date, setDate] = useState(() => expense?.date ?? todayISO());
  const [amount, setAmount] = useState(expense ? String(expense.amountBrl).replace(".", ",") : "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSavingState] = useState(false);
  const setSaving = (next: boolean) => {
    setSavingState(next);
    onBusyChange(next);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (date === "") return setError("Informe a data do rendimento.");
    const amountBrl = parseAmount(amount);
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) return setError("Informe o valor (maior que zero).");
    setError(null);
    setSaving(true);
    try {
      // A rendimento is received on its own date.
      if (expense) {
        await updateExpense(expense.id, { date, amountBrl, paidAt: date, notes: notes.trim() || null });
      } else {
        await addExpense({
          kind: "yield",
          date,
          amountBrl,
          category: "other",
          paidAt: date,
          bankAccountId,
          notes: notes.trim() || undefined,
        });
      }
    } catch {
      setSaving(false); // apiFail already toasted
      return;
    }
    addToast({ messageType: "success", text: expense ? "Rendimento salvo" : "Rendimento lançado" });
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="yield-date">Data</Label>
          <Input
            id="yield-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="yield-amount">Valor (R$)</Label>
          <Input
            id="yield-amount"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="yield-notes">Observação</Label>
        <Textarea
          id="yield-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: rendimento de setembro"
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11" disabled={saving}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11" disabled={saving}>
          {expense ? "Salvar" : "Lançar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
