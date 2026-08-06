"use client";

/**
 * Corrects the name of a logical cattle group. Physical pasture data belongs
 * to the invernada and is edited separately.
 */
import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { useHerdStore, type LotPatch } from "@/lib/store/useHerdStore";
import type { Lot } from "@/lib/types";
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

export function EditLotDialog({ lot }: { lot: Lot }) {
  const updateLot = useHerdStore((s) => s.updateLot);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(lot.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function onOpenChange(next: boolean) {
    // Reopening shows what is stored now, never the last abandoned attempt.
    if (next) {
      setName(lot.name);
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName === "") {
      setError("Informe o nome do lote.");
      return;
    }
    const patch: LotPatch = {};
    if (cleanName !== lot.name) patch.name = cleanName;
    if (lot.needsReview) patch.needsReview = false;
    // Nothing changed: the server answers 422 to an empty patch, so just close.
    if (Object.keys(patch).length === 0) {
      setOpen(false);
      return;
    }

    setSaving(true);
    try {
      await updateLot(lot.id, patch);
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === "duplicate_lot_name"
          ? "Já existe um lote com esse nome."
          : "Não foi possível salvar. Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Editar lote ${lot.name}`}
          className="min-h-11 min-w-11 text-ink-soft hover:text-ink md:min-h-7 md:min-w-7"
        >
          <Pencil aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar lote</DialogTitle>
          <DialogDescription>
            {lot.needsReview
              ? "Confirme ou corrija o nome deste grupo migrado."
              : "Corrija o nome usado para identificar este grupo de animais."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-lot-name">Nome</Label>
            <Input
              id="edit-lot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Novilhas 2025"
              className="min-h-11"
            />
          </div>
          {error ? <p className="text-xs text-overdue">{error}</p> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving} className="min-h-11">
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
