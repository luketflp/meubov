"use client";

import { useState, type FormEvent } from "react";
import { Archive } from "lucide-react";
import type { Lot, LotPlacement } from "@/lib/types";
import { addDays, formatDate, todayISO } from "@/lib/domain/dates";
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

export function ArchiveLotDialog({
  lot,
  currentPlacement,
}: {
  lot: Lot;
  currentPlacement: LotPlacement;
}) {
  const archiveLot = useHerdStore((state) => state.archiveLot);
  const [open, setOpen] = useState(false);
  const [endedOn, setEndedOn] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorId = `archive-lot-error-${lot.id}`;
  const earliestEndDate = addDays(currentPlacement.startedOn, 1);
  const canEndByToday = earliestEndDate <= todayISO();

  function onOpenChange(next: boolean) {
    if (saving) return;
    if (next) {
      setEndedOn(todayISO());
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (endedOn > todayISO()) {
      setError("O encerramento não pode ser registrado no futuro.");
      return;
    }
    if (endedOn <= currentPlacement.startedOn) {
      setError(
        `Use uma data posterior a ${formatDate(currentPlacement.startedOn)}, quando a posição atual começou.`
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await archiveLot(lot.id, { endedOn });
      setOpen(false);
    } catch {
      setError(
        "Não foi possível encerrar. Confira se o lote ainda está vazio e tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="min-h-9 text-ink-soft">
          <Archive aria-hidden />
          Encerrar lote
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Encerrar {lot.name}</DialogTitle>
          <DialogDescription>
            Use quando este grupo não será mais usado. O lote deixa de ocupar a
            invernada, mas todo o histórico permanece registrado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`archive-lot-date-${lot.id}`}>Data de encerramento</Label>
            <Input
              id={`archive-lot-date-${lot.id}`}
              type="date"
              min={earliestEndDate}
              max={todayISO()}
              value={endedOn}
              onChange={(event) => setEndedOn(event.target.value)}
              aria-describedby={error ? errorId : undefined}
              className="min-h-11 font-mono"
            />
            {!canEndByToday ? (
              <p className="text-xs text-attention">
                A posição atual começou hoje; o encerramento precisa ter uma
                data posterior.
              </p>
            ) : null}
          </div>

          {error ? (
            <p id={errorId} role="alert" className="text-sm text-overdue">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                className="min-h-11"
              >
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={saving || !canEndByToday}
              className="min-h-11"
            >
              {saving ? "Encerrando…" : "Confirmar encerramento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
