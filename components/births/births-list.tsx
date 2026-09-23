"use client";

/**
 * Births log: every calving on the farm, newest first, joining the calf to the
 * dam that bore it and the lot the dam is in. The table headers sort it the way
 * the Rebanho table does. Table on desktop, stacked cards on mobile — the same shape
 * the manejo history uses.
 *
 * The rows come straight from the herd store: a calving already travels inside
 * its dam's reproduction record, so this screen needs no request of its own.
 */
import { useMemo } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Baby, ChevronsUpDown } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { recentBirths, type Birth } from "@/lib/store/selectors";
import { formatDate } from "@/lib/domain/dates";
import { formatKg } from "@/lib/domain/format";
import { SEX_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import {
  nextBirthSort,
  sortBirths,
  type BirthSort,
  type BirthSortColumn,
} from "@/components/births/sort-births";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const linkClass = "font-mono font-medium text-ink underline-offset-2 hover:underline";

const COLUMNS: { key: BirthSortColumn; label: string; className?: string }[] = [
  { key: "date", label: "Data" },
  { key: "calf", label: "Bezerro" },
  { key: "sex", label: "Sexo" },
  { key: "dam", label: "Mãe" },
  { key: "lot", label: "Lote" },
  { key: "breed", label: "Raça" },
  { key: "weight", label: "Peso ao nascer", className: "text-right" },
];

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown aria-hidden className="size-3.5 text-ink-soft/50" />;
  if (direction === "asc") return <ArrowUp aria-hidden className="size-3.5 text-brand" />;
  return <ArrowDown aria-hidden className="size-3.5 text-brand" />;
}

function SortableHead({
  column,
  sort,
  onSort,
}: {
  column: (typeof COLUMNS)[number];
  sort: BirthSort;
  onSort: (column: BirthSortColumn) => void;
}) {
  const active = sort.column === column.key;
  return (
    <TableHead
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
      className={column.className}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium transition-colors",
          active ? "text-ink" : "text-ink-soft hover:text-ink"
        )}
      >
        {column.label}
        <SortIcon active={active} direction={sort.direction} />
      </button>
    </TableHead>
  );
}

/**
 * The calf's ear tag, linked to its ficha. A calving keeps the tag it was
 * recorded with, so a later ear-tag correction leaves nothing to link to —
 * the tag still shows, as plain text.
 */
function CalfTag({ birth }: { birth: Birth }) {
  if (birth.calf === null) {
    return <span className="font-mono font-medium text-ink">{birth.calfEarTag}</span>;
  }
  return (
    <Link href={`/herd/${birth.calf.id}`} className={linkClass}>
      {birth.calf.earTag}
    </Link>
  );
}

function sexLabel(birth: Birth): string {
  return birth.calf === null ? "—" : SEX_LABEL[birth.calf.sex];
}

function weightLabel(birth: Birth): string {
  return birth.birthWeightKg === null ? "—" : formatKg(birth.birthWeightKg);
}

/** The sort lives with the page, so its Exportar writes the rows in the table's order. */
export function BirthsList({
  sort,
  onSortChange,
}: {
  sort: BirthSort;
  onSortChange: (sort: BirthSort) => void;
}) {
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);

  const lotNames = useMemo(() => new Map(lots.map((lot) => [lot.id, lot.name])), [lots]);
  const births = useMemo(
    () => sortBirths(recentBirths(animals), sort, lotNames),
    [animals, sort, lotNames]
  );
  const lotName = (birth: Birth): string => lotNames.get(birth.dam.lotId) ?? "—";

  return (
    <SectionCard title="Nascimentos registrados">
      {births.length === 0 ? (
        <EmptyState
          icon={Baby}
          title="Nenhum nascimento registrado"
          description="Registre um nascimento para cadastrar o bezerro no rebanho junto com o parto da matriz."
        />
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((column) => (
                    <SortableHead
                      key={column.key}
                      column={column}
                      sort={sort}
                      onSort={(key) => onSortChange(nextBirthSort(sort, key))}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {births.map((birth) => (
                  <TableRow key={birth.key}>
                    <TableCell className="font-mono text-ink">
                      {formatDate(birth.date)}
                    </TableCell>
                    <TableCell>
                      <CalfTag birth={birth} />
                    </TableCell>
                    <TableCell className="text-ink-soft">{sexLabel(birth)}</TableCell>
                    <TableCell>
                      <Link href={`/herd/${birth.dam.id}`} className={linkClass}>
                        {birth.dam.earTag}
                      </Link>
                    </TableCell>
                    <TableCell className="text-ink-soft">{lotName(birth)}</TableCell>
                    <TableCell className="text-ink-soft">
                      {birth.calf?.breed ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {weightLabel(birth)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {births.map((birth) => (
              <li
                key={birth.key}
                className="rounded-lg border border-hairline bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <CalfTag birth={birth} />
                  <span className="font-mono text-xs text-ink-soft">
                    {formatDate(birth.date)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {sexLabel(birth)}
                  {birth.calf ? ` · ${birth.calf.breed}` : ""} · peso ao nascer{" "}
                  <span className="font-mono text-ink">{weightLabel(birth)}</span>
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  Mãe:{" "}
                  <Link
                    href={`/herd/${birth.dam.id}`}
                    className="font-mono text-ink underline-offset-2 hover:underline"
                  >
                    {birth.dam.earTag}
                  </Link>{" "}
                  · lote {lotName(birth)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
