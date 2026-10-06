"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, Fence, Trash2 } from "lucide-react";
import type { Treatment } from "@/lib/types";
import { todayISO, daysBetween, formatDate } from "@/lib/domain/dates";
import { isFootAndMouth } from "@/lib/domain/status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusDot } from "@/components/ui/status-dot";
import { daysAgoLabel, groupTreatments, overdueByLot } from "@/components/calendar/helpers";
import { activeLots } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";

interface OverdueSectionProps {
  overdue: Treatment[];
  onMarkDone: (id: string) => void;
  /** Deletes one animal's treatment. */
  onDelete: (treatment: Treatment) => void;
  /** Deletes everything booked with it. */
  onDeleteGroup: (treatment: Treatment) => void;
}

/**
 * Overdue treatments of the whole herd, independent of the navigated month,
 * lote by lote (the lote each animal is in today), each lote listing its
 * agendamentos.
 */
export function OverdueSection({
  overdue,
  onMarkDone,
  onDelete,
  onDeleteGroup,
}: OverdueSectionProps) {
  const animals = useHerdStore((state) => state.animals);
  const lots = useHerdStore((state) => state.lots);
  const canEdit = useCan("sanitary", "edit");
  const idPrefix = useId();
  /** Agendamentos whose heads the farmer opened; all start closed. */
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set());
  const animalIdsByEarTag = new Map(animals.map((animal) => [animal.earTag, animal.id]));
  const byLot = overdueByLot(overdue, animals, lots);
  // A deleted lote still names the sold animals' treatments, but has no page to open.
  const liveLotIds = new Set(activeLots(lots).map((lot) => lot.id));

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

  function toggleGroup(key: string) {
    setOpenGroups((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

  /** A lote's agendamentos: one booked for many animals folds its heads under it. */
  function agendamentos(lotKey: string, treatments: Treatment[]) {
    return (
      <ul className="divide-y divide-hairline">
        {groupTreatments(treatments).map((group) => {
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
                {canEdit ? (
                  <>
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
                  </>
                ) : null}
              </li>
            );
          }
          // One batch can span lotes; each lote folds its own share.
          const openKey = `${lotKey}:${group.key}`;
          const open = openGroups.has(openKey);
          const panelId = `${idPrefix}-${openKey}`;
          const Chevron = open ? ChevronDown : ChevronRight;
          return (
            <li key={group.key} className="py-2.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {whenColumn(first)}
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={open ? panelId : undefined}
                  onClick={() => toggleGroup(openKey)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-ink md:min-h-0"
                >
                  <Chevron className="size-4 shrink-0 text-ink-soft" aria-hidden />
                  {isFootAndMouth(first) ? <StatusDot status="fmd" /> : null}
                  <span className="truncate">{first.name}</span>
                  <span className="shrink-0 text-xs font-normal text-ink-soft">
                    {group.treatments.length} animais
                  </span>
                </button>
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
              {open ? (
                <ul id={panelId} className="mt-1 divide-y divide-hairline border-l border-hairline pl-3">
                  {group.treatments.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                      <span className="min-w-0 flex-1">{animalLink(t)}</span>
                      {canEdit ? (
                        <>
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
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
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
        <div className="flex flex-col gap-4">
          {byLot.map((lot) => (
            <section key={lot.lotId ?? "sem-lote"} aria-label={lot.name ?? "Sem lote"}>
              <header className="flex items-center gap-2 border-b border-hairline pb-1.5">
                <Fence className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
                <h3 className="text-sm font-semibold text-ink">{lot.name ?? "Sem lote"}</h3>
                <span className="text-xs text-ink-soft">
                  {lot.treatments.length === 1 ? "1 tratamento" : `${lot.treatments.length} tratamentos`}
                </span>
                {lot.lotId && liveLotIds.has(lot.lotId) ? (
                  <Link
                    href={`/lots/${lot.lotId}`}
                    className="ml-auto inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
                  >
                    Ver lote
                  </Link>
                ) : null}
              </header>
              {agendamentos(lot.lotId ?? "sem-lote", lot.treatments)}
            </section>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
