"use client";

/**
 * A filter of the "Iniciar manejo" animal list that takes several values: a
 * button like the other selects, opening a menu of checkboxes with each
 * option's count. The all option on top clears the pick; the footer says how
 * many are picked and how many animals they hold.
 */
import { ChevronDown } from "lucide-react";
import { formatNumber } from "@/lib/domain/format";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface MultiFilterOption<T extends string> {
  value: T;
  /** Full name, in the menu and on the button when it is the only pick. */
  label: string;
  /** Name on the button when two are picked ("Recria, Garrotes"). */
  shortLabel: string;
  count: number;
}

interface MultiFilterProps<T extends string> {
  id?: string;
  /** Names the button when no visible label does. */
  ariaLabel?: string;
  /** What the button reads. */
  buttonLabel: string;
  /** "Todos os lotes", "Todas as categorias". */
  allLabel: string;
  /** Count next to the all option: every animal the other filter keeps. */
  allCount: number;
  /** "2 lotes", "1 categoria". */
  pickedSummary: (n: number) => string;
  options: MultiFilterOption<T>[];
  picked: T[];
  onToggle: (value: T) => void;
  onClear: () => void;
}

export function MultiFilter<T extends string>({
  id,
  ariaLabel,
  buttonLabel,
  allLabel,
  allCount,
  pickedSummary,
  options,
  picked,
  onToggle,
  onClear,
}: MultiFilterProps<T>) {
  const pickedCount = options
    .filter((option) => picked.includes(option.value))
    .reduce((sum, option) => sum + option.count, 0);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={ariaLabel}
          className="flex min-h-11 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-ring data-[state=open]:ring-3 data-[state=open]:ring-ring/50"
        >
          <span className="truncate">{buttonLabel}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-soft" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-64">
        <DropdownMenuCheckboxItem checked={picked.length === 0} onCheckedChange={onClear}>
          <span className="flex-1 truncate">{allLabel}</span>
          <span className="font-mono text-xs text-ink-soft">{formatNumber(allCount)}</span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={picked.includes(option.value)}
            onCheckedChange={() => onToggle(option.value)}
            // A value with no animal here is shown, but there is nothing to pick.
            disabled={option.count === 0 && !picked.includes(option.value)}
          >
            <span className="flex-1 truncate">{option.label}</span>
            <span className="font-mono text-xs text-ink-soft">{formatNumber(option.count)}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {picked.length > 0 ? (
          <div className="-mx-1 -mb-1 mt-1 flex items-center justify-between gap-3 border-t border-hairline px-3 py-1.5 text-xs text-ink-soft">
            <span>
              {pickedSummary(picked.length)} ·{" "}
              {pickedCount === 1 ? "1 animal" : `${formatNumber(pickedCount)} animais`}
            </span>
            <button
              type="button"
              onClick={onClear}
              className="min-h-9 font-medium text-brand hover:underline"
            >
              Limpar
            </button>
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
