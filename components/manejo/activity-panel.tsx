"use client";

/**
 * "Painel de atividades" section: pending treatments grouped into batch
 * activities (same day/type/name), overdue first, each with a one-tap
 * "Concluir" action that marks the whole batch as done.
 */
import { ClipboardCheck } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { todayISO, formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  activityDueLabel,
  pendingActivities,
  type ManejoActivity,
} from "@/components/manejo/helpers";
import { ManejoTypePill } from "@/components/manejo/manejo-type-pill";

function ActivityRow({
  activity,
  onComplete,
}: {
  activity: ManejoActivity;
  onComplete: () => void;
}) {
  const heads = activity.earTags.length;
  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">{activity.name}</span>
          <ManejoTypePill action={activity.type} />
          {activity.footAndMouth ? <StatusPill status="fmd" /> : null}
          <StatusPill status={activity.status} withDot />
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          <span className="font-mono text-ink">{formatDate(activity.date)}</span>
          {" · "}
          {activityDueLabel(activity, todayISO())}
          {" · "}
          <span className="font-mono text-ink">{formatNumber(heads)}</span>{" "}
          {heads === 1 ? "animal" : "animais"}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 shrink-0 sm:min-h-9"
        onClick={onComplete}
      >
        <ClipboardCheck aria-hidden />
        Concluir
      </Button>
    </li>
  );
}

export function ActivityPanel() {
  const treatments = useHerdStore((s) => s.treatments);
  const completeTreatments = useHerdStore((s) => s.completeTreatments);
  const activities = pendingActivities(treatments, todayISO());

  return (
    <SectionCard title="Painel de atividades">
      {activities.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nenhuma atividade pendente"
          description="Vacinas, vermifugações e demais manejos agendados aparecem aqui quando estiverem próximos ou atrasados."
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {activities.map((activity) => (
            <ActivityRow
              key={activity.key}
              activity={activity}
              onComplete={() => completeTreatments(activity.treatmentIds)}
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
