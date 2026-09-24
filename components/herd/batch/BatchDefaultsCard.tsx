"use client";

/**
 * "Padrão do grupo": the fields every line of the batch inherits unless it
 * overrides them; the peso is optional and fills only lines left blank. Follows the single-animal dialog: the categoria can lock the
 * sexo, and a farm with no raça or no placed lote sees what is missing instead
 * of an empty list.
 */
import type { BatchDefaultErrors, BatchDefaults } from "@/lib/domain/animalBatch";
import type { AnimalPrerequisiteHints } from "@/components/herd/prerequisites";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { FieldSelect, type BatchOptions } from "@/components/herd/batch/BatchFieldSelects";

interface BatchDefaultsCardProps {
  defaults: BatchDefaults;
  /** Only the errors the form decided to show. */
  errors: BatchDefaultErrors;
  options: BatchOptions;
  prerequisites: AnimalPrerequisiteHints;
  sexLocked: boolean;
  onChange: (field: keyof BatchDefaults, value: string) => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-overdue">{message}</p>;
}

export function BatchDefaultsCard({
  defaults,
  errors,
  options,
  prerequisites,
  sexLocked,
  onChange,
}: BatchDefaultsCardProps) {
  return (
    <SectionCard
      title="Padrão do grupo"
      action={
        <p className="hidden text-xs text-ink-soft sm:block">
          Vale para toda linha que você não alterar
        </p>
      }
    >
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="grid gap-1.5">
          <Label htmlFor="batch-category">Categoria</Label>
          <FieldSelect
            id="batch-category"
            value={defaults.category}
            options={options.categories}
            onChange={(value) => onChange("category", value)}
            invalid={Boolean(errors.category)}
            className="min-h-11 bg-panel"
          />
          <FieldError message={errors.category} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="batch-breed">Raça</Label>
          <FieldSelect
            id="batch-breed"
            value={defaults.breed}
            options={options.breeds}
            onChange={(value) => onChange("breed", value)}
            disabled={prerequisites.breed !== null}
            invalid={Boolean(errors.breed)}
            className="min-h-11 bg-panel"
          />
          {prerequisites.breed ? (
            <p className="text-xs text-attention">{prerequisites.breed}</p>
          ) : (
            <FieldError message={errors.breed} />
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="batch-sex">Sexo</Label>
          <FieldSelect
            id="batch-sex"
            value={defaults.sex}
            options={options.sexes}
            onChange={(value) => onChange("sex", value)}
            disabled={sexLocked}
            invalid={Boolean(errors.sex)}
            className="min-h-11 bg-panel"
          />
          {sexLocked ? <p className="text-xs text-ink-soft">Definido pela categoria.</p> : null}
          <FieldError message={errors.sex} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="batch-birth">Nascimento</Label>
          <Input
            id="batch-birth"
            value={defaults.birthDate}
            onChange={(event) => onChange("birthDate", event.target.value)}
            placeholder="Ex.: 2025"
            aria-invalid={errors.birthDate ? true : undefined}
            className="min-h-11 bg-panel"
          />
          {errors.birthDate ? (
            <FieldError message={errors.birthDate} />
          ) : (
            <p className="text-xs text-ink-soft">DD/MM/AAAA ou só o ano</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="batch-lot">Lote</Label>
          <FieldSelect
            id="batch-lot"
            value={defaults.lotId}
            options={options.lots}
            onChange={(value) => onChange("lotId", value)}
            placeholder="Selecione o lote"
            disabled={prerequisites.lot !== null}
            invalid={Boolean(errors.lotId)}
            className="min-h-11 bg-panel"
          />
          {prerequisites.lot ? (
            <p className="text-xs text-attention">{prerequisites.lot}</p>
          ) : (
            <FieldError message={errors.lotId} />
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="batch-weight">
            Peso <span className="font-normal text-ink-soft">(opcional)</span>
          </Label>
          <div className="relative">
            <Input
              id="batch-weight"
              value={defaults.weightKg}
              onChange={(event) => onChange("weightKg", event.target.value)}
              inputMode="decimal"
              placeholder="Ex.: 320"
              aria-invalid={errors.weightKg ? true : undefined}
              className="min-h-11 bg-panel pr-9 font-mono"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-soft">
              kg
            </span>
          </div>
          <FieldError message={errors.weightKg} />
        </div>
      </div>
    </SectionCard>
  );
}
