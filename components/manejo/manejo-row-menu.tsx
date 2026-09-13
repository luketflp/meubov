"use client";

/**
 * The ••• menu of a row of the manejo history. Every row can be deleted, but
 * what a delete means depends on what wrote the row: a session goes through the
 * manejo delete, which puts the herd back; a group of treatments and a day of
 * weighings only drop the record they are. The mobile card is a link, so the
 * menu swallows the clicks that reach it.
 */
import { useState } from "react";
import { Ellipsis, Trash2 } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { can } from "@/lib/domain/permissions";
import { canDeleteSession } from "@/lib/domain/moneyRedaction";
import type { ManejoHistoryRow } from "@/components/manejo/helpers";
import {
  DeleteManejoDialog,
  type DeleteTarget,
} from "@/components/manejo/delete-manejo-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ManejoRowMenu({ row }: { row: ManejoHistoryRow }) {
  const session = useHerdStore((s) =>
    row.sessionId === undefined ? undefined : s.manejoSessions.find((m) => m.id === row.sessionId)
  );
  const [deleting, setDeleting] = useState(false);
  const permissions = useActivePermissions();

  const target: DeleteTarget | null = session
    ? { kind: "session", session }
    : row.treatmentId !== undefined
      ? {
          kind: "treatments",
          treatmentId: row.treatmentId,
          name: row.name,
          headCount: row.headCount,
        }
      : row.earTags !== undefined
        ? { kind: "weighings", date: row.date, earTags: row.earTags }
        : null;

  if (!target) return null;
  // Each row deletes through the area that wrote it: a session through Manejo
  // (plus Financeiro when it has money), a group of treatments through
  // Sanitário, a day of weighings through Rebanho. A reader gets no menu.
  const allowed =
    target.kind === "session"
      ? canDeleteSession(permissions, target.session)
      : can(permissions, target.kind === "treatments" ? "sanitary" : "herd", "edit");
  if (!allowed) return null;

  return (
    // The card around it is a link: no click inside the menu may navigate.
    <div onClick={(event) => event.preventDefault()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Ações do manejo ${row.name}`}
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 aria-hidden />
            Excluir manejo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteManejoDialog target={target} open={deleting} onOpenChange={setDeleting} />
    </div>
  );
}
