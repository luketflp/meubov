"use client";

import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import type { TreatmentStatus, Treatment } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Pending treatment with the status derived for today. */
export interface PendingTreatmentItem {
  treatment: Treatment;
  status: TreatmentStatus;
}

/** Maximum rows shown in the widget; the rest goes to the calendar. */
const MAX_ROWS = 8;

interface UpcomingTreatmentsProps {
  /** Pending treatments already sorted by date (overdue first). */
  items: PendingTreatmentItem[];
  onComplete: (id: string) => void;
  compact?: boolean;
}

/** List of pending treatments with an inline complete action. */
export function UpcomingTreatments({
  items,
  onComplete,
  compact = false,
}: UpcomingTreatmentsProps) {
  const visible = items.slice(0, MAX_ROWS);
  const remaining = items.length - visible.length;

  return (
    <SectionCard title="Próximos tratamentos">
      {items.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Nenhum tratamento pendente"
          description="Todos os tratamentos do rebanho foram concluídos."
        />
      ) : (
        <>
          <ul className="-my-1 divide-y divide-hairline">
            {visible.map(({ treatment, status }) => (
              <li
                key={treatment.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5",
                  compact && "py-1.5"
                )}
              >
                <span className="font-mono text-xs text-ink-soft">
                  {formatDate(treatment.date)}
                </span>
                <span className="text-sm text-ink">{treatment.name}</span>
                <span className="font-mono text-sm text-ink">
                  {treatment.animalEarTag}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <StatusPill status={status} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 text-brand md:min-h-0"
                    onClick={() => onComplete(treatment.id)}
                    aria-label={`Concluir ${treatment.name} do animal ${treatment.animalEarTag}`}
                  >
                    Concluir
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {remaining > 0 ? (
            <Link
              href="/calendar"
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
            >
              + {remaining} no calendário
            </Link>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
