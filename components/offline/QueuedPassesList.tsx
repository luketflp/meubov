"use client";

/**
 * "Guardados no celular": the operations of one manejo waiting in the fila,
 * newest first. The row and the op wording are shared with the Sincronização
 * sheet, so both read the same.
 */
import { CloudOff, RefreshCw } from "lucide-react";
import type { OutboxOp, OutboxState } from "@/lib/offline/types";
import { useOffline } from "@/lib/offline/useOffline";
import { formatKg } from "@/lib/domain/format";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

/** The StatusPill shape, for pills whose label is not a StatusVisual. */
export const PILL =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

/** "14:07" from an ISO datetime, in the phone's time zone. */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const SET_ASIDE_LABEL: Record<string, string> = { rejected: "Refugo", held: "Dúvida" };

/** What the operation did, in the runner's words, and the weight it carried. */
export function opAction(op: OutboxOp): { label: string; weightKg?: number } {
  const weightKg = typeof op.body.weightKg === "number" ? op.body.weightKg : undefined;
  switch (op.kind) {
    case "complete":
      return { label: "Concluído", weightKg };
    case "skip":
      return { label: "Pulado" };
    case "set-aside":
      return { label: SET_ASIDE_LABEL[String(op.body.list)] ?? "Apartado", weightKg };
    case "baixa":
      return { label: "Baixa" };
    case "reopen":
      return { label: "Desfeito" };
    case "close":
      return { label: "Encerrado" };
    case "start":
      return { label: "Iniciado" };
    case "carcass-yield":
      return {
        label:
          typeof op.body.carcassYieldPct === "number"
            ? `Rendimento ${op.body.carcassYieldPct}%`
            : "Rendimento",
      };
  }
}

function OpState({ state }: { state: OutboxState }) {
  if (state === "sending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-brand">
        <RefreshCw className="size-3 motion-safe:animate-spin" aria-hidden />
        enviando…
      </span>
    );
  }
  if (state === "conflict") {
    return <span className={cn(PILL, "bg-attention-soft text-attention")}>conflito</span>;
  }
  if (state === "failed") {
    return <span className={cn(PILL, "bg-overdue-soft text-overdue")}>falha</span>;
  }
  return <span className="text-xs text-ink-soft">a enviar</span>;
}

/** One operation: hora · brinco · ação · estado. */
export function OpRow({ op }: { op: OutboxOp }) {
  const { label, weightKg } = opAction(op);
  return (
    <li className="flex min-h-11 items-center gap-2 px-1 py-2">
      <CloudOff className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
      <span className="font-mono text-xs text-ink-soft">{clock(op.createdAt)}</span>
      {op.earTag ? (
        <span className="font-mono text-sm font-medium text-ink">{op.earTag}</span>
      ) : null}
      <span className="text-xs whitespace-nowrap text-ink-soft">
        {label}
        {weightKg !== undefined ? (
          <>
            {" · "}
            <span className="font-mono">{formatKg(weightKg)}</span>
          </>
        ) : null}
      </span>
      <span className="ml-auto shrink-0">
        <OpState state={op.state} />
      </span>
    </li>
  );
}

export function QueuedPassesList({
  sessionId,
  className,
}: {
  sessionId: string;
  className?: string;
}) {
  const { ops } = useOffline();
  const mine = ops.filter((op) => op.sessionId === sessionId).sort((a, b) => b.seq - a.seq);
  if (mine.length === 0) return null;
  // Conflitos and falhas are listed but wait on a choice, not on the signal.
  const toSend = mine.filter((op) => op.state === "queued" || op.state === "sending").length;
  return (
    <SectionCard
      title="Guardados no celular"
      subtitle={`${toSend} ${toSend === 1 ? "passe" : "passes"} a enviar`}
      className={className}
    >
      <ul className="-my-1 max-h-72 divide-y divide-hairline overflow-y-auto">
        {mine.map((op) => (
          <OpRow key={op.id} op={op} />
        ))}
      </ul>
    </SectionCard>
  );
}
