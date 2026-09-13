"use client";

import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import type { TeamMember } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import { accessSummary, type Permissions } from "@/lib/domain/permissions";
import { SectionCard } from "@/components/ui/section-card";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { PermissionsDialog } from "@/components/team/PermissionsDialog";
import { RoleBadge } from "@/components/team/RoleBadge";
import { manageBlockLabel } from "@/components/team/helpers";

interface MembersCardProps {
  members: TeamMember[];
  /** Equipe edit: the row actions show. */
  canEdit: boolean;
  ceiling: Permissions;
  farmName: string;
  onChanged: () => void;
}

export function MembersCard({ members, canEdit, ceiling, farmName, onChanged }: MembersCardProps) {
  return (
    <SectionCard title={`Membros (${members.length})`}>
      <ul className="-m-4 divide-y divide-hairline">
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4"
          >
            <div className="flex min-w-0 items-center gap-3 md:w-72 md:shrink-0">
              <MemberAvatar name={member.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {member.name}
                  {member.isYou ? (
                    <span className="text-xs font-normal text-ink-soft"> · você</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-ink-soft">{member.email}</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 md:flex-col md:items-start">
              <RoleBadge role={member.role} preset={member.preset} />
              <span className="text-xs text-ink-soft">
                {accessSummary(member.role, member.permissions)}
              </span>
            </div>
            {canEdit ? (
              member.manage.ok ? (
                <>
                  <PermissionsDialog
                    member={member}
                    ceiling={ceiling}
                    farmName={farmName}
                    onChanged={onChanged}
                  />
                  <Link
                    href={`/settings/equipe/${member.userId}`}
                    className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-brand md:hidden"
                  >
                    Permissões
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </>
              ) : manageBlockLabel(member.manage.reason) ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-soft">
                  <Lock className="size-3.5" aria-hidden />
                  {manageBlockLabel(member.manage.reason)}
                </span>
              ) : null
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
