/**
 * Identification header of the animal record: ear tag, derived status
 * and the main registration/zootechnical fields.
 */
import type { ReactNode } from "react";
import type { AnimalWithDerived } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate, formatAge } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { formatWeightWithArroba } from "@/lib/domain/weights";
import { SEX_LABEL, animalCategoryName } from "@/lib/domain/labels";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

function Field({ label, value, mono = false }: FieldProps) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
        {label}
      </dt>
      <dd className={cn("mt-0.5 text-sm font-medium text-ink", mono && "font-mono")}>
        {value}
      </dd>
    </div>
  );
}

interface AnimalHeaderProps {
  derived: AnimalWithDerived;
  lotName: string | null;
}

export function AnimalHeader({ derived, lotName }: AnimalHeaderProps) {
  const { animal, status, reason, currentWeightKg, adg } = derived;
  const customCategories = useHerdStore((s) => s.customCategories);

  return (
    <section className="rounded-lg border border-hairline bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-mono text-3xl font-semibold tracking-tight text-ink">
          {animal.earTag}
        </h1>
        <StatusPill status={status} withDot />
        {!animal.active ? (
          <span className="inline-flex items-center rounded-md border border-hairline bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft">
            Vendido
          </span>
        ) : null}
      </div>

      {reason ? <p className="mt-1.5 text-xs text-ink-soft">{reason}</p> : null}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Field label="Categoria" value={animalCategoryName(animal, customCategories)} />
        <Field label="Raça" value={animal.breed} />
        <Field label="Sexo" value={SEX_LABEL[animal.sex]} />
        <Field
          label="Nascimento"
          value={`${formatDate(animal.birthDate)} · ${formatAge(animal.birthDate)}`}
          mono
        />
        <Field label="Lote" value={lotName ?? "—"} />
        <Field
          label="Peso atual"
          value={currentWeightKg !== null ? formatWeightWithArroba(currentWeightKg) : "—"}
          mono
        />
        <Field
          label="GMD"
          value={adg !== null ? `${formatNumber(adg, 2)} kg/dia` : "—"}
          mono
        />
      </dl>
    </section>
  );
}
