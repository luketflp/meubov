"use client";

/**
 * The runner's header pill: "Sem conexão" offline, "Sincronizando" while a
 * replay is in flight, "N a enviar" online with a non-empty fila. Tapping it
 * opens the Sincronização sheet. Online with nothing waiting, it is gone.
 */
import { CloudUpload, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";
import { useOffline } from "@/lib/offline/useOffline";
import { PILL } from "@/components/offline/QueuedPassesList";
import { cn } from "@/lib/utils";

interface PillLook {
  label: string;
  Icon: LucideIcon;
  tone: string;
  spin: boolean;
}

export function OfflinePill() {
  const { online, sync, setOpen } = useOffline();
  const count = sync.counts.queued + sync.counts.conflict + sync.counts.failed;
  const look: PillLook | null = !online
    ? { label: "Sem conexão", Icon: WifiOff, tone: "bg-attention-soft text-attention", spin: false }
    : sync.phase === "sending"
      ? { label: "Sincronizando", Icon: RefreshCw, tone: "bg-scheduled-soft text-scheduled", spin: true }
      : count > 0
        ? { label: `${count} a enviar`, Icon: CloudUpload, tone: "bg-brand-soft text-brand", spin: false }
        : null;
  if (!look) return null;
  const { label, Icon, tone, spin } = look;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      title="Abrir a sincronização"
      className="inline-flex min-h-11 items-center md:min-h-0"
    >
      <span className={cn(PILL, tone)}>
        <Icon className={cn("size-3", spin && "motion-safe:animate-spin")} aria-hidden />
        {label}
      </span>
    </button>
  );
}
