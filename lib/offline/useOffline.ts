/**
 * Everything the offline UI reads and does: the online flag, the snapshot
 * boot, the fila and its sync, the Sincronização sheet and the vaqueiro's
 * choices on it.
 */
import { create } from "zustand";
import type { SyncStatus } from "@/lib/offline/sync";
import type { OutboxOp } from "@/lib/offline/types";
import { getEngine } from "@/lib/store/offlineWiring";
import { useHerdStore } from "@/lib/store/useHerdStore";

/** One Sincronização sheet for the pill, the tab badge, the banner and the Manejo list. */
const useSheet = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export interface OfflineState {
  online: boolean;
  /** Booted from the snapshot (Task 4). */
  offline: boolean;
  snapshotAt: string | null;
  sync: SyncStatus;
  ops: OutboxOp[];
  open: boolean;
  setOpen(v: boolean): void;
  resolve(opId: string, choice: "server" | "mine"): Promise<void>;
  resolveAll(choice: "server" | "mine"): Promise<void>;
  discard(opId: string): Promise<void>;
  syncNow(): Promise<void>;
}

export function useOffline(): OfflineState {
  const offline = useHerdStore((s) => s.offline);
  const snapshotAt = useHerdStore((s) => s.snapshotAt);
  const sync = useHerdStore((s) => s.sync);
  const ops = useHerdStore((s) => s.ops);
  const open = useSheet((s) => s.open);
  const setOpen = useSheet((s) => s.setOpen);
  return {
    online: sync.online,
    offline,
    snapshotAt,
    sync,
    ops,
    open,
    setOpen,
    resolve: async (opId, choice) => {
      await getEngine()?.resolve(opId, choice);
    },
    resolveAll: async (choice) => {
      await getEngine()?.resolveAll(choice);
    },
    discard: async (opId) => {
      await getEngine()?.discard(opId);
    },
    syncNow: async () => {
      await getEngine()?.kick("manual");
    },
  };
}
