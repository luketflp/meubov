"use client";

/**
 * Under the runner's header while offline: since when, and how many of this
 * manejo's passes wait on the phone, with "Ver fila" into the sheet.
 */
import { CloudOff, WifiOff } from "lucide-react";
import { useOffline } from "@/lib/offline/useOffline";
import { clock } from "@/components/offline/QueuedPassesList";
import { Button } from "@/components/ui/button";

export function OfflineBanner({ sessionId }: { sessionId: string }) {
  const { online, sync, ops, setOpen } = useOffline();
  if (online) return null;
  const count = ops.filter((op) => op.sessionId === sessionId).length;
  const since = sync.offlineSince ? `Sem conexão desde ${clock(sync.offlineSince)}` : "Sem conexão";
  return (
    <section
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-attention/25 bg-attention-soft pt-3 pr-3 pb-2 pl-4"
    >
      <div className="flex items-start gap-2.5 text-attention">
        <WifiOff className="mt-px size-[18px] shrink-0" aria-hidden />
        <p className="text-sm text-ink">
          {count > 0 ? (
            <>
              <span className="font-medium">
                {since} · {count} {count === 1 ? "passe guardado" : "passes guardados"} no celular.
              </span>{" "}
              Serão enviados quando o sinal voltar.
            </>
          ) : (
            <>
              <span className="font-medium">{since}.</span> Os passes ficam guardados no celular e
              serão enviados quando o sinal voltar.
            </>
          )}
        </p>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 text-brand md:min-h-0"
          onClick={() => setOpen(true)}
        >
          <CloudOff aria-hidden />
          Ver fila
        </Button>
      </div>
    </section>
  );
}
