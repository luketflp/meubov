"use client";

/**
 * "Editar lote" dialog on the Lots screen: corrects the name, capim and
 * hectares of a lot already registered. Only the changed fields travel, so the
 * pasture outline drawn on the map (`Lot.boundary`) is never touched — there is
 * no way to redraw one yet, so nothing here may erase it.
 *
 * Hectares is more than a record: it is the denominator of the stocking rate,
 * so a lot created on the fly by the herd import — which lands with a
 * placeholder area — reports a wrong UA/ha until it is corrected here.
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
  const [grass, setGrass] = useState(lot.grass);
  const [hectares, setHectares] = useState(String(lot.hectares));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function onOpenChange(next: boolean) {
    // Reopening shows what is stored now, never the last abandoned attempt.
    if (next) {
      setName(lot.name);
      setGrass(lot.grass);
      setHectares(String(lot.hectares));
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanGrass = grass.trim();
    const hectaresNumber = Number(hectares.replace(",", "."));
    if (cleanName === "") {
      setError("Informe o nome do lote.");
      return;
    }
    if (cleanGrass === "") {
      setError("Informe o capim do lote.");
      return;
    }
    if (!Number.isFinite(hectaresNumber) || hectaresNumber <= 0) {
      setError("Hectares deve ser um número maior que zero.");
      return;
    }

    const patch: LotPatch = {};
    if (cleanName !== lot.name) patch.name = cleanName;
    if (cleanGrass !== lot.grass) patch.grass = cleanGrass;
    if (hectaresNumber !== lot.hectares) patch.hectares = hectaresNumber;
    // Nothing changed: the server answers 422 to an empty patch, so just close.
    if (Object.keys(patch).length === 0) {
      setOpen(false);
      return;
    }

    setSaving(true);
    try {
      await updateLot(lot.id, patch);
      setOpen(false);
    } catch {
      // The store already raised the failure toast; keeping the dialog open is
      // what saves the typed values from disappearing with it.
      setError("Não foi possível salvar. Tente novamente.");
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
            Corrija o nome, o capim e a área. A área alimenta a taxa de lotação
            (UA/ha) do lote.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-lot-name">Nome</Label>
            <Input
              id="edit-lot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Lote da Sede"
              className="min-h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-lot-grass">Capim</Label>
            <Input
              id="edit-lot-grass"
              value={grass}
              onChange={(e) => setGrass(e.target.value)}
              placeholder="Ex.: Braquiária, Mombaça…"
              className="min-h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-lot-hectares">Hectares</Label>
            <Input
              id="edit-lot-hectares"
              value={hectares}
              onChange={(e) => setHectares(e.target.value)}
              placeholder="Ex.: 42"
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
              className="min-h-11 font-mono"
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
