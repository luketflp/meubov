"use client";

/**
 * "Reproduction" section (females): current diagnosis, calving forecast when
 * pregnant, list of breedings and calvings with links to bull and calf — plus
 * the three write actions (breeding, diagnosis, calving). A cobertura with a
 * registered semen bull names the bull and links to its page on Touros.
 *
 * Rendered for EVERY female, with or without history: an empty record is where
 * the first breeding gets registered. Actions disappear once the animal leaves
 * the herd (sold, dead), the history stays readable.
 */
import Link from "next/link";
import type { Animal, Breeding, ReproductionRecord } from "@/lib/types";
import { todayISO, formatDate } from "@/lib/domain/dates";
import {
  expectedCalvingDate,
  currentDiagnosis,
  daysToCalving,
  daysToCalvingText,
  hasCalvedSince,
} from "@/lib/domain/reproduction";
import { SectionCard } from "@/components/ui/section-card";
import { RegisterBreedingDialog } from "@/components/animal/RegisterBreedingDialog";
import { RegisterDiagnosisDialog } from "@/components/animal/RegisterDiagnosisDialog";
import { RegisterCalvingDialog } from "@/components/animal/RegisterCalvingDialog";
import { bullDisplay } from "@/components/semen/helpers";
import { ResultPill, BreedingPill } from "@/components/animal/reproduction-pills";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { animalByEarTag } from "@/lib/store/selectors";

function EarTagLink({ earTag }: { earTag: string }) {
  const animal = useHerdStore((state) => animalByEarTag(state.animals, earTag));
  if (!animal) return <span className="font-mono font-medium">{earTag}</span>;
  return (
    <Link
      href={`/herd/${animal.id}`}
      className="font-mono font-medium text-brand hover:underline"
    >
      {earTag}
    </Link>
  );
}

/** The cobertura's bull: a registered semen bull by name, any other by its ear tag. */
function BullLink({ breeding }: { breeding: Breeding }) {
  const semenBulls = useHerdStore((state) => state.semenBulls);
  const bull = bullDisplay(breeding, semenBulls);
  if (bull.href === null) return <EarTagLink earTag={breeding.bullEarTag} />;
  return (
    <Link href={bull.href} className="font-medium text-brand hover:underline">
      {bull.label}
    </Link>
  );
}

/** A female with no history yet: the section still opens, ready for the first record. */
const EMPTY_RECORD: ReproductionRecord = { breedings: [], diagnoses: [], calvings: [] };

interface AnimalReproductionProps {
  /** The female. Shown even without history — that is where recording starts. */
  animal: Animal;
}

export function AnimalReproduction({ animal }: AnimalReproductionProps) {
  const record = animal.reproduction ?? EMPTY_RECORD;
  const current = currentDiagnosis(record);
  const breedings = [...record.breedings].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  );
  const calvings = [...record.calvings].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  );
  // A recorded calving closes the pregnancy: without this the card would keep
  // forecasting a birth that already happened.
  const expected =
    current?.result === "pregnant" && !hasCalvedSince(record, current.breeding.date)
      ? expectedCalvingDate(current.breeding.date)
      : null;

  return (
    <SectionCard
      title="Reprodução"
      action={animal.active ? <RegisterBreedingDialog earTag={animal.earTag} /> : null}
    >
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
              {daysToCalvingText(daysToCalving(expected, todayISO()))}
            </p>
          </div>
        ) : null}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Coberturas</h3>
            {animal.active && breedings.length > 0 ? (
              <RegisterDiagnosisDialog earTag={animal.earTag} record={record} />
            ) : null}
          </div>
          {breedings.length > 0 ? (
            <ul className="mt-2 divide-y divide-hairline">
              {breedings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-mono text-sm text-ink">{formatDate(b.date)}</span>
                  <BreedingPill type={b.type} />
                  <span className="text-sm text-ink-soft">
                    Touro <BullLink breeding={b} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">Nenhuma cobertura registrada.</p>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Partos</h3>
            {animal.active ? <RegisterCalvingDialog dam={animal} /> : null}
          </div>
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
