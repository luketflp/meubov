"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { TreatmentStatus, Treatment } from "@/lib/types";
import { isFootAndMouth } from "@/lib/domain/status";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { StatusPill } from "@/components/ui/status-pill";
import { TYPE_LABEL } from "@/components/calendar/helpers";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { animalByEarTag } from "@/lib/store/selectors";
import { useCan } from "@/lib/store/usePermissions";
import { cn } from "@/lib/utils";

interface TreatmentRowProps {
  treatment: Treatment;
  status: TreatmentStatus;
  onMarkDone: (id: string) => void;
  onDelete: (treatment: Treatment) => void;
  /** Inside a group the header already names the treatment: show the animal. */
  compact?: boolean;
}

/** Treatment row reused in the day dialog and in the month list. */
export function TreatmentRow({
  treatment,
  status,
  onMarkDone,
  onDelete,
  compact = false,
}: TreatmentRowProps) {
  const animal = useHerdStore((state) =>
    animalByEarTag(state.animals, treatment.animalEarTag)
  );
  const canEdit = useCan("sanitary", "edit");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <div className="min-w-0 flex-1">
        {compact ? null : (
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            {isFootAndMouth(treatment) ? <StatusDot status="fmd" /> : null}
            <span className="truncate">{treatment.name}</span>
          </p>
        )}
        <p className={cn("text-xs text-ink-soft", compact ? "text-sm" : "mt-0.5")}>
          {compact ? null : `${TYPE_LABEL[treatment.type]} · `}
          {animal ? (
            <Link
              href={`/herd/${animal.id}`}
              className="font-mono text-brand hover:underline"
            >
              {treatment.animalEarTag}
            </Link>
          ) : (
            <span className="font-mono">{treatment.animalEarTag}</span>
          )}
        </p>
      </div>
      <StatusPill status={status} />
      {canEdit && status !== "done" ? (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-0"
          onClick={() => onMarkDone(treatment.id)}
        >
          Marcar como feito
        </Button>
      ) : null}
      {canEdit ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={compact ? "Excluir tratamento deste animal" : "Excluir tratamento"}
          className="size-11 shrink-0 text-ink-soft hover:text-overdue md:size-9"
          onClick={() => onDelete(treatment)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}
