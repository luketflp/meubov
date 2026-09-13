"use client";

/**
 * /settings/equipe: who is in the farm, the convites waiting, and — for whoever
 * holds Equipe edit — the actions on both. The list lives in local state, not in
 * the herd store: nothing else in the app reads it.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import type { TeamView } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import { can } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { InviteDialog } from "@/components/team/InviteDialog";
import { InvitesCard } from "@/components/team/InvitesCard";
import { MembersCard } from "@/components/team/MembersCard";

export function TeamPage() {
  const farm = useHerdStore((s) => s.farm);
  const permissions = useActivePermissions();
  const canEdit = can(permissions, "team", "edit");
  const farmName = farm.name.trim() || "fazenda";
  const [team, setTeam] = useState<TeamView | null>(null);

  const reload = useCallback(async () => {
    const { data, error } = await api.farm.team.get();
    if (error) {
      toast.error("Não foi possível carregar a equipe.");
      return;
    }
    setTeam(data);
  }, []);

  // The first load runs inline: react-hooks/set-state-in-effect refuses a
  // setState reached through a callback called from the effect.
  useEffect(() => {
    let alive = true;
    void api.farm.team.get().then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        toast.error("Não foi possível carregar a equipe.");
        return;
      }
      setTeam(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Equipe"
          subtitle={`Quem acessa a ${farmName} e o que cada pessoa pode fazer`}
          badges={canEdit ? undefined : <ReadOnlyPill />}
          actions={canEdit ? <InviteDialog ceiling={permissions} onCreated={reload} /> : undefined}
        />
        {team === null ? (
          <p className="text-sm text-ink-soft">Carregando equipe…</p>
        ) : (
          <>
            <MembersCard
              members={team.members}
              canEdit={canEdit}
              ceiling={permissions}
              farmName={farmName}
              onChanged={reload}
            />
            {team.invites.length > 0 ? (
              <InvitesCard invites={team.invites} canEdit={canEdit} onChanged={reload} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
