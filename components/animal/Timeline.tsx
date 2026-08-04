/**
 * "Timeline" section: birth, weighings, treatments and reproductive events
 * merged in descending date order, with a dot per type.
 */
import type { ReactNode } from "react";
import type { Animal, Treatment } from "@/lib/types";
import { todayISO, formatDate } from "@/lib/domain/dates";
import { formatWeightWithArroba } from "@/lib/domain/weights";
import {
  DIAGNOSIS_RESULT_LABEL,
  BREEDING_TYPE_LABEL,
} from "@/lib/domain/labels";
import { deriveTreatmentStatus } from "@/lib/domain/status";
import { SectionCard } from "@/components/ui/section-card";
import { StatusDot } from "@/components/ui/status-dot";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  key: string;
  date: string;
  label: string;
  description: ReactNode;
  dot: ReactNode;
}

function ColorDot({ className }: { className: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} />;
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono">{children}</span>;
}

/** Merges all events of the animal and sorts by descending date. */
function buildEvents(animal: Animal, treatments: Treatment[]): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      key: "birth",
      date: animal.birthDate,
      label: "Nascimento",
      description: "Nascimento do animal",
      dot: <ColorDot className="bg-scheduled" />,
    },
  ];

  for (const w of animal.weighings) {
    events.push({
      key: `weighing-${w.date}-${w.weightKg}`,
      date: w.date,
      label: "Pesagem",
      description: <Mono>{formatWeightWithArroba(w.weightKg)}</Mono>,
      dot: <ColorDot className="bg-brand" />,
    });
  }

  for (const t of treatments) {
    const status = deriveTreatmentStatus(t, todayISO());
    events.push({
      key: `treatment-${t.id}`,
      date: t.date,
      label: "Tratamento",
      description: (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {t.name}
          <StatusPill status={status} />
        </span>
      ),
      dot: <StatusDot status={status} />,
    });
  }

  const record = animal.reproduction;
  if (record) {
    for (const b of record.breedings) {
      events.push({
        key: `breeding-${b.id}`,
        date: b.date,
        label: "Cobertura",
        description: (
          <>
            {BREEDING_TYPE_LABEL[b.type]} com touro <Mono>{b.bullEarTag}</Mono>
          </>
        ),
        dot: <ColorDot className="bg-fmd" />,
      });
    }
    for (const d of record.diagnoses) {
      events.push({
        key: `diagnosis-${d.breedingId}`,
        date: d.date,
        label: "Diagnóstico",
        description: `Diagnóstico de gestação: ${DIAGNOSIS_RESULT_LABEL[d.result]}`,
        dot: <ColorDot className="bg-fmd" />,
      });
    }
    for (const c of record.calvings) {
      events.push({
        key: `calving-${c.calfEarTag}`,
        date: c.date,
        label: "Parto",
        description: (
          <>
            Nascimento do bezerro <Mono>{c.calfEarTag}</Mono>
          </>
        ),
        dot: <ColorDot className="bg-fmd" />,
      });
    }
  }

  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

interface TimelineProps {
  animal: Animal;
  treatments: Treatment[];
}

export function Timeline({ animal, treatments }: TimelineProps) {
  const events = buildEvents(animal, treatments);

  return (
    <SectionCard title="Linha do tempo">
      <ol className="relative ml-1 space-y-5 border-l border-hairline pl-5">
        {events.map((event) => (
          <li key={event.key} className="relative">
            <span className="absolute top-1 -left-6 flex rounded-full ring-4 ring-panel">
              {event.dot}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
                {event.label}
              </span>
              <span className="font-mono text-xs text-ink-soft">
                {formatDate(event.date)}
              </span>
            </div>
            <div className="mt-0.5 text-sm text-ink">{event.description}</div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
