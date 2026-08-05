"use client";

/**
 * Where a finished trace becomes a lot: either the outline of a lot that is
 * already registered but was never drawn, or a brand-new one.
 *
 * The measured area prefills `hectares` for a new lot but stays editable —
 * the area in the escritura or the CAR is legitimately different from the one
 * traced over satellite, and the farmer decides which number is true. For a
 * lot that already exists, only the outline is written: its declared area is
 * left alone, and reconciling the two is a separate, explicit step.
 */
import { useState, type FormEvent } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { ringAreaHectares, type Ring } from "@/lib/domain/geo";
import { formatNumber } from "@/lib/domain/format";
import type { Lot } from "@/lib/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NEW_LOT = "__new__";

/**
 * Mounted only while a closed ring is waiting to be saved, so every trace gets
 * a fresh form straight from props — no effect resetting state after the fact.
 */
export function SaveBoundaryDialog({
  ring,
  undrawnLots,
  onSaved,
  onCancel,
}: {
  /** The traced outline. */
  ring: Ring;
  /** Lots already registered that have no outline yet. */
  undrawnLots: Lot[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const addLot = useHerdStore((s) => s.addLot);
  const updateLot = useHerdStore((s) => s.updateLot);

  const measured = ringAreaHectares(ring);

  const [target, setTarget] = useState<string>(
    undrawnLots.length > 0 ? undrawnLots[0].id : NEW_LOT
  );
  const [name, setName] = useState("");
  const [grass, setGrass] = useState("");
  const [hectares, setHectares] = useState(() => String(Number(measured.toFixed(1))));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (target !== NEW_LOT) {
      setSaving(true);
      try {
        await updateLot(target, { boundary: ring });
        onSaved();
      } catch {
        setError("Não foi possível salvar o contorno. Tente novamente.");
      } finally {
        setSaving(false);
      }
      return;
    }

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
      await addLot({
        name: cleanName,
        grass: cleanGrass,
        hectares: hectaresNumber,
        boundary: ring,
      });
      onSaved();
    } catch {
      // Keep the dialog open: the trace only exists here until this succeeds.
      setError("Não foi possível criar o lote. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Salvar contorno</DialogTitle>
          <DialogDescription>
            Área desenhada: {formatNumber(measured, 1)} ha. Escolha o lote a que
            esta cerca pertence.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="boundary-target">Lote</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="boundary-target" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {undrawnLots.map((lot) => (
                  <SelectItem key={lot.id} value={lot.id}>
                    {lot.name} · {formatNumber(lot.hectares)} ha
                  </SelectItem>
                ))}
                <SelectItem value={NEW_LOT}>Cadastrar um novo lote…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {target === NEW_LOT ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="boundary-name">Nome</Label>
                <Input
                  id="boundary-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Lote da Sede"
                  className="min-h-11"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="boundary-grass">Capim</Label>
                <Input
                  id="boundary-grass"
                  value={grass}
                  onChange={(e) => setGrass(e.target.value)}
                  placeholder="Ex.: Braquiária, Mombaça…"
                  className="min-h-11"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="boundary-hectares">Hectares</Label>
                <Input
                  id="boundary-hectares"
                  value={hectares}
                  onChange={(e) => setHectares(e.target.value)}
                  type="number"
                  min={0}
                  step="0.1"
                  inputMode="decimal"
                  className="min-h-11 font-mono"
                />
                <p className="text-xs text-ink-soft">
                  Medido no mapa: {formatNumber(measured, 1)} ha. Ajuste se a
                  área da escritura for outra.
                </p>
              </div>
            </>
          ) : null}

          {error ? <p className="text-xs text-overdue">{error}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="min-h-11"
            >
              Descartar
            </Button>
            <Button type="submit" disabled={saving} className="min-h-11">
              {saving ? "Salvando…" : "Salvar contorno"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
