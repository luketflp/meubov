"use client";

/**
 * "Parcelar": a pending lançamento that is not part of a série becomes 2 to 48
 * parcelas. Its value is the total, split as a new parcelamento is (the last
 * parcela takes the centavos); the first parcela keeps the lançamento and its
 * anexos.
 */
import { useState, type FormEvent } from "react";
import { Split } from "lucide-react";
import type { Expense, SeriesFrequency } from "@/lib/types";
import { formatCurrency } from "@/lib/domain/format";
import { effectiveDueDate } from "@/lib/domain/ledger";
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS } from "@/lib/domain/series";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import {
  InstallmentPreview,
  initialRepeat,
  repeatFromFields,
  type RepeatFields,
} from "@/components/finance/RepeatSection";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SplitDialog({
  expense,
  onOpenChange,
  onDone,
}: {
  expense: Expense;
  onOpenChange(open: boolean): void;
  /** After the parcelas were written. */
  onDone?(): void;
}) {
  const splitExpense = useHerdStore((s) => s.splitExpense);
  const { addToast } = useToast();
  // Primeira parcela vence on the lançamento's own vencimento unless changed.
  const [fields, setFields] = useState<RepeatFields>(() => ({
    ...initialRepeat(expense.date),
    choice: "installments",
    firstDue: effectiveDueDate(expense),
  }));
  const [busy, setBusy] = useState(false);
  const patch = (change: Partial<RepeatFields>) => setFields((prev) => ({ ...prev, ...change }));
  // The rules of Parcelado in Novo lançamento: 2–48, never due before the lançamento's date.
  const repeat = repeatFromFields(fields, expense.date);
  const valid = repeat !== null && typeof repeat !== "string" ? repeat : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid?.count) return;
    setBusy(true);
    try {
      await splitExpense(expense.id, { count: valid.count, frequency: valid.frequency, startsOn: valid.startsOn });
      addToast({ messageType: "success", text: `Lançamento dividido em ${valid.count} parcelas` });
      onOpenChange(false);
      onDone?.();
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
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Parcelar lançamento</DialogTitle>
          <DialogDescription>
            {formatCurrency(expense.amountBrl)} vira parcelas. A primeira fica com este lançamento e com os anexos dele.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 sm:grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid gap-1.5">
              <Label htmlFor="split-count">Parcelas</Label>
              <Input
                id="split-count"
                type="number"
                inputMode="numeric"
                min={MIN_INSTALLMENTS}
                max={MAX_INSTALLMENTS}
                value={fields.count}
                onChange={(e) => patch({ count: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="split-first">Primeira parcela vence</Label>
              <Input
                id="split-first"
                type="date"
                value={fields.firstDue}
                onChange={(e) => patch({ firstDue: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <div className="col-span-2 grid gap-1.5 sm:col-span-1">
              <Label htmlFor="split-interval">Intervalo</Label>
              <Select value={fields.frequency} onValueChange={(v) => patch({ frequency: v as SeriesFrequency })}>
                <SelectTrigger id="split-interval" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">mensal</SelectItem>
                  <SelectItem value="weekly">semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {valid ? <InstallmentPreview repeat={valid} amount={expense.amountBrl} /> : null}
          {typeof repeat === "string" ? <p className="text-xs text-ink-soft">{repeat}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" className="min-h-11 md:min-h-9" disabled={busy || !valid}>
              <Split aria-hidden />
              {valid ? `Parcelar em ${valid.count}` : "Parcelar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
