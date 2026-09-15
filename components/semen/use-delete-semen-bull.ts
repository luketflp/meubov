"use client";

/**
 * "Excluir touro": the confirm, the API call and the refusal toast, shared by
 * the trash on the Touros tab and the button on the bull's page. The store's
 * own picture refuses at once — a dose used, an open inseminação — and the
 * server checks the same two things again under the bull's lock.
 */
import { useState } from "react";
import type { SemenBull } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { bullRemovalBlock, type BullRemovalBlock } from "@/lib/domain/semen";

const BLOCK_MESSAGE: Record<BullRemovalBlock, string> = {
  doses_used: "Não dá para excluir: esse touro já foi usado em coberturas.",
  open_insemination: "Não dá para excluir: esse touro está em uma inseminação em aberto.",
};

export function useDeleteSemenBull(bull: SemenBull, onDeleted?: () => void) {
  const removeSemenBull = useHerdStore((s) => s.removeSemenBull);
  const { addToast } = useToast();
  const [removing, setRemoving] = useState(false);

  async function remove() {
    const { animals, manejoSessions } = useHerdStore.getState();
    const block = bullRemovalBlock(bull.id, animals, manejoSessions);
    if (block) {
      addToast({ messageType: "error", text: BLOCK_MESSAGE[block] });
      return;
    }
    const money =
      bull.purchases.length > 0
        ? " As compras dele e as despesas que elas geraram saem do Financeiro."
        : "";
    if (!window.confirm(`Excluir o touro ${bull.name}?${money}`)) return;
    setRemoving(true);
    try {
      const refused = await removeSemenBull(bull.id);
      if (refused) {
        addToast({ messageType: "error", text: BLOCK_MESSAGE[refused] });
      } else {
        addToast({ messageType: "success", text: "Touro excluído" });
        onDeleted?.();
      }
    } catch {
      // The store already told the farmer.
    } finally {
      setRemoving(false);
    }
  }

  return { remove, removing };
}
