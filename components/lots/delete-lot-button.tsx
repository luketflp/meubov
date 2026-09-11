"use client";

/**
 * "Excluir lote": the confirm, the API call and the refusal message, shared
 * by the /lots card and the ficha of the lote. The failure line wraps to its
 * own row inside a flex-wrap actions row (basis-full).
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Lot } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";

interface DeleteLotButtonProps {
  lot: Lot;
  /** Called after the server accepted the deletion. */
  onDeleted?: () => void;
}

export function DeleteLotButton({ lot, onDeleted }: DeleteLotButtonProps) {
  const removeLot = useHerdStore((state) => state.removeLot);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRemove() {
    if (
      !window.confirm(
        `Excluir o lote ${lot.name}? Ele sai das listas e libera a invernada. O histórico já registrado continua guardado.`
      )
    ) {
      return;
    }
    setRemoving(true);
    setError(null);
    try {
      if (await removeLot(lot.id)) {
        onDeleted?.();
      } else {
        setError("Este lote ainda tem animais ou um manejo em aberto e não pode ser excluído.");
      }
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={removing}
        onClick={onRemove}
        className="min-h-9 text-ink-soft hover:text-overdue"
      >
        <Trash2 aria-hidden />
        {removing ? "Excluindo…" : "Excluir lote"}
      </Button>
      {error ? <p className="basis-full text-right text-xs text-overdue">{error}</p> : null}
    </>
  );
}
