/**
 * "Reprodução": the season's pregnancy rate and funnel, the parição month by
 * month, and the next calvings, each one opening its dam's ficha.
 */
import Link from "next/link";
import { ArrowRight, Dna } from "lucide-react";
import type { CalvingMonth, ExpectedCalving, SeasonReproduction } from "@/lib/store/dashboard";
import { daysToCalving, daysToCalvingText } from "@/lib/domain/reproduction";
import { formatNumber } from "@/lib/domain/format";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { CalvingBars } from "@/components/dashboard/CalvingBars";
import { dayMonth } from "@/components/dashboard/helpers";
import { cn } from "@/lib/utils";

interface ReproductionCardProps {
  season: SeasonReproduction;
  months: CalvingMonth[];
  next: ExpectedCalving[];
  todayIso: string;
}

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

export function ReproductionCard({ season, months, next, todayIso }: ReproductionCardProps) {
  const empty = season.exposed === 0 && months.every((month) => month.born + month.due === 0);
  const funnel = [
    { label: "Expostas", value: season.exposed, bar: "bg-ink-soft" },
    { label: "Diagnosticadas", value: season.diagnosed, bar: "bg-scheduled" },
    { label: "Prenhes", value: season.pregnant, bar: "bg-brand" },
    { label: "Paridas", value: season.calved, bar: "bg-healthy" },
  ];

  return (
    <SectionCard
      title="Reprodução"
      subtitle="coberturas dos últimos 12 meses"
      action={
        <Link
          href="/reproducao"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Abrir Reprodução
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {empty ? (
        <EmptyState
          icon={Dna}
          title="Sem coberturas no último ano"
          description="Registre coberturas e inseminações em Reprodução para acompanhar a prenhez e a parição."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <div className="space-y-4">
              <div>
                <p className={LABEL}>Taxa de prenhez</p>
                <p className="mt-1 font-mono text-3xl font-medium text-healthy">
                  {season.ratePct === null ? "—" : `${formatNumber(season.ratePct)}%`}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {formatNumber(season.pregnant)} prenhes de {formatNumber(season.diagnosed)}{" "}
                  diagnosticadas
                  {season.awaiting > 0 ? ` · ${formatNumber(season.awaiting)} sem DG` : ""}
                </p>
              </div>
              <ul className="space-y-2">
                {funnel.map((step) => (
                  <li
                    key={step.label}
                    className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-2.5"
                  >
                    <span className="text-[13px] text-ink-soft">{step.label}</span>
                    <span
                      aria-hidden
                      className="h-2 overflow-hidden rounded-full border border-hairline bg-surface"
                    >
                      <span
                        className={cn("block h-full", step.bar)}
                        style={{
                          width: `${season.exposed === 0 ? 0 : (step.value / season.exposed) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="text-right font-mono text-[13px] font-medium text-ink">
                      {formatNumber(step.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={LABEL}>Parição</p>
                <span className="flex gap-3 text-xs text-ink-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full bg-brand" />
                    Nascidos
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 rounded-[2px] border border-dashed border-brand bg-brand-soft"
                    />
                    Previstos
                  </span>
                </span>
              </div>
              <div className="mt-1.5">
                <CalvingBars months={months} />
              </div>
            </div>
          </div>

          {next.length > 0 ? (
            <div className="-mx-4 mt-4 -mb-4 border-t border-hairline px-4 py-3">
              <p className={cn(LABEL, "mb-2")}>Próximos partos</p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {next.map((calving) => (
                  <li key={calving.dam.id}>
                    <Link
                      href={`/herd/${calving.dam.id}`}
                      className="block rounded-md border border-hairline bg-surface px-2.5 py-2 transition-colors hover:border-brand"
                    >
                      <span className="block font-mono text-sm font-medium text-ink">
                        {calving.dam.earTag}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {dayMonth(calving.date)} ·{" "}
                        {daysToCalvingText(daysToCalving(calving.date, todayIso))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
