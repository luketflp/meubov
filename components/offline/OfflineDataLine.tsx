"use client";

/** Under every page title while the farm comes from the phone's snapshot. */
import { useOffline } from "@/lib/offline/useOffline";
import { clock } from "@/components/offline/QueuedPassesList";

export function OfflineDataLine() {
  const { offline, snapshotAt } = useOffline();
  if (!offline || !snapshotAt) return null;
  const day = new Date(snapshotAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return (
    <p className="mt-0.5 text-xs text-attention">
      Sem conexão · dados de {day} às {clock(snapshotAt)}
    </p>
  );
}
