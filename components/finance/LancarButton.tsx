"use client";

/** "Lançar": opens the EntryDialog. Nothing for a member without Financeiro edit. */
import { useState } from "react";
import { Plus } from "lucide-react";
import type { EntryKind } from "@/lib/types";
import type { EntryInitial } from "@/lib/domain/planTree";
import { useCan } from "@/lib/store/usePermissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EntryDialog } from "@/components/finance/EntryDialog";

export function LancarButton({
  size = "default",
  className,
  defaultKind = "expense",
  variant = "default",
  initial,
}: {
  size?: "sm" | "default";
  className?: string;
  defaultKind?: EntryKind;
  variant?: "default" | "outline" | "ghost";
  /** "Novo" on a picked nó of Lançamentos. */
  initial?: EntryInitial;
}) {
  const canEdit = useCan("finance", "edit");
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={cn("min-h-11 md:min-h-0", className)}
        onClick={() => setOpen(true)}
      >
        <Plus data-icon="inline-start" aria-hidden />
        Lançar
      </Button>
      <EntryDialog open={open} onOpenChange={setOpen} defaultKind={defaultKind} initial={initial} />
    </>
  );
}
