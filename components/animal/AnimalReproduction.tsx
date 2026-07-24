/**
 * "Reproduction" section (females): current diagnosis, calving forecast when
 * pregnant, list of breedings and calvings with links to bull and calf.
 */
import Link from "next/link";
import type { ReproductionRecord, DiagnosisResult, BreedingType } from "@/lib/types";
import { TODAY_ISO, formatDate } from "@/lib/domain/dates";
import { expectedCalvingDate, currentDiagnosis, daysToCalving } from "@/lib/domain/reproduction";
import {
  DIAGNOSIS_RESULT_LABEL,
  BREEDING_TYPE_LABEL,
} from "@/lib/domain/labels";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const RESULT_STYLE: Record<DiagnosisResult, string> = {
  pregnant: "bg-healthy-soft text-healthy",
  open: "border border-hairline bg-surface text-ink-soft",
  pending: "bg-attention-soft text-attention",
};

const BREEDING_STYLE: Record<BreedingType, string> = {
  timedAI: "bg-scheduled-soft text-scheduled",
  naturalMating: "bg-fmd-soft text-fmd",
};

function ResultPill({ result }: { result: DiagnosisResult }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        RESULT_STYLE[result]
      )}
    >
      {DIAGNOSIS_RESULT_LABEL[result]}
    </span>
  );
}

function BreedingPill({ type }: { type: BreedingType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        BREEDING_STYLE[type]
      )}
    >
      {BREEDING_TYPE_LABEL[type]}
    </span>
  );
}

function EarTagLink({ earTag }: { earTag: string }) {
  return (
    <Link
      href={`/herd/${encodeURIComponent(earTag)}`}
      className="font-mono font-medium text-brand hover:underline"
    >
      {earTag}
    </Link>
  );
}

function daysToCalvingText(days: number): string {
  if (days === 0) return "hoje";
  if (days === 1) return "em 1 dia";
  if (days === -1) return "há 1 dia";
  return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
}

interface AnimalReproductionProps {
  record: ReproductionRecord;
}

export function AnimalReproduction({ record }: AnimalReproductionProps) {
  const current = currentDiagnosis(record);
  const breedings = [...record.breedings].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  );
  const calvings = [...record.calvings].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  );
  const expected =
    current?.result === "pregnant" ? expectedCalvingDate(current.breeding.date) : null;

  return (
    <SectionCard title="Reprodução">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
            Diagnóstico atual
          </span>
          {current ? (
            <ResultPill result={current.result} />
          ) : (
            <span className="text-sm text-ink-soft">Sem coberturas registradas</span>
          )}
        </div>

        {expected ? (
          <div className="rounded-lg border border-brand/20 bg-brand-soft p-4">
            <p className="text-[11px] font-medium tracking-wide text-brand uppercase">
              Previsão de parto
            </p>
            <p className="mt-1 font-mono text-xl font-semibold text-ink">
              {formatDate(expected)}
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">
              {daysToCalvingText(daysToCalving(expected, TODAY_ISO))}
            </p>
          </div>
        ) : null}

        <div>
          <h3 className="text-sm font-semibold text-ink">Coberturas</h3>
          {breedings.length > 0 ? (
            <ul className="mt-2 divide-y divide-hairline">
              {breedings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-mono text-sm text-ink">{formatDate(b.date)}</span>
                  <BreedingPill type={b.type} />
                  <span className="text-sm text-ink-soft">
                    Touro <EarTagLink earTag={b.bullEarTag} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">Nenhuma cobertura registrada.</p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink">Partos</h3>
          {calvings.length > 0 ? (
            <ul className="mt-2 divide-y divide-hairline">
              {calvings.map((c) => (
                <li
                  key={c.calfEarTag}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                >
                  <span className="font-mono text-sm text-ink">{formatDate(c.date)}</span>
                  <span className="text-sm text-ink-soft">
                    Bezerro <EarTagLink earTag={c.calfEarTag} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">Nenhum parto registrado.</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
