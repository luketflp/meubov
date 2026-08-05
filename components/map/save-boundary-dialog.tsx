"use client";

/**
 * Where a finished trace becomes an invernada: either the outline of one that is
 * already registered, or a brand-new one. Normal drawing offers undrawn
 * invernadas; typed coordinates may also offer the selected drawn invernada so
 * its outline can be deliberately replaced.
 *
 * The measured area prefills `hectares` for a new invernada but stays editable —
 * the area in the escritura or the CAR is legitimately different from the one
 * traced over satellite, and the farmer decides which number is true. For a
 * invernada that already exists, only the outline is written: its declared area is
 * left alone, and reconciling the two is a separate, explicit step.
 */
import { useState, type FormEvent } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { ringAreaHectares, type Ring } from "@/lib/domain/geo";
import { formatNumber } from "@/lib/domain/format";
import type { Invernada } from "@/lib/types";
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

const NEW_INVERNADA = "__new__";

function invernadaLabel(invernada: Pick<Invernada, "code" | "name">): string {
  return invernada.name
    ? `Invernada ${invernada.code} · ${invernada.name}`
    : `Invernada ${invernada.code}`;
}

/**
 * Mounted only while a closed ring is waiting to be saved, so every trace gets
 * a fresh form straight from props — no effect resetting state after the fact.
 */
export function SaveBoundaryDialog({
  ring,
  targetInvernadas,
  initialTargetId,
  onSaved,
  onCancel,
}: {
  /** The traced outline. */
  ring: Ring;
  /** Registered invernadas this trace may be attached to. */
  targetInvernadas: Invernada[];
  /** Preferred target captured when drawing/coordinate entry began. */
  initialTargetId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const addInvernada = useHerdStore((s) => s.addInvernada);
  const updateInvernada = useHerdStore((s) => s.updateInvernada);

  const measured = ringAreaHectares(ring);

  const [target, setTarget] = useState<string>(() => {
    if (
      initialTargetId &&
      targetInvernadas.some((invernada) => invernada.id === initialTargetId)
    ) {
      return initialTargetId;
    }
    return targetInvernadas[0]?.id ?? NEW_INVERNADA;
  });
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [grass, setGrass] = useState("");
  const [hectares, setHectares] = useState(() => String(Number(measured.toFixed(1))));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorId = "boundary-save-error";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (target !== NEW_INVERNADA) {
      setSaving(true);
      try {
        await updateInvernada(target, { boundary: ring });
        onSaved();
      } catch {
        setError("Não foi possível salvar o contorno. Tente novamente.");
      } finally {
        setSaving(false);
      }
      return;
    }

    const cleanCode = code.trim();
    const cleanName = name.trim();
    const cleanGrass = grass.trim();
    const hectaresNumber = Number(hectares.replace(",", "."));
    if (cleanCode === "") {
      setError("Informe o número ou código da invernada.");
      return;
    }
    if (cleanGrass === "") {
      setError("Informe o capim da invernada.");
      return;
    }
    if (!Number.isFinite(hectaresNumber) || hectaresNumber <= 0) {
      setError("Hectares deve ser um número maior que zero.");
      return;
    }

    setSaving(true);
    try {
      await addInvernada({
        code: cleanCode,
        ...(cleanName === "" ? {} : { name: cleanName }),
        grass: cleanGrass,
        hectares: hectaresNumber,
        boundary: ring,
      });
      onSaved();
    } catch {
      // Keep the dialog open: the trace only exists here until this succeeds.
      setError("Não foi possível criar a invernada. Confira se o código já existe.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Salvar contorno</DialogTitle>
          <DialogDescription>
            Área desenhada: {formatNumber(measured, 1)} ha. Escolha a invernada a
            que esta cerca pertence.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="boundary-target">Invernada</Label>
            <Select value={target} onValueChange={setTarget} disabled={saving}>
              <SelectTrigger
                id="boundary-target"
                aria-describedby={error ? errorId : undefined}
                className="min-h-11 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targetInvernadas.map((invernada) => (
                  <SelectItem key={invernada.id} value={invernada.id}>
                    {invernadaLabel(invernada)} · {formatNumber(invernada.hectares)} ha
                    {invernada.boundary ? " · substituir contorno" : ""}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_INVERNADA}>Cadastrar uma nova invernada…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {target === NEW_INVERNADA ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="boundary-code">Número ou código</Label>
                <Input
                  id="boundary-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-describedby={error ? errorId : undefined}
                  disabled={saving}
                  placeholder="Ex.: 03 ou 3A"
                  className="min-h-11 font-mono"
                  autoCapitalize="characters"
                />
                <p className="text-xs text-ink-soft">
                  Identifica esta área física e não muda quando os lotes se movem.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="boundary-name">Nome (opcional)</Label>
                <Input
                  id="boundary-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-describedby={error ? errorId : undefined}
                  disabled={saving}
                  placeholder="Ex.: Sede"
                  className="min-h-11"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="boundary-grass">Capim</Label>
                <Input
                  id="boundary-grass"
                  value={grass}
                  onChange={(e) => setGrass(e.target.value)}
                  aria-describedby={error ? errorId : undefined}
                  disabled={saving}
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
                  aria-describedby={error ? errorId : undefined}
                  disabled={saving}
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

          {error ? (
            <p id={errorId} role="alert" className="text-xs text-overdue">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={saving}
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
