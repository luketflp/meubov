"use client";

import Link from "next/link";
import { CheckCircle2, Trash2 } from "lucide-react";
import type { Treatment } from "@/lib/types";
import { todayISO, daysBetween, formatDate } from "@/lib/domain/dates";
import { isFootAndMouth } from "@/lib/domain/status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusDot } from "@/components/ui/status-dot";
import { daysAgoLabel, groupTreatments } from "@/components/calendar/helpers";
import { useHerdStore } from "@/lib/store/useHerdStore";

interface OverdueSectionProps {
  overdue: Treatment[];
  onMarkDone: (id: string) => void;
  /** Deletes one animal's treatment. */
  onDelete: (treatment: Treatment) => void;
  /** Deletes everything booked with it. */
  onDeleteGroup: (treatment: Treatment) => void;
}

/** Overdue treatments of the whole herd, independent of the navigated month. */
export function OverdueSection({
  overdue,
  onMarkDone,
  onDelete,
  onDeleteGroup,
}: OverdueSectionProps) {
  const animals = useHerdStore((state) => state.animals);
  const animalIdsByEarTag = new Map(animals.map((animal) => [animal.earTag, animal.id]));
  const groups = groupTreatments(overdue);

  /** The ear tag, linked to the animal's ficha when it still resolves. */
  function animalLink(treatment: Treatment) {
    const animalId = animalIdsByEarTag.get(treatment.animalEarTag);
    return animalId ? (
      <Link href={`/herd/${animalId}`} className="font-mono text-xs text-brand hover:underline">
        {treatment.animalEarTag}
      </Link>
    ) : (
      <span className="font-mono text-xs">{treatment.animalEarTag}</span>
    );
  }

  /** Date and how long the treatment has been waiting. */
  function whenColumn(treatment: Treatment) {
    return (
      <div className="w-28 shrink-0">
        <p className="font-mono text-sm text-ink">{formatDate(treatment.date)}</p>
        <p className="text-xs font-medium text-overdue">
          {daysAgoLabel(daysBetween(treatment.date, todayISO()))}
        </p>
      </div>
    );
  }

  return (
    <SectionCard
      title="Atrasados"
      action={
        overdue.length > 0 ? (
          <span className="rounded-md bg-overdue-soft px-2 py-0.5 font-mono text-xs font-medium text-overdue">
            {overdue.length}
          </span>
        ) : undefined
      }
    >
      {overdue.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nenhum tratamento atrasado"
          description="Todo o rebanho está em dia com o calendário sanitário."
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {groups.map((group) => {
            const [first] = group.treatments;
            if (group.treatments.length === 1) {
              return (
                <li key={group.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                  {whenColumn(first)}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      {isFootAndMouth(first) ? <StatusDot status="fmd" /> : null}
                      <span className="truncate">{first.name}</span>
                    </p>
                    {animalLink(first)}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 md:min-h-0"
                    onClick={() => onMarkDone(first.id)}
                  >
                    Marcar como feito
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Excluir tratamento"
                    className="size-11 shrink-0 text-ink-soft hover:text-overdue md:size-9"
                    onClick={() => onDelete(first)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              );
            }
            return (
              <li key={group.key} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {whenColumn(first)}
                  <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-ink">
                    {isFootAndMouth(first) ? <StatusDot status="fmd" /> : null}
                    <span className="truncate">{first.name}</span>
                    <span className="shrink-0 text-xs font-normal text-ink-soft">
                      {group.treatments.length} animais
                    </span>
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 text-ink-soft hover:text-overdue md:min-h-0"
                    onClick={() => onDeleteGroup(first)}
                  >
                    <Trash2 data-icon="inline-start" aria-hidden />
                    Excluir todos
                  </Button>
                </div>
                <ul className="mt-1 divide-y divide-hairline border-l border-hairline pl-3">
                  {group.treatments.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                      <span className="min-w-0 flex-1">{animalLink(t)}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11 md:min-h-0"
                        onClick={() => onMarkDone(t.id)}
                      >
                        Marcar como feito
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Excluir tratamento deste animal"
                        className="size-11 shrink-0 text-ink-soft hover:text-overdue md:size-9"
                        onClick={() => onDelete(t)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
