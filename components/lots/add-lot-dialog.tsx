"use client";

/**
 * "Novo lote" dialog on the Lots screen: registers a lot (paddock)
 * right where the farmer watches occupancy, instead of only in Settings.
 * Same store action (addLot) and validation rules as the Settings form.
 */
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
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

export function AddLotDialog() {
  const addLot = useHerdStore((s) => s.addLot);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [grass, setGrass] = useState("");
  const [hectares, setHectares] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) {
      setName("");
      setGrass("");
      setHectares("");
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
    setSaving(true);
    try {
      await addLot({ name: cleanName, grass: cleanGrass, hectares: hectaresNumber });
      setOpen(false);
    } catch {
      // The store already raised the failure toast; keeping the dialog open is
      // what saves the typed values from disappearing with it.
      setError("Não foi possível cadastrar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11">
          <Plus aria-hidden />
          Novo lote
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo lote</DialogTitle>
          <DialogDescription>
            Cadastre o lote para acompanhar a ocupação e transferir animais.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="lot-name">Nome</Label>
            <Input
              id="lot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Lote da Sede"
              className="min-h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lot-grass">Capim</Label>
            <Input
              id="lot-grass"
              value={grass}
              onChange={(e) => setGrass(e.target.value)}
              placeholder="Ex.: Braquiária, Mombaça…"
              className="min-h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lot-hectares">Hectares</Label>
            <Input
              id="lot-hectares"
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
              {saving ? "Cadastrando…" : "Cadastrar lote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
