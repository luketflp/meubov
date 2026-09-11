"use client";

/**
 * The ••• menu of a lot card. The card itself is a link, so the menu swallows
 * the clicks that reach it and each item opens one of the existing dialogs in
 * controlled mode. A refused deletion has no room for an inline line here, so
 * it goes to the toast.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArrowRightLeft, Ellipsis, History, Pencil, Trash2 } from "lucide-react";
import type { Invernada } from "@/lib/types";
import type { LotCardRow } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import { useDeleteLot } from "@/components/lots/use-delete-lot";
import { ArchiveLotDialog } from "@/components/lots/archive-lot-dialog";
import { EditLotDialog } from "@/components/lots/edit-lot-dialog";
import { MoveLotDialog } from "@/components/lots/move-lot-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type OpenDialog = "edit" | "move" | "archive" | null;

interface LotCardMenuProps {
  row: LotCardRow;
  /** Where the lot stands now, for the move dialog's destination list. */
  invernada: Invernada | null;
}

export function LotCardMenu({ row, invernada }: LotCardMenuProps) {
  const { lot, placement, heads, canDelete } = row;
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const { remove, removing, error } = useDeleteLot(lot);
  const { addToast } = useToast();

  useEffect(() => {
    if (error) addToast({ messageType: "error", text: error });
  }, [error, addToast]);

  const openState = (name: Exclude<OpenDialog, null>) => ({
    open: dialog === name,
    onOpenChange: (next: boolean) => setDialog(next ? name : null),
  });

  return (
    // The card is a link: no click inside the menu may navigate.
    <div onClick={(event) => event.preventDefault()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Ações do lote ${lot.name}`}
            className="min-h-11 min-w-11 text-ink-soft hover:text-ink md:min-h-8 md:min-w-8"
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil aria-hidden />
            Editar
          </DropdownMenuItem>
          {placement ? (
            <DropdownMenuItem onSelect={() => setDialog("move")}>
              <ArrowRightLeft aria-hidden />
              Mover de invernada
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link href={`/lots/${lot.id}`}>
                <History aria-hidden />
                Ver histórico
              </Link>
            </DropdownMenuItem>
          )}
          {placement && heads === 0 ? (
            <DropdownMenuItem onSelect={() => setDialog("archive")}>
              <Archive aria-hidden />
              Arquivar
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={removing}
                onSelect={() => {
                  void remove();
                }}
              >
                <Trash2 aria-hidden />
                {removing ? "Excluindo…" : "Excluir"}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditLotDialog lot={lot} trigger="none" {...openState("edit")} />
      {placement ? (
        <>
          <MoveLotDialog
            lot={lot}
            currentInvernada={invernada}
            trigger="none"
            {...openState("move")}
          />
          {heads === 0 ? (
            <ArchiveLotDialog
              lot={lot}
              currentPlacement={placement}
              trigger="none"
              {...openState("archive")}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
