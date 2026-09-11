"use client";

/**
 * "Excluir lote": the confirm, the API call and the refusal message, shared by
 * the button on the ficha and the card's ••• menu. The caller decides where the
 * failure shows — an inline line on the ficha, a toast in the menu.
 */
import { useState } from "react";
import type { Lot } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";

export const LOT_DELETE_REFUSED =
  "Este lote ainda tem animais ou um manejo em aberto e não pode ser excluído.";

export function useDeleteLot(lot: Lot, onDeleted?: () => void) {
  const removeLot = useHerdStore((state) => state.removeLot);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
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
        setError(LOT_DELETE_REFUSED);
      }
    } finally {
      setRemoving(false);
    }
  }

  return { remove, removing, error };
}
