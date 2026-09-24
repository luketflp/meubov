"use client";

/**
 * Desktop list of "Cadastrar vários animais": one row per animal. Brinco is
 * typed; the other cells show the padrão in soft ink and turn ink with
 * a brand dot once the line sets its own value, which the reset icon undoes.
 * Rows are memoized so typing in one line does not re-render the other 499.
 */
import { memo } from "react";
import { Plus, RotateCcw, TriangleAlert, X } from "lucide-react";
import type { CustomCategory } from "@/lib/types";
import {
  BATCH_MAX_ROWS,
  effectiveRow,
  type BatchDefaults,
  type BatchField,
  type BatchRow,
  type BatchRowErrors,
} from "@/lib/domain/animalBatch";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FieldSelect,
  OverrideDot,
  rowErrorMessages,
  sameRowErrors,
  type BatchOptions,
  type BatchRowHandlers,
  type FieldOption,
} from "@/components/herd/batch/BatchFieldSelects";

const COLUMNS: { label: string; width: number }[] = [
  { label: "#", width: 44 },
  { label: "Brinco", width: 150 },
  { label: "Categoria", width: 132 },
  { label: "Raça", width: 120 },
  { label: "Sexo", width: 108 },
  { label: "Nascimento", width: 156 },
  { label: "Lote", width: 198 },
  { label: "Peso (kg)", width: 124 },
  { label: "", width: 56 },
];

/** Transparent until hovered or focused, so the padrão reads as plain text. */
const QUIET_CONTROL =
  "border-transparent bg-transparent shadow-none hover:border-hairline focus-visible:border-ring";

interface ResetButtonProps {
  label: string;
  onReset: () => void;
}

function ResetButton({ label, onReset }: ResetButtonProps) {
  return (
    <button
      type="button"
      onClick={onReset}
      aria-label={label}
      title="Voltar ao padrão"
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-soft opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-canvas hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <RotateCcw aria-hidden className="size-3.5" />
    </button>
  );
}

interface InheritedSelectProps {
  row: BatchRow;
  line: number;
  field: Exclude<BatchField, "birthDate">;
  label: string;
  value: string;
  options: readonly FieldOption[];
  overridden: boolean;
  disabled?: boolean;
  onOverride: BatchRowHandlers["onOverride"];
}

function InheritedSelect({
  row,
  line,
  field,
  label,
  value,
  options,
  overridden,
  disabled,
  onOverride,
}: InheritedSelectProps) {
  return (
    <div className="flex items-center gap-0.5">
      <FieldSelect
        value={value}
        options={options}
        onChange={(next) => onOverride(row.key, field, next)}
        disabled={disabled}
        placeholder="—"
        ariaLabel={`${label} da linha ${line}`}
        className={cn(
          "h-8 flex-1 disabled:cursor-default disabled:opacity-100 [&>svg]:opacity-0 group-hover/row:[&>svg]:opacity-100 focus-visible:[&>svg]:opacity-100",
          QUIET_CONTROL,
          overridden ? "text-ink" : "text-ink-soft"
        )}
      >
        {overridden ? <OverrideDot /> : null}
      </FieldSelect>
      {overridden ? (
        <ResetButton
          label={`Voltar ${label.toLowerCase()} da linha ${line} ao padrão`}
          onReset={() => onOverride(row.key, field, "")}
        />
      ) : null}
    </div>
  );
}

interface BatchTableRowProps {
  row: BatchRow;
  line: number;
  errors: BatchRowErrors;
  defaults: BatchDefaults;
  options: BatchOptions;
  customCategories: CustomCategory[];
  handlers: BatchRowHandlers;
}

const BatchTableRow = memo(
  function BatchTableRow({
    row,
    line,
    errors,
    defaults,
    options,
    customCategories,
    handlers,
  }: BatchTableRowProps) {
    const effective = effectiveRow(row, defaults, customCategories);
    const messages = rowErrorMessages(errors);
    const failing = messages.length > 0;
    const birthOverridden = row.overrides.birthDate !== undefined;
    const weightOverridden = defaults.weightKg.trim() !== "" && row.weightKg.trim() !== "";

    return (
      <>
        <tr
          className={cn(
            "group/row transition-colors",
            failing ? "bg-overdue-soft/35" : "border-b border-hairline hover:bg-surface"
          )}
        >
          <td className="py-2 pr-2 pl-4">
            {failing ? (
              <span className="flex items-center gap-1 text-overdue">
                <TriangleAlert aria-hidden className="size-3.5" />
                <span className="font-mono text-xs">{line}</span>
              </span>
            ) : (
              <span className="font-mono text-xs text-ink-soft">{line}</span>
            )}
          </td>
          <td className="p-2">
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
              placeholder="Brinco"
              aria-label={`Brinco da linha ${line}`}
              aria-invalid={errors.earTag ? true : undefined}
              className="h-8 bg-panel font-mono font-medium"
            />
          </td>
          <td className="p-2">
            <InheritedSelect
              row={row}
              line={line}
              field="category"
              label="Categoria"
              value={effective.category}
              options={options.categories}
              overridden={row.overrides.category !== undefined}
              onOverride={handlers.onOverride}
            />
          </td>
          <td className="p-2">
            <InheritedSelect
              row={row}
              line={line}
              field="breed"
              label="Raça"
              value={effective.breed}
              options={options.breeds}
              overridden={row.overrides.breed !== undefined}
              onOverride={handlers.onOverride}
            />
          </td>
          <td className="p-2">
            <InheritedSelect
              row={row}
              line={line}
              field="sex"
              label="Sexo"
              value={effective.sex}
              options={options.sexes}
              overridden={row.overrides.sex !== undefined && !effective.sexLocked}
              disabled={effective.sexLocked}
              onOverride={handlers.onOverride}
            />
          </td>
          <td className="p-2">
            <div className="flex items-center gap-0.5">
              <div className="relative flex-1">
                {birthOverridden ? (
                  <span className="pointer-events-none absolute top-1/2 left-2.5 flex -translate-y-1/2">
                    <OverrideDot />
                  </span>
                ) : null}
                <Input
                  value={row.overrides.birthDate ?? ""}
                  onChange={(event) =>
                    handlers.onOverride(row.key, "birthDate", event.target.value)
                  }
                  placeholder={defaults.birthDate || "—"}
                  aria-label={`Nascimento da linha ${line}`}
                  aria-invalid={errors.birthDate ? true : undefined}
                  className={cn(
                    "h-8 placeholder:text-ink-soft",
                    birthOverridden && "pl-5 text-ink",
                    errors.birthDate ? "bg-panel" : QUIET_CONTROL
                  )}
                />
              </div>
              {birthOverridden ? (
                <ResetButton
                  label={`Voltar nascimento da linha ${line} ao padrão`}
                  onReset={() => handlers.onOverride(row.key, "birthDate", "")}
                />
              ) : null}
            </div>
          </td>
          <td className="p-2">
            <InheritedSelect
              row={row}
              line={line}
              field="lotId"
              label="Lote"
              value={effective.lotId}
              options={options.lots}
              overridden={row.overrides.lotId !== undefined}
              onOverride={handlers.onOverride}
            />
          </td>
          <td className="p-2">
            <div className="flex items-center gap-0.5">
              <div className="relative flex-1">
                {weightOverridden ? (
                  <span className="pointer-events-none absolute top-1/2 left-2.5 flex -translate-y-1/2">
                    <OverrideDot />
                  </span>
                ) : null}
                <Input
                  value={row.weightKg}
                  onChange={(event) => handlers.onWeight(row.key, event.target.value)}
                  inputMode="decimal"
                  placeholder={defaults.weightKg || "—"}
                  aria-label={`Peso em kg da linha ${line}`}
                  aria-invalid={errors.weightKg ? true : undefined}
                  className={cn(
                    "h-8 bg-panel font-mono placeholder:text-ink-soft",
                    weightOverridden && "pl-5"
                  )}
                />
              </div>
              {weightOverridden ? (
                <ResetButton
                  label={`Voltar peso da linha ${line} ao padrão`}
                  onReset={() => handlers.onWeight(row.key, "")}
                />
              ) : null}
            </div>
          </td>
          <td className="p-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => handlers.onRemove(row.key)}
              aria-label={`Remover linha ${line}`}
              className="text-ink-soft hover:text-ink"
            >
              <X aria-hidden />
            </Button>
          </td>
        </tr>
        {failing ? (
          <tr className="border-b border-hairline bg-overdue-soft/35">
            <td />
            <td colSpan={COLUMNS.length - 1} className="px-2 pb-2.5">
              <ul className="space-y-0.5 pl-[11px] text-xs text-overdue">
                {messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </td>
          </tr>
        ) : null}
      </>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.line === next.line &&
    prev.defaults === next.defaults &&
    prev.options === next.options &&
    prev.customCategories === next.customCategories &&
    prev.handlers === next.handlers &&
    sameRowErrors(prev.errors, next.errors)
);

interface BatchRowsTableProps {
  rows: BatchRow[];
  errors: BatchRowErrors[];
  defaults: BatchDefaults;
  options: BatchOptions;
  customCategories: CustomCategory[];
  handlers: BatchRowHandlers;
  onAddRow: () => void;
}

export function BatchRowsTable({
  rows,
  errors,
  defaults,
  options,
  customCategories,
  handlers,
  onAddRow,
}: BatchRowsTableProps) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] table-fixed text-sm">
          <colgroup>
            {COLUMNS.map((column, index) => (
              <col key={index} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-hairline bg-surface">
              {COLUMNS.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className={cn(
                    "h-10 px-2 text-left text-xs font-medium whitespace-nowrap text-ink-soft",
                    index === 0 ? "pl-4" : "pl-[19px]"
                  )}
                >
                  {column.label ? column.label : <span className="sr-only">Remover</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <BatchTableRow
                key={row.key}
                row={row}
                line={index + 1}
                errors={errors[index] ?? {}}
                defaults={defaults}
                options={options}
                customCategories={customCategories}
                handlers={handlers}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="ghost"
            onClick={onAddRow}
            disabled={rows.length >= BATCH_MAX_ROWS}
            className="text-ink-soft"
          >
            <Plus aria-hidden />
            Adicionar linha
          </Button>
          <p className="text-xs text-ink-soft">Enter no último brinco também cria uma linha</p>
        </div>
        <div className="flex items-center gap-3.5 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <OverrideDot />
            alterado nesta linha
          </span>
          <span>cinza segue o padrão do grupo</span>
        </div>
      </div>
    </div>
  );
}
