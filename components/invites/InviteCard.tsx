"use client";

import type { MyInvite } from "@/lib/api/domains/invites/useCases/BrowseMine.useCase";
import { farmLabel } from "@/lib/domain/farms";
import { expiresInSentence } from "@/lib/domain/invites";
import { PRESET_LABEL } from "@/lib/domain/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccessSummaryBox } from "@/components/team/AccessSummaryBox";

/** One convite on /convites: the farm, who invited, what the person may do, and the answer. */
export function InviteCard({
  invite,
  busy,
  onAccept,
  onDecline,
}: {
  invite: MyInvite;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const role = PRESET_LABEL[invite.preset];
  return (
    <section className="grid gap-3 rounded-lg border border-hairline bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold text-ink">
            {farmLabel({ id: invite.farmId, name: invite.farmName })}
          </h2>
          {invite.municipality ? (
            <p className="text-xs text-ink-soft">{invite.municipality}</p>
          ) : null}
        </div>
        <Badge variant="secondary">{role}</Badge>
      </div>
      <p className="text-sm text-ink">
        {invite.invitedByName ?? "O dono da fazenda"} convidou você como {role}.{" "}
        <span className="text-ink-soft">{expiresInSentence(invite.expiresAt, new Date())}.</span>
      </p>
      <AccessSummaryBox permissions={invite.permissions} />
      <div className="grid gap-2">
        <Button type="button" className="min-h-11 w-full" onClick={onAccept} disabled={busy}>
          Aceitar e entrar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          onClick={onDecline}
          disabled={busy}
        >
          Recusar
        </Button>
      </div>
    </section>
  );
}
