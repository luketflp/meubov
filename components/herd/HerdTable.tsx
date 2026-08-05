"use client";

import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { AnimalWithDerived } from "@/lib/store/selectors";
import { formatDate, formatAge } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SEX_LABEL,
  formatFullWeight,
  type SortColumn,
  type HerdSort,
} from "@/components/herd/filters";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { animalCategoryName } from "@/lib/domain/labels";

interface HerdTableProps {
  items: AnimalWithDerived[];
  lotNames: ReadonlyMap<string, string>;
  sort: HerdSort;
  onSort: (column: SortColumn) => void;
}

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "earTag", label: "Brinco" },
  { key: "category", label: "Categoria" },
  { key: "breed", label: "Raça" },
  { key: "sex", label: "Sexo" },
  { key: "birthDate", label: "Nascimento" },
  { key: "weight", label: "Peso" },
  { key: "lot", label: "Lote" },
  { key: "status", label: "Status" },
];

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown aria-hidden className="size-3.5 text-ink-soft/50" />;
  if (direction === "asc") return <ArrowUp aria-hidden className="size-3.5 text-brand" />;
  return <ArrowDown aria-hidden className="size-3.5 text-brand" />;
}

export function HerdTable({ items, lotNames, sort, onSort }: HerdTableProps) {
  const customCategories = useHerdStore((s) => s.customCategories);
  const router = useRouter();

  const goToRecord = (id: string): void => {
    router.push(`/herd/${id}`);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-panel">
      <Table className="[&_tr>*:first-child]:pl-4 [&_tr>*:last-child]:pr-4">
        <TableHeader className="bg-surface">
          <TableRow className="hover:bg-surface">
            {COLUMNS.map(({ key, label }) => {
              const active = sort.column === key;
              return (
                <TableHead
                  key={key}
                  aria-sort={
                    active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined
                  }
                  className="px-3"
                >
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    className={cn(
                      "flex items-center gap-1 text-xs font-medium transition-colors",
                      active ? "text-ink" : "text-ink-soft hover:text-ink"
                    )}
                  >
                    {label}
                    <SortIcon active={active} direction={sort.direction} />
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(({ animal, status, currentWeightKg }) => (
            <TableRow
              key={animal.id}
              tabIndex={0}
              onClick={() => goToRecord(animal.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") goToRecord(animal.id);
              }}
              aria-label={`Abrir ficha do animal ${animal.earTag}`}
              className="cursor-pointer border-hairline hover:bg-surface"
            >
              <TableCell className="px-3 font-mono font-medium">{animal.earTag}</TableCell>
              <TableCell className="px-3">
                {animalCategoryName(animal, customCategories)}
              </TableCell>
              <TableCell className="px-3">{animal.breed}</TableCell>
              <TableCell className="px-3">{SEX_LABEL[animal.sex]}</TableCell>
              <TableCell className="px-3">
                {formatDate(animal.birthDate)}{" "}
                <span className="text-ink-soft">{formatAge(animal.birthDate)}</span>
              </TableCell>
              <TableCell className="px-3 font-mono">{formatFullWeight(currentWeightKg)}</TableCell>
              <TableCell className="px-3">{lotNames.get(animal.lotId) ?? "—"}</TableCell>
              <TableCell className="px-3">
                <StatusPill status={status} withDot />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
