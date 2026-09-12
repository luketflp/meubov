"use client";

/**
 * Option lists and the select control shared by the padrão, the desktop table
 * and the phone cards of "Cadastrar vários animais". Categories are select
 * choices ("base:<category>" or "custom:<id>", see lib/domain/animalBatch);
 * lots are only the ones placed in an invernada, the only ones a new animal
 * may join.
 */
import { useMemo, type ReactNode } from "react";
import type { Category, Sex } from "@/lib/types";
import type { BatchField, BatchRowErrors } from "@/lib/domain/animalBatch";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { CATEGORY_LABEL, SEX_LABEL } from "@/lib/domain/labels";
import { currentPlacementForLot, currentlyPlacedLots } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FieldOption {
  value: string;
  label: string;
}

export interface BatchOptions {
  categories: FieldOption[];
  breeds: FieldOption[];
  sexes: FieldOption[];
  lots: FieldOption[];
}

/** The label of `value` in `options`, or the value itself when it is gone. */
export function optionLabel(options: readonly FieldOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function useBatchOptions(): BatchOptions {
  const breeds = useHerdStore((s) => s.breeds);
  const lots = useHerdStore((s) => s.lots);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const customCategories = useHerdStore((s) => s.customCategories);

  return useMemo(() => {
    const invernadaById = new Map(invernadas.map((item) => [item.id, item]));
    return {
      categories: [
        ...(Object.keys(CATEGORY_LABEL) as Category[]).map((category) => ({
          value: `base:${category}`,
          label: CATEGORY_LABEL[category],
        })),
        ...customCategories.map((custom) => ({
          value: `custom:${custom.id}`,
          label: `${custom.name} (${CATEGORY_LABEL[custom.baseCategory]})`,
        })),
      ],
      breeds: breeds.map((breed) => ({ value: breed, label: breed })),
      sexes: (Object.keys(SEX_LABEL) as Sex[]).map((sex) => ({ value: sex, label: SEX_LABEL[sex] })),
      lots: currentlyPlacedLots(lots, lotPlacements).map((lot) => {
        const placement = currentPlacementForLot(lot.id, lotPlacements);
        const invernada = placement ? invernadaById.get(placement.invernadaId) : undefined;
        return {
          value: lot.id,
          label: `${lot.name} · ${invernada ? `Inv. ${invernada.code}` : "Sem invernada"}`,
        };
      }),
    };
  }, [breeds, lots, invernadas, lotPlacements, customCategories]);
}

interface FieldSelectProps {
  value: string;
  options: readonly FieldOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  /** Rendered before the value inside the trigger (the override dot). */
  children?: ReactNode;
}

export function FieldSelect({
  value,
  options,
  onChange,
  placeholder = "Selecione",
  disabled,
  invalid,
  className,
  id,
  ariaLabel,
  children,
}: FieldSelectProps) {
  return (
    <Select value={value === "" ? undefined : value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid ? true : undefined}
        className={cn("w-full min-w-0", className)}
      >
        {children ? (
          <span className="flex min-w-0 items-center gap-1.5">
            {children}
            <SelectValue placeholder={placeholder} className="truncate" />
          </span>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Marks a value a line set for itself instead of taking it from the padrão. */
export function OverrideDot() {
  return <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />;
}

/** What a line of the list can ask the form to do; keyed by the line's key. */
export interface BatchRowHandlers {
  onEarTag: (key: string, value: string) => void;
  onWeight: (key: string, value: string) => void;
  /** A blank value, or the padrão's own, returns the field to the padrão. */
  onOverride: (key: string, field: BatchField, value: string) => void;
  onRemove: (key: string) => void;
  /** Enter on a brinco: next line's brinco, or a new line after the last. */
  onEarTagEnter: (key: string) => void;
}

/** Errors are rebuilt on every keystroke; lines re-render only when theirs change. */
export function sameRowErrors(a: BatchRowErrors, b: BatchRowErrors): boolean {
  const keys = Object.keys(a) as (keyof BatchRowErrors)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** Line errors in reading order: brinco, nascimento, peso. */
export function rowErrorMessages(errors: BatchRowErrors): string[] {
  return [errors.earTag, errors.birthDate, errors.weightKg].filter(
    (message): message is string => message !== undefined
  );
}
