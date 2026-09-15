"use client";

/**
 * "Excluir touro" in its three seats: the trash in a Touros table row, the
 * trash on the phone card, and the text button among the bull page's actions.
 * The flow itself lives in useDeleteSemenBull.
 */
import { Trash2 } from "lucide-react";
import type { SemenBull } from "@/lib/types";
import { useDeleteSemenBull } from "@/components/semen/use-delete-semen-bull";
import { Button } from "@/components/ui/button";

interface DeleteSemenBullButtonProps {
  bull: SemenBull;
  /** "row" sits in a table cell, "card" on the phone card, "header" among the page's actions. */
  variant: "row" | "card" | "header";
  /** Called after the server accepted the deletion. */
  onDeleted?: () => void;
}

export function DeleteSemenBullButton({ bull, variant, onDeleted }: DeleteSemenBullButtonProps) {
  const { remove, removing } = useDeleteSemenBull(bull, onDeleted);

  if (variant === "header") {
    return (
      <Button
        type="button"
        variant="ghost"
        disabled={removing}
        onClick={remove}
        className="min-h-11 text-ink-soft hover:text-overdue"
      >
        <Trash2 aria-hidden />
        {removing ? "Excluindo…" : "Excluir touro"}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Excluir touro ${bull.name}`}
      disabled={removing}
      onClick={remove}
      className={
        variant === "row"
          ? "size-11 shrink-0 text-ink-soft hover:text-overdue md:size-9"
          : "-mr-2 size-11 shrink-0 text-ink-soft hover:text-overdue"
      }
    >
      <Trash2 className="size-4" aria-hidden />
    </Button>
  );
}
