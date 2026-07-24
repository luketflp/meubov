"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { Treatment } from "@/lib/types";
import { TODAY_ISO, daysBetween, formatDate } from "@/lib/domain/dates";
import { isFootAndMouth } from "@/lib/domain/status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusDot } from "@/components/ui/status-dot";
import { daysAgoLabel } from "@/components/calendar/helpers";

interface OverdueSectionProps {
  overdue: Treatment[];
  onMarkDone: (id: string) => void;
}

/** Overdue treatments of the whole herd, independent of the navigated month. */
export function OverdueSection({ overdue, onMarkDone }: OverdueSectionProps) {
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
          {overdue.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <div className="w-28 shrink-0">
                <p className="font-mono text-sm text-ink">{formatDate(t.date)}</p>
                <p className="text-xs font-medium text-overdue">
                  {daysAgoLabel(daysBetween(t.date, TODAY_ISO))}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  {isFootAndMouth(t) ? <StatusDot status="fmd" /> : null}
                  <span className="truncate">{t.name}</span>
                </p>
                <Link
                  href={`/herd/${t.animalEarTag}`}
                  className="font-mono text-xs text-brand hover:underline"
                >
                  {t.animalEarTag}
                </Link>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 md:min-h-0"
                onClick={() => onMarkDone(t.id)}
              >
                Marcar como feito
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
