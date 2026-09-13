"use client";

/**
 * /settings/equipe/[userId]: one member's permissions as a page, for the phone,
 * where a dialog with eight rows of controls does not fit. Desktop opens the
 * same form in a dialog from the Equipe list.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, UserX } from "lucide-react";
import { api } from "@/lib/api/client";
import type { TeamMember } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import { formatInstantDate } from "@/lib/domain/invites";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { MemberPermissionsForm } from "@/components/team/MemberPermissionsForm";

function BackLink() {
  return (
    <Link
      href="/settings/equipe"
      className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Equipe
    </Link>
  );
}

export default function MemberPermissionsPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const permissions = useActivePermissions();
  const farm = useHerdStore((s) => s.farm);
  /** undefined while loading, null when the member cannot be edited from here. */
  const [member, setMember] = useState<TeamMember | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void api.farm.team.get().then(({ data }) => {
      if (alive) setMember(data?.members.find((m) => m.userId === params.userId) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [params.userId]);

  const back = () => router.push("/settings/equipe");

  return (
    <RequireAccess area="team" level="edit">
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6 md:px-8">
        <BackLink />
        {member === undefined ? (
          <p className="text-sm text-ink-soft">Carregando…</p>
        ) : member === null || !member.manage.ok ? (
          <div className="rounded-lg border border-hairline bg-panel">
            <EmptyState
              icon={UserX}
              title="Não é possível alterar este membro"
              description="A pessoa não está na equipe ou tem um acesso que você não pode mudar."
            />
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3">
              <MemberAvatar name={member.name} className="size-10" />
              <div className="min-w-0">
                <h1 className="truncate font-heading text-xl font-semibold text-ink">{member.name}</h1>
                <p className="truncate text-xs text-ink-soft">
                  {member.email} · membro desde {formatInstantDate(member.joinedAt)}
                </p>
              </div>
            </header>
            <MemberPermissionsForm
              member={member}
              ceiling={permissions}
              farmName={farm.name.trim() || "fazenda"}
              onDone={back}
              onCancel={back}
              footerClassName="border-t border-hairline pt-4"
            />
          </>
        )}
      </div>
    </RequireAccess>
  );
}
