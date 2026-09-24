"use client";

/**
 * "Remover invernada": asks before removing, and says what removing does. An
 * invernada a lote grazes now cannot go: the dialog lists those lotes with a
 * link to each one's page, where "Mover lote" takes it elsewhere. One only past
 * lotes grazed leaves the lists and the map, while the lot history keeps it.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Invernada, Lot } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { activeAnimals, invernadaRemoval } from "@/lib/store/selectors";
import { formatNumber } from "@/lib/domain/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RemoveInvernadaDialogProps {
  /** The invernada to remove; the dialog is closed without one. */
  invernada: Invernada | null;
  /** The lotes grazing it now. */
  currentLots: Lot[];
  onOpenChange: (open: boolean) => void;
}

const heads = (n: number) => (n === 1 ? "1 cabeça" : `${formatNumber(n)} cabeças`);

export function RemoveInvernadaDialog({
  invernada,
  currentLots,
  onOpenChange,
}: RemoveInvernadaDialogProps) {
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const animals = useHerdStore((s) => s.animals);
  const removeInvernada = useHerdStore((s) => s.removeInvernada);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(next: boolean) {
    if (saving) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function confirm() {
    if (!invernada) return;
    setSaving(true);
    setError(null);
    try {
      if (await removeInvernada(invernada.id)) {
        onOpenChange(false);
      } else {
        // A lote moved in on another device since the page loaded.
        setError("Um lote entrou nesta invernada. Mova-o para outra antes de remover.");
      }
    } catch {
      setError("Não foi possível remover agora. Tente de novo em instantes.");
    } finally {
      setSaving(false);
    }
  }

  const label = invernada
    ? `invernada ${invernada.code}${invernada.name ? ` · ${invernada.name}` : ""}`
    : "";
  const removal = invernada ? invernadaRemoval(invernada.id, lotPlacements) : "free";
  const occupied = removal === "occupied" && currentLots.length > 0;
  const headsByLot = new Map<string, number>();
  for (const animal of activeAnimals(animals)) {
    headsByLot.set(animal.lotId, (headsByLot.get(animal.lotId) ?? 0) + 1);
  }

  return (
    <Dialog open={invernada !== null} onOpenChange={change}>
      <DialogContent>
        {occupied ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {currentLots.length === 1 ? "Mova o lote" : "Mova os lotes"} antes de remover
              </DialogTitle>
              <DialogDescription>
                {currentLots.length === 1
                  ? `A ${label} tem um lote agora. Abra o lote, use “Mover lote” para levá-lo a outra invernada e volte aqui para remover.`
                  : `A ${label} tem ${currentLots.length} lotes agora. Abra cada lote, use “Mover lote” para levá-lo a outra invernada e volte aqui para remover.`}
              </DialogDescription>
            </DialogHeader>
            <ul className="divide-y divide-hairline rounded-lg border border-hairline">
              {currentLots.map((lot) => (
                <li key={lot.id} className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
                  <span className="min-w-0 text-sm text-ink">
                    <span className="font-medium">{lot.name}</span>
                    <span className="text-ink-soft"> · {heads(headsByLot.get(lot.id) ?? 0)}</span>
                  </span>
                  <Link
                    href={`/lots/${encodeURIComponent(lot.id)}`}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
                  >
                    Mover lote
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button type="button" className="min-h-11 md:min-h-9" onClick={() => change(false)}>
                Entendi
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Remover a {label}?</DialogTitle>
              <DialogDescription>
                {removal === "history"
                  ? "Ela sai da lista, dos seletores e do mapa. O histórico dos lotes que passaram por ela continua mostrando-a, como removida."
                  : "O cadastro e o contorno no mapa são apagados. Nenhum lote passou por ela, então nada mais muda."}
              </DialogDescription>
            </DialogHeader>
            {removal === "history" ? (
              <p className="text-sm text-ink-soft">
                O código {invernada?.code} fica livre para uma nova invernada.
              </p>
            ) : null}
            {error ? <p className="text-sm text-overdue">{error}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 md:min-h-9"
                disabled={saving}
                onClick={() => change(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="min-h-11 md:min-h-9"
                disabled={saving}
                onClick={confirm}
              >
                {saving ? "Removendo…" : "Remover invernada"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
