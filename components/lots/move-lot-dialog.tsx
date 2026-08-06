"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowRightLeft, History } from "lucide-react";
import type { Invernada, Lot } from "@/lib/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const invernadaLabel = (invernada: Invernada): string =>
  `${invernada.code}${invernada.name ? ` · ${invernada.name}` : ""}`;

export function MoveLotDialog({
  lot,
  currentInvernada,
}: {
  lot: Lot;
  currentInvernada: Invernada | null;
}) {
  const invernadas = useHerdStore((state) => state.invernadas);
  const placements = useHerdStore((state) => state.lotPlacements);
  const moveLot = useHerdStore((state) => state.moveLot);

  const [open, setOpen] = useState(false);
  const [invernadaId, setInvernadaId] = useState("");
  const [startedOn, setStartedOn] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorId = `move-lot-error-${lot.id}`;

  const destinations = invernadas.filter((item) => item.id !== currentInvernada?.id);
  const history = useMemo(
    () =>
      placements
        .filter((placement) => placement.lotId === lot.id)
        .sort((a, b) =>
          a.startedOn === b.startedOn ? a.id.localeCompare(b.id) : b.startedOn.localeCompare(a.startedOn)
        ),
    [placements, lot.id]
  );
  const invernadaById = useMemo(
    () => new Map(invernadas.map((item) => [item.id, item])),
    [invernadas]
  );
  const currentPlacement = history.find((placement) => !placement.endedOn) ?? null;
  const archived = currentPlacement === null;
  const earliestMoveDate = currentPlacement
    ? addDays(currentPlacement.startedOn, 1)
    : undefined;
  const canMoveByToday =
    earliestMoveDate === undefined || earliestMoveDate <= todayISO();

  function onOpenChange(next: boolean) {
    if (saving) return;
    if (next) {
      setInvernadaId(destinations[0]?.id ?? "");
      setStartedOn(todayISO());
      setNotes("");
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invernadaId === "") {
      setError("Selecione a invernada de destino.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startedOn)) {
      setError("Informe a data da movimentação.");
      return;
    }
    if (startedOn > todayISO()) {
      setError("A movimentação não pode ser registrada no futuro.");
      return;
    }
    if (currentPlacement && startedOn <= currentPlacement.startedOn) {
      setError(
        `Use uma data posterior a ${formatDate(currentPlacement.startedOn)}, quando a posição atual começou.`
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const cleanNotes = notes.trim();
      await moveLot(lot.id, {
        invernadaId,
        startedOn,
        notes: cleanNotes === "" ? undefined : cleanNotes,
      });
      setOpen(false);
    } catch {
      setError("Não foi possível mover o lote. Confira a data e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="min-h-9">
          {archived ? <History aria-hidden /> : <ArrowRightLeft aria-hidden />}
          {archived ? "Ver histórico" : "Mover lote"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{archived ? `Histórico de ${lot.name}` : `Mover ${lot.name}`}</DialogTitle>
          <DialogDescription>
            {archived
              ? "Este lote está encerrado e não ocupa mais uma invernada."
              : "O lote inteiro muda de invernada. Os animais continuam pertencendo ao mesmo lote."}
          </DialogDescription>
        </DialogHeader>

        {!archived ? (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <div className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm">
              <span className="text-ink-soft">Invernada atual: </span>
              <span className="font-medium text-ink">
                {currentInvernada ? invernadaLabel(currentInvernada) : "Sem invernada"}
              </span>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`move-lot-destination-${lot.id}`}>
                Invernada de destino
              </Label>
              <Select value={invernadaId || undefined} onValueChange={setInvernadaId}>
                <SelectTrigger
                  id={`move-lot-destination-${lot.id}`}
                  aria-describedby={error ? errorId : undefined}
                  className="min-h-11 w-full"
                >
                  <SelectValue placeholder="Selecione a invernada" />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map((invernada) => (
                    <SelectItem key={invernada.id} value={invernada.id}>
                      {invernadaLabel(invernada)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {destinations.length === 0 ? (
                <p className="text-xs text-attention">
                  Cadastre outra invernada antes de mover este lote.
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`move-lot-date-${lot.id}`}>Data</Label>
              <Input
                id={`move-lot-date-${lot.id}`}
                type="date"
                min={earliestMoveDate}
                max={todayISO()}
                value={startedOn}
                onChange={(event) => setStartedOn(event.target.value)}
                aria-describedby={error ? errorId : undefined}
                className="min-h-11 font-mono"
              />
              {!canMoveByToday ? (
                <p className="text-xs text-attention">
                  A posição atual começou hoje; a próxima mudança precisa ter
                  uma data posterior.
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`move-lot-notes-${lot.id}`}>Observação (opcional)</Label>
              <Textarea
                id={`move-lot-notes-${lot.id}`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                aria-describedby={error ? errorId : undefined}
                placeholder="Ex.: rotação após recuperação do pasto"
                rows={3}
              />
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
                disabled={saving || destinations.length === 0 || !canMoveByToday}
                className="min-h-11"
              >
                {saving ? "Movendo…" : "Confirmar movimentação"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        <div className="border-t border-hairline pt-4">
          <h3 className="text-sm font-semibold text-ink">Histórico de invernadas</h3>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Nenhuma posição registrada.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {history.map((placement) => {
                const invernada = invernadaById.get(placement.invernadaId);
                return (
                  <li key={placement.id} className="rounded-lg border border-hairline px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-ink">
                        {invernada ? invernadaLabel(invernada) : "Invernada removida"}
                      </span>
                      <span className="font-mono text-xs text-ink-soft">
                        {formatDate(placement.startedOn)}
                        {placement.endedOn ? ` – ${formatDate(placement.endedOn)}` : " – atual"}
                      </span>
                    </div>
                    {placement.baseline ? (
                      <p className="mt-1 text-xs text-ink-soft">Posição inicial registrada na migração.</p>
                    ) : null}
                    {placement.notes ? <p className="mt-1 text-xs text-ink-soft">{placement.notes}</p> : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
