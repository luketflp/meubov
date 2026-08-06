"use client";

/**
 * Modal shown before the chute of a venda per arroba opens: the rendimento de
 * carcaça agreed with the frigorífico. The R$/@ pays carcass arrobas (peso vivo
 * × rendimento ÷ 15), so no animal can pass before the yield is set; reopening
 * the modal to correct it reprices the animals already recorded.
 */
import { useState, type FormEvent } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { carcassArrobas, DEFAULT_CARCASS_YIELD_PCT } from "@/lib/domain/weights";
import { formatArroba, formatCurrency, formatNumber } from "@/lib/domain/format";

interface SaleYieldDialogProps {
  sessionId: string;
  pricePerArroba: number;
  /** Current yield of the session — set when the modal reopens to correct it. */
  carcassYieldPct?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Weight of the example line, a typical finished steer. */
const EXAMPLE_KG = 480;

export function SaleYieldDialog({
  sessionId,
  pricePerArroba,
  carcassYieldPct,
  open,
  onOpenChange,
}: SaleYieldDialogProps) {
  const setSaleCarcassYield = useHerdStore((s) => s.setSaleCarcassYield);
  const [raw, setRaw] = useState(
    carcassYieldPct !== undefined
      ? String(carcassYieldPct).replace(".", ",")
      : String(DEFAULT_CARCASS_YIELD_PCT)
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const typed = Number(raw.replace(",", "."));
  const valid = raw.trim() !== "" && Number.isFinite(typed) && typed > 0 && typed <= 100;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!valid) {
      setError("Informe o rendimento em % (maior que 0, até 100).");
      return;
    }
    setBusy(true);
    try {
      await setSaleCarcassYield(sessionId, typed);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Rendimento de carcaça</DialogTitle>
            <DialogDescription>
              O preço de {formatCurrency(pricePerArroba)}/@ paga as arrobas de
              carcaça: peso vivo × rendimento ÷ 15. Informe o rendimento
              combinado com o comprador antes de começar a passar os animais.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="sale-yield">Rendimento (%)</Label>
            <Input
              id="sale-yield"
              inputMode="decimal"
              autoFocus
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setError(null);
              }}
              placeholder="Ex.: 48,5"
              aria-invalid={error ? true : undefined}
              className="min-h-11 font-mono text-lg"
            />
            {error ? <p className="text-xs text-overdue">{error}</p> : null}
            {valid ? (
              <p className="text-xs text-ink-soft">
                Ex.: um animal de {formatNumber(EXAMPLE_KG)} kg rende{" "}
                {formatArroba(carcassArrobas(EXAMPLE_KG, typed))} ={" "}
                {formatCurrency(carcassArrobas(EXAMPLE_KG, typed) * pricePerArroba)}.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy} className="min-h-11">
              {carcassYieldPct !== undefined ? "Atualizar rendimento" : "Começar a venda"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
