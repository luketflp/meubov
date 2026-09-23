"use client";

/**
 * A table header that sorts its column, drawn like the Rebanho and Nascimentos
 * headers: the label and an arrow for the direction, a faint double chevron
 * while the column is not the one sorting.
 */
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { LineSort } from "@/lib/domain/lineSort";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface SortableHeadProps {
  label: string;
  /** The column's key in the sort; the label when omitted. */
  sortKey?: string;
  sort: LineSort | null;
  onSort: (key: string) => void;
  align?: "right";
}

export function SortableHead({ label, sortKey = label, sort, onSort, align }: SortableHeadProps) {
  const active = sort?.key === sortKey;
  const direction = active ? sort.direction : null;
  return (
    <TableHead
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}
      className={align === "right" ? "text-right" : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium transition-colors",
          active ? "text-ink" : "text-ink-soft hover:text-ink"
        )}
      >
        {label}
        {direction === "asc" ? (
          <ArrowUp aria-hidden className="size-3.5 text-brand" />
        ) : direction === "desc" ? (
          <ArrowDown aria-hidden className="size-3.5 text-brand" />
        ) : (
          <ChevronsUpDown aria-hidden className="size-3.5 text-ink-soft/50" />
        )}
      </button>
    </TableHead>
  );
}
