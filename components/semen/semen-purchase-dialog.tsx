"use client";

/**
 * "Registrar compra": doses of one semen bull bought from a central or a
 * revenda. The bull is fixed on top with the doses it has now, and a live line
 * says what each dose costs and where the stock goes once the purchase is in.
 * The purchase also lands in Financeiro as a Reprodução expense of its total.
 *
 * The four purchase inputs and the reading of what was typed are exported:
 * "Novo touro" takes the first purchase with the same fields and messages.
 *
 * One trigger per place: a compact button in the Touros table row, a
 * full-width one at the foot of the phone card, the primary action of the
 * bull's page.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { SemenBull } from "@/lib/types";
import { useHerdStore, type NewSemenPurchase } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { todayISO } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { MonoDoses } from "@/components/semen/stock-pill";
import { useSemenStock } from "@/components/semen/use-semen-stock";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The purchase as typed: every input keeps its text until the submit reads it. */
export interface PurchaseFields {
  date: string;
  doses: string;
  total: string;
  seller: string;
}

/** A blank purchase dated today. */
export function createPurchaseFields(): PurchaseFields {
  return { date: todayISO(), doses: "", total: "", seller: "" };
}

/** Doses typed as a whole number of at least one; null otherwise. */
function parseDoses(text: string): number | null {
  const doses = Number(text.trim());
  return text.trim() !== "" && Number.isInteger(doses) && doses >= 1 ? doses : null;
}

/** Valor total typed in reais, above zero ("1200", "1200,50"); null otherwise. */
function parseTotal(text: string): number | null {
  const total = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(total) && total > 0 ? total : null;
}

/**
 * True once doses, valor total or fornecedor was typed. The date starts on
 * today, so on its own it does not make a purchase.
 */
export function purchaseStarted(fields: PurchaseFields): boolean {
  return [fields.doses, fields.total, fields.seller].some((text) => text.trim() !== "");
}

/** What the purchase inputs hold: the purchase to send, or the message to show. */
export type PurchaseReading =
  | { purchase: NewSemenPurchase; error: null }
  | { purchase: null; error: string };

/** Reads the typed purchase, naming the first field that is missing or invalid. */
export function readPurchase(fields: PurchaseFields): PurchaseReading {
  const doses = parseDoses(fields.doses);
  if (doses === null) return { purchase: null, error: "Informe as doses." };
  const totalBrl = parseTotal(fields.total);
  if (totalBrl === null) return { purchase: null, error: "Informe o valor total." };
  if (!ISO_DATE_PATTERN.test(fields.date)) {
    return { purchase: null, error: "Informe a data da compra." };
  }
  const seller = fields.seller.trim();
  return {
    purchase: { date: fields.date, doses, totalBrl, seller: seller === "" ? undefined : seller },
    error: null,
  };
}

interface PurchaseInputsProps {
  /** Prefix of the input ids, unique per dialog. */
  idPrefix: string;
  fields: PurchaseFields;
  onChange: (patch: Partial<PurchaseFields>) => void;
  /** Note under the Valor total input. */
  totalHint?: ReactNode;
}

/** Data, Doses, Valor total (R$) and Fornecedor, two by two. */
export function PurchaseInputs({ idPrefix, fields, onChange, totalHint }: PurchaseInputsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-date`}>Data</Label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={fields.date}
          onChange={(e) => onChange({ date: e.target.value })}
          className="min-h-11 font-mono"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-doses`}>Doses</Label>
        <Input
          id={`${idPrefix}-doses`}
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={fields.doses}
          onChange={(e) => onChange({ doses: e.target.value })}
          className="min-h-11 font-mono"
        />
      </div>

      <div className="grid content-start gap-1.5">
        <Label htmlFor={`${idPrefix}-total`}>Valor total (R$)</Label>
        <Input
          id={`${idPrefix}-total`}
          type="number"
          min={0.01}
          step="0.01"
          inputMode="decimal"
          value={fields.total}
          onChange={(e) => onChange({ total: e.target.value })}
          className="min-h-11 font-mono"
        />
        {totalHint ? <p className="text-xs text-ink-soft">{totalHint}</p> : null}
      </div>

      <div className="grid content-start gap-1.5">
        <Label htmlFor={`${idPrefix}-seller`}>Fornecedor</Label>
        <Input
          id={`${idPrefix}-seller`}
          value={fields.seller}
          onChange={(e) => onChange({ seller: e.target.value })}
          placeholder="Ex.: central, revenda…"
          className="min-h-11"
        />
      </div>
    </div>
  );
}

interface PurchaseFormProps {
  bull: SemenBull;
  /** Called once the purchase is stored; the dialog closes. */
  onRegistered: () => void;
}

/**
 * The dialog's body. It mounts on every open, so the purchase starts blank (the
 * next one is rarely the same as the last) and the bull's doses are counted
 * only while the dialog is open — the Touros table renders one per bull.
 */
function PurchaseForm({ bull, onRegistered }: PurchaseFormProps) {
  const addSemenPurchase = useHerdStore((s) => s.addSemenPurchase);
  const { dosesLeft } = useSemenStock();
  const { addToast } = useToast();

  const [fields, setFields] = useState<PurchaseFields>(createPurchaseFields);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const left = dosesLeft(bull.id);
  const doses = parseDoses(fields.doses);
  const total = parseTotal(fields.total);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reading = readPurchase(fields);
    if (reading.error !== null) {
      setError(reading.error);
      return;
    }
    setSaving(true);
    try {
      await addSemenPurchase(bull.id, reading.purchase);
      addToast({ messageType: "success", text: "Compra registrada" });
      onRegistered();
    } catch {
      // The store already told the farmer; the dialog stays open to try again.
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="rounded-lg border border-hairline bg-surface px-3 py-2.5">
        <p className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">Touro</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="font-medium text-ink">{bull.name}</span>
          {bull.code ? <span className="font-mono text-ink-soft">{bull.code}</span> : null}
          <span className="ml-auto text-ink-soft">
            <MonoDoses doses={left} className="text-ink" /> em estoque
          </span>
        </div>
      </div>

      <PurchaseInputs
        idPrefix="semen-purchase"
        fields={fields}
        onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
      />

      <div className="grid gap-1">
        {doses !== null ? (
          <p className="text-sm text-ink-soft">
            {total !== null ? (
              <>
                <span className="font-mono text-ink">{formatCurrency(total / doses)}</span> por
                dose ·{" "}
              </>
            ) : null}
            estoque passa a <MonoDoses doses={left + doses} className="text-ink" />
          </p>
        ) : null}
        <p className="text-xs text-ink-soft">Vira despesa de Reprodução no Financeiro</p>
      </div>

      {error ? <p className="text-xs text-overdue">{error}</p> : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={saving} className="min-h-11">
          Registrar compra
        </Button>
      </DialogFooter>
    </form>
  );
}

interface SemenPurchaseDialogProps {
  bull: SemenBull;
  /** "row" sits in a table cell, "card" spans the phone card, "header" is the page's primary action. */
  variant: "row" | "card" | "header";
}

export function SemenPurchaseDialog({ bull, variant }: SemenPurchaseDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "header" ? (
          <Button className="min-h-11">
            <Plus data-icon="inline-start" aria-hidden />
            Registrar compra
          </Button>
        ) : variant === "row" ? (
          <Button
            variant="outline"
            size="sm"
            aria-label={`Registrar compra de ${bull.name}`}
            className="min-h-11 md:min-h-0"
          >
            <Plus data-icon="inline-start" aria-hidden />
            Registrar compra
          </Button>
        ) : (
          <Button
            variant="outline"
            aria-label={`Registrar compra de ${bull.name}`}
            className="mt-3 min-h-11 w-full"
          >
            Registrar compra
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar compra</DialogTitle>
          <DialogDescription>As doses compradas entram no estoque deste touro.</DialogDescription>
        </DialogHeader>

        <PurchaseForm bull={bull} onRegistered={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
