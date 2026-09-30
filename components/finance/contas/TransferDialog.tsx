"use client";

/**
 * "Transferir entre contas": money moving from one conta to another — a
 * saque, an aplicação, the payment of a fatura. It never enters the
 * resultado. A cartão is only ever Para (its fatura being paid). A sheet from
 * the bottom on the phone.
 */
import { useState, type FormEvent } from "react";
import { ArrowLeftRight, XIcon } from "lucide-react";
import type { BankAccount } from "@/lib/types";
import { accountBalance, bankAccountLabel, cents } from "@/lib/domain/bankAccounts";
import { todayISO } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The Dialog pinned to the bottom of the screen on a phone, centred from md up. */
export const PHONE_SHEET =
  "max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:w-full max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]";

export function TransferDialog({
  open,
  onOpenChange,
  defaultFromId,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  defaultFromId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={`max-h-[90dvh] overflow-y-auto sm:max-w-md ${PHONE_SHEET}`}>
        <DialogClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-1 right-1 size-11 md:top-2 md:right-2 md:size-8">
            <XIcon aria-hidden />
            <span className="sr-only">Fechar</span>
          </Button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Transferir entre contas</DialogTitle>
          <DialogDescription>Não entra no resultado: é dinheiro mudando de lugar.</DialogDescription>
        </DialogHeader>
        <TransferForm defaultFromId={defaultFromId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TransferForm({ defaultFromId, onDone }: { defaultFromId?: string; onDone(): void }) {
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const expenses = useHerdStore((s) => s.expenses);
  const movements = useHerdStore((s) => s.movements);
  const transfers = useHerdStore((s) => s.transfers);
  const addTransfer = useHerdStore((s) => s.addTransfer);
  const { addToast } = useToast();
  const active = bankAccounts.filter((a) => a.archivedAt === undefined);
  // Money never leaves a cartão by transferência: it only receives its fatura.
  const sources = active.filter((a) => a.kind !== "card");
  const firstFrom = sources.find((a) => a.id === defaultFromId) ?? sources.find((a) => a.isMain) ?? sources[0];
  const [fromId, setFromId] = useState(firstFrom?.id ?? "");
  const [toId, setToId] = useState(active.find((a) => a.id !== firstFrom?.id)?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const value = parseAmount(amount);
  const from = active.find((a) => a.id === fromId);
  const to = active.find((a) => a.id === toId);
  const inputs = { expenses, movements, transfers };
  const ready = from !== undefined && to !== undefined && Number.isFinite(value) && value > 0 && date !== "";
  const preview = !ready
    ? null
    : to.kind === "card"
      ? `O cartão fica com ${formatCurrency(cents(-accountBalance(to, inputs, date) - value) + 0)} a pagar · o saldo em contas baixa ${formatCurrency(value)}.`
      : `${from.name} fica com ${formatCurrency(cents(accountBalance(from, inputs, date) - value))} · o saldo em contas não muda.`;

  const pickFrom = (id: string) => {
    setFromId(id);
    if (id === toId) setToId(active.find((a) => a.id !== id)?.id ?? "");
  };

  const option = (a: BankAccount) => (
    <SelectItem key={a.id} value={a.id}>
      {bankAccountLabel(a)}
    </SelectItem>
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to) return setError("Escolha as duas contas.");
    if (from.id === to.id) return setError("Escolha contas diferentes.");
    if (!Number.isFinite(value) || value <= 0) return setError("Informe o valor (maior que zero).");
    if (date === "") return setError("Informe a data.");
    setError(null);
    setBusy(true);
    try {
      await addTransfer({ fromId: from.id, toId: to.id, date, amountBrl: value, notes: notes.trim() || undefined });
      addToast({ messageType: "success", text: "Transferência registrada" });
      onDone();
    } catch {
      // apiFail already toasted
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="transfer-from">De</Label>
        <Select value={fromId} onValueChange={pickFrom}>
          <SelectTrigger id="transfer-from" className="min-h-11 w-full">
            <SelectValue placeholder="Escolha a conta" />
          </SelectTrigger>
          <SelectContent>{sources.map(option)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="transfer-to">Para</Label>
        <Select value={toId} onValueChange={setToId}>
          <SelectTrigger id="transfer-to" className="min-h-11 w-full">
            <SelectValue placeholder="Escolha a conta" />
          </SelectTrigger>
          <SelectContent>{active.filter((a) => a.id !== fromId).map(option)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-amount">Valor (R$)</Label>
          <Input
            id="transfer-amount"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-h-11 font-mono"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-date">Data</Label>
          <Input
            id="transfer-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-11 font-mono"
          />
        </div>
      </div>
      {preview ? <p className="-mt-1 text-xs text-ink-soft">{preview}</p> : null}
      <div className="grid gap-1.5">
        <Label htmlFor="transfer-notes">Observação (opcional)</Label>
        <Input id="transfer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-11" />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}
      <DialogFooter className="max-md:flex-col-reverse max-md:gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11 max-md:w-full md:min-h-9" disabled={busy}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11 max-md:w-full md:min-h-9" disabled={busy}>
          <ArrowLeftRight aria-hidden />
          {Number.isFinite(value) && value > 0 ? `Transferir ${formatCurrency(value)}` : "Transferir"}
        </Button>
      </DialogFooter>
    </form>
  );
}
