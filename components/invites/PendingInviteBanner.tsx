"use client";

/**
 * Convites for someone who already has a farm: one card per convite at the top
 * of the Painel. Accepting adds the farm to the switcher and offers to open it.
 */
import { useState } from "react";
import { MailPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { farmLabel } from "@/lib/domain/farms";
import { expiresInSentence } from "@/lib/domain/invites";
import { PRESET_LABEL, accessSummary } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";

export function PendingInviteBanner() {
  const invites = useHerdStore((s) => s.pendingInvites);
  const refreshInvites = useHerdStore((s) => s.refreshInvites);
  const refreshAccess = useHerdStore((s) => s.refreshAccess);
  const switchFarm = useHerdStore((s) => s.switchFarm);
  const [busy, setBusy] = useState(false);

  if (invites.length === 0) return null;

  async function accept(id: number, farmName: string) {
    setBusy(true);
    const { data, error } = await api.invites({ id }).accept.post();
    await refreshInvites();
    setBusy(false);
    if (error || !data) {
      toast.error("Este convite não está mais disponível.");
      return;
    }
    await refreshAccess();
    toast.success(`Você entrou na ${farmName}`, {
      action: { label: "Abrir", onClick: () => void switchFarm(data.farmId) },
    });
  }

  async function decline(id: number) {
    setBusy(true);
    const { error } = await api.invites({ id }).decline.post();
    setBusy(false);
    if (error) {
      toast.error("Não foi possível recusar o convite.");
      return;
    }
    await refreshInvites();
  }

  return (
    <div className="space-y-3">
      {invites.map((invite) => {
        const farmName = farmLabel({ id: invite.farmId, name: invite.farmName });
        return (
          <section
            key={invite.id}
            className="flex flex-col gap-3 rounded-lg border border-hairline bg-panel p-4 sm:flex-row sm:items-center"
          >
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft"
            >
              <MailPlus className="size-[18px] text-brand" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {invite.invitedByName ?? "Alguém"} convidou você para a {farmName} como{" "}
                {PRESET_LABEL[invite.preset]}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {accessSummary("member", invite.permissions)}.{" "}
                {expiresInSentence(invite.expiresAt, new Date())}.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 sm:min-h-9 sm:flex-none"
                disabled={busy}
                onClick={() => decline(invite.id)}
              >
                Recusar
              </Button>
              <Button
                type="button"
                className="min-h-11 flex-1 sm:min-h-9 sm:flex-none"
                disabled={busy}
                onClick={() => accept(invite.id, farmName)}
              >
                Aceitar
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
