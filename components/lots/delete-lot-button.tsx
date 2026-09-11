"use client";

/**
 * "Excluir lote" as a button, used on the ficha of the lote. The flow itself
 * lives in useDeleteLot; the failure line wraps to its own row inside a
 * flex-wrap actions row (basis-full).
 */
import { Trash2 } from "lucide-react";
import type { Lot } from "@/lib/types";
import { useDeleteLot } from "@/components/lots/use-delete-lot";
import { Button } from "@/components/ui/button";

interface DeleteLotButtonProps {
  lot: Lot;
  /** Called after the server accepted the deletion. */
  onDeleted?: () => void;
}

export function DeleteLotButton({ lot, onDeleted }: DeleteLotButtonProps) {
  const { remove, removing, error } = useDeleteLot(lot, onDeleted);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={removing}
        onClick={remove}
        className="min-h-9 text-ink-soft hover:text-overdue"
      >
        <Trash2 aria-hidden />
        {removing ? "Excluindo…" : "Excluir lote"}
      </Button>
      {error ? <p className="basis-full text-right text-xs text-overdue">{error}</p> : null}
    </>
  );
}
