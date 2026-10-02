"use client";

/**
 * "Sincronização": the whole fila. A bottom sheet on the phone, a right-side
 * panel from md up. It shows the status line, A enviar, Conflitos (per item or
 * in batch: keep the server's record or resend the phone's with force) and
 * Falhas (Descartar only), with "Sincronizar agora" at the foot. It is mounted
 * once in AppShell and opened through useOffline().setOpen.
 */
import { useState } from "react";
import { RefreshCw, TriangleAlert, Wifi } from "lucide-react";
import type { OutboxCounts } from "@/lib/offline/outbox";
import type { OutboxOp } from "@/lib/offline/types";
import type { ManejoOutcome } from "@/lib/types";
import { useOffline } from "@/lib/offline/useOffline";
import { getOutbox } from "@/lib/store/offlineWiring";
import { formatKg } from "@/lib/domain/format";
import { useToast } from "@/components/providers/Toasts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BOTTOM_SHEET } from "@/components/ui/bottom-sheet";
import { clock, OpRow, opAction, PILL } from "@/components/offline/QueuedPassesList";
import { cn } from "@/lib/utils";

const SHEET = cn(
  BOTTOM_SHEET,
  "max-h-[85dvh] gap-5 overflow-y-auto md:top-0 md:right-0 md:bottom-0 md:left-auto md:h-dvh md:max-h-dvh md:w-[420px] md:max-w-[420px] md:rounded-none md:rounded-l-xl"
);

const HEADING = "text-xs font-semibold tracking-wide text-ink-soft uppercase";

const OUTCOME_TEXT: Record<ManejoOutcome, string> = {
  pending: "Pendente",
  done: "Concluído",
  skipped: "Pulado",
  rejected: "Refugo",
  held: "Dúvida",
};

const ERROR_TEXT: Record<string, string> = {
  entry_not_actionable: "Já tratado em outro aparelho",
  held_pending: "Há dúvidas por decidir",
  out_of_stock: "Touro sem doses",
  animal_inactive: "Animal já saiu do rebanho",
  has_diagnosis: "Vaca já tem diagnóstico",
  session_closed: "Manejo já encerrado",
  not_female: "Não é fêmea",
  bull_not_found: "Touro não encontrado",
  id_taken: "Manejo já existe em outra fazenda",
  dependent: "Depende do passe anterior deste animal",
};

function reason(op: OutboxOp): string {
  return op.detail?.message ?? ERROR_TEXT[op.detail?.error ?? ""] ?? "Recusado pelo servidor";
}

/**
 * The server's side of a conflito. The entry carries no author and no time:
 * the server stores neither per pass, so the box names only what was recorded.
 */
function serverText(op: OutboxOp): string {
  const server = op.detail?.server;
  if (!server) return reason(op);
  return `${OUTCOME_TEXT[server.outcome]}${
    server.weightKg !== undefined ? ` · ${formatKg(server.weightKg)}` : ""
  }`;
}

/** Why "Aplicar o meu" cannot go, or null when it can. */
function blockedReason(op: OutboxOp): string | null {
  if (op.detail?.sessionClosed) return "manejo já encerrado";
  if (op.detail?.error === "has_diagnosis") return "vaca já tem diagnóstico";
  if (op.detail?.error === "dependent") return "depende do anterior";
  return null;
}

function StatusLine() {
  const { online, sync } = useOffline();
  if (sync.phase === "paused_auth") {
    return (
      <p className="flex items-center gap-1.5 text-sm text-attention">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        Entre de novo para enviar
      </p>
    );
  }
  if (!online) {
    return (
      <p className="text-sm text-ink-soft">
        {sync.offlineSince ? `Sem conexão desde ${clock(sync.offlineSince)}` : "Sem conexão"}
      </p>
    );
  }
  if (sync.phase === "sending" && sync.sending) {
    const { done, total } = sync.sending;
    return (
      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-sm text-healthy">
          <Wifi className="size-4 shrink-0" aria-hidden />
          <span>
            Conectado · enviando <span className="font-mono">{Math.min(done + 1, total)}</span> de{" "}
            <span className="font-mono">{total}</span>…
          </span>
        </p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="Envio dos passes"
          className="h-1 overflow-hidden rounded-full bg-surface"
        >
          <div
            className="h-full bg-brand transition-[width]"
            style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
          />
        </div>
      </div>
    );
  }
  const left = sync.counts.conflict + sync.counts.failed > 0;
  return (
    <p className={cn("flex items-center gap-1.5 text-sm", left ? "text-attention" : "text-healthy")}>
      <Wifi className="size-4 shrink-0" aria-hidden />
      {idleLine(sync.counts, sync.lastSyncedAt)}
    </p>
  );
}

/** Connected and not sending: all sent only when no conflito or falha is left either. */
export function idleLine(counts: OutboxCounts, lastSyncedAt: string | undefined): string {
  const left = [
    counts.conflict === 1 && "1 conflito espera sua escolha",
    counts.conflict > 1 && `${counts.conflict} conflitos esperam sua escolha`,
    counts.failed === 1 && "1 falha",
    counts.failed > 1 && `${counts.failed} falhas`,
  ].filter(Boolean);
  if (left.length > 0) return left.join(" · ");
  return lastSyncedAt && counts.queued === 0 ? `Tudo enviado às ${clock(lastSyncedAt)}` : "Conectado";
}

function Side({ label, text, server }: { label: string; text: string; server?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-md border border-hairline px-2.5 py-2",
        server ? "bg-surface" : "bg-panel"
      )}
    >
      <span className="text-[11px] font-medium text-ink-soft">{label}</span>
      <span className="text-[13px] leading-[18px] text-ink">{text}</span>
    </div>
  );
}

function ConflictItem({
  op,
  disabled,
  offline,
  onResolve,
}: {
  op: OutboxOp;
  disabled: boolean;
  /** No signal: both choices need the server, so both wait. */
  offline: boolean;
  onResolve: (choice: "server" | "mine") => void;
}) {
  const mine = opAction(op);
  const blocked = blockedReason(op);
  return (
    <li className="flex flex-col gap-2 border-t border-hairline py-3">
      <div className="flex items-center gap-2">
        {op.earTag ? (
          <span className="font-mono text-base font-semibold text-ink">{op.earTag}</span>
        ) : null}
        <span className={cn(PILL, "bg-attention-soft text-attention")}>
          <TriangleAlert className="size-3" aria-hidden />
          Conflito
        </span>
      </div>
      <div className="grid gap-1.5">
        <Side
          label="Neste celular"
          text={`${mine.label} ${clock(op.createdAt)}${
            mine.weightKg !== undefined ? ` · ${formatKg(mine.weightKg)}` : ""
          }`}
        />
        <Side label="No servidor" text={serverText(op)} server />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-1"
          disabled={disabled || offline}
          onClick={() => onResolve("server")}
        >
          Manter do servidor
        </Button>
        <div className="flex flex-1 flex-col gap-1">
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={disabled || offline || blocked !== null}
            onClick={() => onResolve("mine")}
          >
            Aplicar o meu
          </Button>
          {blocked || offline ? (
            <p className="text-center text-xs text-ink-soft">{blocked ?? "sem conexão"}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function SyncSheet() {
  const { online, sync, ops, open, setOpen, resolve, resolveAll, discard, syncNow } = useOffline();
  const { addToast } = useToast();
  /** A choice in flight: its buttons must not double-fire. */
  const [busy, setBusy] = useState(false);
  const sending = sync.phase === "sending";
  const toSend = ops.filter((op) => op.state === "queued" || op.state === "sending");
  const conflicts = ops.filter((op) => op.state === "conflict");
  const failed = ops.filter((op) => op.state === "failed");

  /**
   * `resent` names the conflitos a "mine" choice sent again: the engine returns
   * normally on a network error or a 5xx and leaves them conflito, so the
   * outbox (not the store, which catches up later) says whether they went.
   */
  async function run(action: () => Promise<void>, done: string, resent: string[] = []) {
    setBusy(true);
    try {
      await action();
      const outbox = getOutbox();
      const left = await Promise.all(resent.map((id) => outbox.get(id)));
      // A resend refused again lands in Falhas; one that never left stays conflito.
      if (left.some((op) => op?.state === "failed")) {
        addToast({ messageType: "error", text: "Não foi possível reenviar — veja em Falhas" });
      } else if (left.some((op) => op?.state === "conflict")) {
        addToast({ messageType: "error", text: "Sem conexão, tente de novo" });
      } else {
        addToast({ messageType: "success", text: done });
      }
    } catch {
      addToast({ messageType: "error", text: "Sem conexão, tente de novo" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={SHEET} aria-describedby={undefined}>
        <DialogHeader className="pr-10">
          <DialogTitle className="text-lg leading-6 font-semibold">Sincronização</DialogTitle>
          <div role="status" aria-live="polite">
            <StatusLine />
          </div>
        </DialogHeader>

        {ops.length === 0 ? (
          <p className="text-sm text-ink-soft">Nada guardado no celular.</p>
        ) : null}

        {toSend.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className={HEADING}>
              A enviar · <span className="font-mono">{toSend.length}</span>
            </h3>
            <ul className="divide-y divide-hairline">
              {toSend.map((op) => (
                <OpRow key={op.id} op={op} />
              ))}
            </ul>
          </section>
        ) : null}

        {conflicts.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className={cn(HEADING, "text-attention")}>
              Conflitos · <span className="font-mono">{conflicts.length}</span>
            </h3>
            <p className="text-[13px] leading-[18px] text-ink-soft">
              Estes animais já foram tratados em outro aparelho. Escolha qual passe vale.
            </p>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 px-1.5"
                disabled={busy || sending || !online}
                onClick={() =>
                  run(
                    () => resolveAll("mine"),
                    "Seus passes foram reenviados",
                    conflicts.map((op) => op.id)
                  )
                }
              >
                Aplicar todos os meus
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 px-1.5"
                disabled={busy || sending || !online}
                onClick={() => run(() => resolveAll("server"), "Registros do servidor mantidos")}
              >
                Manter todos do servidor
              </Button>
            </div>
            {online ? null : <p className="text-center text-xs text-ink-soft">sem conexão</p>}
            <ul className="mt-1">
              {conflicts.map((op) => (
                <ConflictItem
                  key={op.id}
                  op={op}
                  disabled={busy}
                  offline={!online}
                  onResolve={(choice) =>
                    run(
                      () => resolve(op.id, choice),
                      choice === "mine" ? "Seu passe foi reenviado" : "Registro do servidor mantido",
                      choice === "mine" ? [op.id] : []
                    )
                  }
                />
              ))}
            </ul>
          </section>
        ) : null}

        {failed.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className={cn(HEADING, "text-overdue")}>
              Falhas · <span className="font-mono">{failed.length}</span>
            </h3>
            <ul className="divide-y divide-hairline">
              {failed.map((op) => (
                <li key={op.id} className="flex min-h-11 items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      {op.earTag ? (
                        <span className="font-mono text-sm font-medium text-ink">{op.earTag}</span>
                      ) : null}
                      <span className="text-xs text-ink-soft">
                        {opAction(op).label} · {clock(op.createdAt)}
                      </span>
                    </p>
                    <p className="text-xs text-overdue">{reason(op)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 shrink-0 text-ink-soft hover:text-overdue md:min-h-0"
                    disabled={busy}
                    aria-label={op.earTag ? `Descartar o passe do animal ${op.earTag}` : "Descartar"}
                    onClick={() => run(() => discard(op.id), "Passe descartado")}
                  >
                    Descartar
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="-mx-4 flex flex-col gap-1.5 border-t border-hairline bg-surface/50 px-4 pt-4">
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={!online || sending || busy}
            onClick={() => void syncNow()}
          >
            <RefreshCw className={cn(sending && "motion-safe:animate-spin")} aria-hidden />
            {sending ? "Enviando…" : "Sincronizar agora"}
          </Button>
          {!online ? (
            <p className="text-center text-xs text-ink-soft">sem conexão</p>
          ) : sending ? (
            <p className="text-center text-xs text-ink-soft">
              Os conflitos esperam sua escolha; o resto segue sozinho.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
