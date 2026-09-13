"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { TeamMember } from "@/lib/api/domains/team/useCases/BrowseTeam.useCase";
import { formatInstantDate } from "@/lib/domain/invites";
import type { Permissions } from "@/lib/domain/permissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { MemberPermissionsForm } from "@/components/team/MemberPermissionsForm";

/** "Permissões" on a member row, desktop only; the phone opens /settings/equipe/[userId]. */
export function PermissionsDialog({
  member,
  ceiling,
  farmName,
  onChanged,
}: {
  member: TeamMember;
  ceiling: Permissions;
  farmName: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden shrink-0 md:inline-flex">
          <SlidersHorizontal aria-hidden />
          Permissões
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="flex-row items-center gap-3">
          <MemberAvatar name={member.name} className="size-10" />
          <div className="grid gap-1 text-left">
            <DialogTitle>{member.name}</DialogTitle>
            <DialogDescription>
              {member.email} · membro desde {formatInstantDate(member.joinedAt)}
            </DialogDescription>
          </div>
        </DialogHeader>
        {/* Mounted per open, so a cancelled edit never survives to the next one. */}
        {open ? (
          <MemberPermissionsForm
            member={member}
            ceiling={ceiling}
            farmName={farmName}
            onCancel={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              onChanged();
            }}
            footerClassName="-mx-4 -mb-4 rounded-b-xl border-t border-hairline bg-muted/50 p-4"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
