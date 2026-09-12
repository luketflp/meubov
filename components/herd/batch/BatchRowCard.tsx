"use client";

/**
 * Phone line of "Cadastrar vários animais": Brinco and Peso stay in reach, the
 * summary names only what this animal does differently from the padrão, and
 * "Alterar" opens the five fields. Memoized like the desktop row.
 */
import { memo } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import type { CustomCategory } from "@/lib/types";
import {
  effectiveRow,
  type BatchDefaults,
  type BatchField,
  type BatchRow,
  type BatchRowErrors,
} from "@/lib/domain/animalBatch";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FieldSelect,
  OverrideDot,
  optionLabel,
  rowErrorMessages,
  sameRowErrors,
  type BatchOptions,
  type BatchRowHandlers,
} from "@/components/herd/batch/BatchFieldSelects";

interface BatchRowCardProps {
  row: BatchRow;
  line: number;
  errors: BatchRowErrors;
  defaults: BatchDefaults;
  options: BatchOptions;
  customCategories: CustomCategory[];
  handlers: BatchRowHandlers;
  expanded: boolean;
  onToggle: (key: string) => void;
}

function ResetLink({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="inline-flex min-h-8 w-fit items-center gap-1 text-xs text-ink-soft hover:text-ink"
    >
      <RotateCcw aria-hidden className="size-3" />
      Voltar ao padrão
    </button>
  );
}

export const BatchRowCard = memo(
  function BatchRowCard({
    row,
    line,
    errors,
    defaults,
    options,
    customCategories,
    handlers,
    expanded,
    onToggle,
  }: BatchRowCardProps) {
    const effective = effectiveRow(row, defaults, customCategories);
    const messages = rowErrorMessages(errors);
    const sexOverridden = row.overrides.sex !== undefined && !effective.sexLocked;
    const id = (field: BatchField) => `batch-card-${row.key}-${field}`;

    const differences = [
      row.overrides.category !== undefined && optionLabel(options.categories, effective.category),
      row.overrides.breed !== undefined && effective.breed,
      sexOverridden && optionLabel(options.sexes, effective.sex),
      row.overrides.birthDate !== undefined && effective.birthDate,
      row.overrides.lotId !== undefined && optionLabel(options.lots, effective.lotId),
    ].filter((value): value is string => typeof value === "string" && value !== "");

    const reset = (field: BatchField) => () => handlers.onOverride(row.key, field, "");

    return (
      <li
        className={cn(
          "rounded-lg border bg-panel px-3 pt-3 pb-1",
          messages.length > 0 ? "border-overdue/40" : expanded ? "border-brand/45" : "border-hairline"
        )}
      >
        <div className="flex items-center gap-2">
          <span className="w-5 shrink-0 font-mono text-xs text-ink-soft">{line}</span>
          <Input
            data-batch-eartag={row.key}
            value={row.earTag}
            onChange={(event) => handlers.onEarTag(row.key, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handlers.onEarTagEnter(row.key);
              }
            }}
            enterKeyHint="next"
            placeholder="Brinco"
            aria-label={`Brinco da linha ${line}`}
            aria-invalid={errors.earTag ? true : undefined}
            className="min-h-11 flex-1 bg-panel font-mono text-base font-medium"
          />
          <div className="relative w-24 shrink-0">
            <Input
              value={row.weightKg}
              onChange={(event) => handlers.onWeight(row.key, event.target.value)}
              inputMode="decimal"
              placeholder="Peso"
              aria-label={`Peso em kg da linha ${line}`}
              aria-invalid={errors.weightKg ? true : undefined}
              className="min-h-11 bg-panel pr-8 font-mono"
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-ink-soft">
              kg
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pl-7">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            {differences.length === 0 ? (
              <span className="text-ink-soft">Segue o padrão</span>
            ) : (
              differences.map((value) => (
                <span key={value} className="inline-flex items-center gap-1.5 text-ink">
                  <OverrideDot />
                  {value}
                </span>
              ))
            )}
          </p>
          <button
            type="button"
            onClick={() => onToggle(row.key)}
            aria-expanded={expanded}
            className="inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-medium text-brand"
          >
            {expanded ? "Fechar" : "Alterar"}
          </button>
        </div>

        {messages.length > 0 ? (
          <ul className="space-y-0.5 pb-2 pl-7 text-xs text-overdue">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}

        {expanded ? (
          <div className="ml-7 flex flex-col gap-3 border-t border-hairline pt-3 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor={id("category")}>Categoria</Label>
                <FieldSelect
                  id={id("category")}
                  value={effective.category}
                  options={options.categories}
                  onChange={(value) => handlers.onOverride(row.key, "category", value)}
                  className="min-h-11 bg-panel"
                >
                  {row.overrides.category !== undefined ? <OverrideDot /> : null}
                </FieldSelect>
                {row.overrides.category !== undefined ? <ResetLink onReset={reset("category")} /> : null}
              </div>

              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor={id("breed")}>Raça</Label>
                <FieldSelect
                  id={id("breed")}
                  value={effective.breed}
                  options={options.breeds}
                  onChange={(value) => handlers.onOverride(row.key, "breed", value)}
                  className="min-h-11 bg-panel"
                >
                  {row.overrides.breed !== undefined ? <OverrideDot /> : null}
                </FieldSelect>
                {row.overrides.breed !== undefined ? <ResetLink onReset={reset("breed")} /> : null}
              </div>

              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor={id("sex")}>Sexo</Label>
                <FieldSelect
                  id={id("sex")}
                  value={effective.sex}
                  options={options.sexes}
                  onChange={(value) => handlers.onOverride(row.key, "sex", value)}
                  disabled={effective.sexLocked}
                  className="min-h-11 bg-panel"
                >
                  {sexOverridden ? <OverrideDot /> : null}
                </FieldSelect>
                {sexOverridden ? <ResetLink onReset={reset("sex")} /> : null}
                {effective.sexLocked ? (
                  <p className="text-xs text-ink-soft">Definido pela categoria.</p>
                ) : null}
              </div>

              <div className="grid min-w-0 content-start gap-1.5">
                <Label htmlFor={id("birthDate")}>Nascimento</Label>
                <Input
                  id={id("birthDate")}
                  value={row.overrides.birthDate ?? ""}
                  onChange={(event) => handlers.onOverride(row.key, "birthDate", event.target.value)}
                  placeholder={defaults.birthDate || "DD/MM/AAAA"}
                  aria-invalid={errors.birthDate ? true : undefined}
                  className="min-h-11 bg-panel placeholder:text-ink-soft"
                />
                {row.overrides.birthDate !== undefined ? (
                  <ResetLink onReset={reset("birthDate")} />
                ) : null}
              </div>

              <div className="col-span-2 grid min-w-0 content-start gap-1.5">
                <Label htmlFor={id("lotId")}>Lote</Label>
                <FieldSelect
                  id={id("lotId")}
                  value={effective.lotId}
                  options={options.lots}
                  onChange={(value) => handlers.onOverride(row.key, "lotId", value)}
                  placeholder="Selecione o lote"
                  className="min-h-11 bg-panel"
                >
                  {row.overrides.lotId !== undefined ? <OverrideDot /> : null}
                </FieldSelect>
                {row.overrides.lotId !== undefined ? <ResetLink onReset={reset("lotId")} /> : null}
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={() => handlers.onRemove(row.key)}
              className="min-h-11 w-fit text-overdue hover:text-overdue"
            >
              <Trash2 aria-hidden />
              Remover linha
            </Button>
          </div>
        ) : null}
      </li>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.line === next.line &&
    prev.expanded === next.expanded &&
    prev.defaults === next.defaults &&
    prev.options === next.options &&
    prev.customCategories === next.customCategories &&
    prev.handlers === next.handlers &&
    prev.onToggle === next.onToggle &&
    sameRowErrors(prev.errors, next.errors)
);
