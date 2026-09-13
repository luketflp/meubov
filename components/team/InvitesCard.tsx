"use client";

import { Info, Mail, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import type { TeamInvite } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import { inviteDateLine, type ListedInviteState } from "@/lib/domain/invites";
import { PRESET_LABEL } from "@/lib/domain/permissions";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { teamErrorMessage } from "@/components/team/helpers";
import { cn } from "@/lib/utils";

const STATE_PILL: Record<ListedInviteState, { label: string; tone: string; dot: string }> = {
  pending: { label: "Pendente", tone: "bg-scheduled-soft text-scheduled", dot: "bg-scheduled" },
  expired: { label: "Expirado", tone: "bg-attention-soft text-attention", dot: "bg-attention" },
  declined: { label: "Recusado", tone: "bg-overdue-soft text-overdue", dot: "bg-overdue" },
};

export function InvitesCard({
  invites,
  canEdit,
  onChanged,
}: {
  invites: TeamInvite[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const now = new Date();

  async function close(invite: TeamInvite) {
    const { error } = await api.farm.invites({ id: invite.id }).delete();
    if (error) {
      toast.error(teamErrorMessage(error));
      return;
    }
    toast.success(invite.state === "declined" ? "Convite removido da lista" : "Convite cancelado");
    onChanged();
  }

  async function reinvite(invite: TeamInvite) {
    const { error } = await api.farm.invites.post({
      email: invite.email,
      permissions: invite.permissions,
    });
    if (error) {
      toast.error(teamErrorMessage(error));
      return;
    }
    toast.success(`Convite criado para ${invite.email}`);
    onChanged();
  }

  return (
    <SectionCard title={`Convites (${invites.length})`}>
      <ul className="-mx-4 -mt-4 divide-y divide-hairline">
        {invites.map((invite) => {
          const pill = STATE_PILL[invite.state];
          return (
            <li
              key={invite.id}
              className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3 md:w-72 md:shrink-0">
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-hairline"
                >
                  <Mail className="size-3.5 text-ink-soft" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{invite.email}</p>
                  <p className="text-xs text-ink-soft">como {PRESET_LABEL[invite.preset]}</p>
                </div>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 md:flex-col md:items-start">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                    pill.tone
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", pill.dot)} aria-hidden />
                  {pill.label}
                </span>
                <span className="text-xs text-ink-soft">{inviteDateLine(invite, now)}</span>
              </div>
              {canEdit ? (
                <div className="flex shrink-0 flex-wrap gap-1">
                  {invite.state === "pending" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 md:min-h-7"
                      onClick={() => close(invite)}
                    >
                      Cancelar convite
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 md:min-h-7"
                      onClick={() => reinvite(invite)}
                    >
                      <RotateCw aria-hidden />
                      Convidar de novo
                    </Button>
                  )}
                  {invite.state === "declined" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 md:min-h-7"
                      aria-label={`Remover ${invite.email} da lista`}
                      onClick={() => close(invite)}
                    >
                      <X aria-hidden />
                      <span className="md:sr-only">Remover da lista</span>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="-mx-4 -mb-4 flex gap-1.5 border-t border-hairline bg-surface px-4 py-3 text-xs text-ink-soft">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        O convite aparece quando a pessoa entra no MeuBov com o e-mail convidado. Nada é enviado:
        avise você mesmo. Vale por 7 dias.
      </p>
    </SectionCard>
  );
}
