"use client";

/**
 * The Extrato's "Conta" on a venda or compra: which conta its money went
 * through. A manejo registers it on the conta principal; this changes it.
 */
import { useState } from "react";
import type { LedgerRow } from "@/lib/domain/ledger";
import { bankAccountLabel, payingAccounts } from "@/lib/domain/bankAccounts";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Select value for "Sem conta": Radix refuses "". */
const NONE = "none";

export function MovementAccountDialog({
  row,
  onOpenChange,
  onDone,
}: {
  row: LedgerRow;
  onOpenChange(open: boolean): void;
  onDone?: () => void;
}) {
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const setMovementBankAccount = useHerdStore((s) => s.setMovementBankAccount);
  const { addToast } = useToast();
  const [value, setValue] = useState(row.bankAccountId ?? NONE);
  const [busy, setBusy] = useState(false);
  // A venda or compra de gado moves through a conta corrente or the caixa, as a receita does: never a cartão or an aplicação.
  const options = payingAccounts(bankAccounts, "revenue");
  const current = bankAccounts.find((a) => a.id === row.bankAccountId);
  const shown = current && !options.includes(current) ? [...options, current] : options;
  const sale = row.kind === "sale";

  async function save() {
    setBusy(true);
    try {
      await setMovementBankAccount(row.id, value === NONE ? null : value);
      addToast({ messageType: "success", text: "Conta salva" });
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{sale ? "Conta da venda" : "Conta da compra"}</DialogTitle>
          <DialogDescription>
            {sale ? "Em que conta o dinheiro da venda entrou?" : "De que conta saiu o dinheiro da compra?"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="movement-account">Conta</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id="movement-account" className="min-h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem conta</SelectItem>
              {shown.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {bankAccountLabel(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" className="min-h-11 md:min-h-9" disabled={busy} onClick={() => void save()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
