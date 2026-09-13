"use client";

import { Trash2 } from "lucide-react";
import type { Treatment } from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { deriveTreatmentStatus, isFootAndMouth } from "@/lib/domain/status";
import { useCan } from "@/lib/store/usePermissions";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { TreatmentRow } from "@/components/calendar/TreatmentRow";
import { TYPE_LABEL, groupTreatments } from "@/components/calendar/helpers";
import { cn } from "@/lib/utils";

interface TreatmentGroupListProps {
  treatments: Treatment[];
  onMarkDone: (id: string) => void;
  /** Deletes one animal's treatment. */
  onDelete: (treatment: Treatment) => void;
  /** Deletes everything booked with it (the group header button). */
  onDeleteGroup: (treatment: Treatment) => void;
  className?: string;
}

/**
 * Treatments of a day as the farmer booked them: one action that covered many
 * animals reads as a single agendamento with its heads under it, and can be
 * undone in one go. A treatment standing alone keeps the plain row.
 */
export function TreatmentGroupList({
  treatments,
  onMarkDone,
  onDelete,
  onDeleteGroup,
  className,
}: TreatmentGroupListProps) {
  const canEdit = useCan("sanitary", "edit");
  const groups = groupTreatments(treatments);

  return (
    <ul className={cn("divide-y divide-hairline", className)}>
      {groups.map((group) => {
        const [first] = group.treatments;
        if (group.treatments.length === 1) {
          return (
            <TreatmentRow
              key={group.key}
              treatment={first}
              status={deriveTreatmentStatus(first, todayISO())}
              onMarkDone={onMarkDone}
              onDelete={onDelete}
            />
          );
        }
        return (
          <li key={group.key} className="py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-ink">
                {isFootAndMouth(first) ? <StatusDot status="fmd" /> : null}
                <span className="truncate">{first.name}</span>
                <span className="shrink-0 text-xs font-normal text-ink-soft">
                  {TYPE_LABEL[first.type]} · {group.treatments.length} animais
                </span>
              </p>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 text-ink-soft hover:text-overdue md:min-h-0"
                  onClick={() => onDeleteGroup(first)}
                >
                  <Trash2 data-icon="inline-start" aria-hidden />
                  Excluir todos
                </Button>
              ) : null}
            </div>
            <ul className="mt-1 divide-y divide-hairline border-l border-hairline pl-3">
              {group.treatments.map((t) => (
                <TreatmentRow
                  key={t.id}
                  treatment={t}
                  status={deriveTreatmentStatus(t, todayISO())}
                  onMarkDone={onMarkDone}
                  onDelete={onDelete}
                  compact
                />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
