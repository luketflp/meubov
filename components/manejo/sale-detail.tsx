"use client";

/**
 * Venda record: the read-only romaneio of a sale already closed at the chute.
 * The summary card holds the batch arithmetic; below it, one line per animal
 * with the weight read on the scale, its carcass arrobas and what it was worth.
 * A venda still running belongs to the chute screen, which keeps the actions;
 * `ManejoScreen` only renders this record once the venda is closed.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import type { ManejoSession } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatArroba, formatCurrency, formatKg } from "@/lib/domain/format";
import { nextLineSort, sortLines, type LineSort, type SortValue } from "@/lib/domain/lineSort";
import { saleRows, type SaleRow } from "@/lib/domain/movements";
import { missedBrete, outcomeLabel } from "@/lib/domain/manejoDetail";
import {
  movementSubtitle,
  visibleSaleRows,
  type SaleRowScope,
} from "@/components/manejo/helpers";
import { SaleSummaryCard } from "@/components/manejo/sale-summary";
import {
  DetailHeader,
  LinesExportMenu,
  useDetailExportNames,
} from "@/components/manejo/detail-shell";
import { saleLinesExportTable } from "@/lib/export/datasets/manejo";
import { useCan } from "@/lib/store/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { SortableHead } from "@/components/ui/sortable-head";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SaleDetailProps {
  /** A closed session of kind "sale". */
  session: ManejoSession;
}

export function SaleDetail({ session }: SaleDetailProps) {
  const [search, setSearch] = useState("");
  // Opens on the animals actually sold — the romaneio the frigorífico paid.
  // The whole lot, skipped animals included, is one switch away.
  const [scope, setScope] = useState<SaleRowScope>("sold");
  const [sort, setSort] = useState<LineSort | null>(null);

  const rows = useMemo(() => saleRows(session), [session]);
  const exportNames = useDetailExportNames();
  // The romaneio prints the money of the venda: Financeiro only.
  const seeMoney = useCan("finance", "view");

  const perArroba = session.pricePerArroba !== undefined;
  // A venda closed at one price has no per-head money: the column would be a
  // stack of dashes, so it only shows when some animal carries a value.
  const priced = rows.some((row) => row.amountBrl !== null);
  const soldCount = rows.filter((row) => row.outcome === "done").length;
  const missedCount = rows.filter((row) => missedBrete(row.outcome)).length;
  const inScope = scope === "sold" ? soldCount : scope === "missed" ? missedCount : rows.length;
  const filtered = visibleSaleRows(rows, scope, search);
  // The phone cards and the Exportar follow the table's sorted header.
  const visible = sort ? sortLines(filtered, SORT_VALUE[sort.key], sort.direction) : filtered;
  const sortBy = (key: string) => setSort((current) => nextLineSort(current, key));
  const countLabel =
    scope !== "lot" && inScope < rows.length ? `${inScope} de ${rows.length}` : `${rows.length}`;

  return (
    <div className="space-y-6">
      <DetailHeader
        title={session.name}
        action="sale"
        subtitle={`${formatDate(session.date)} · ${movementSubtitle(session, undefined)}`}
        session={session}
        extra={
          <>
            {seeMoney ? (
              <Button asChild variant="outline" className="h-11 md:h-8">
                <Link href={`/relatorios/romaneio?manejo=${encodeURIComponent(session.id)}`}>
                  <FileText aria-hidden />
                  Romaneio
                </Link>
              </Button>
            ) : null}
            <LinesExportMenu
              title={session.name}
              lines={rows}
              visible={visible}
              build={(lines) => saleLinesExportTable(session.name, lines, exportNames)}
            />
          </>
        }
      />

      <SaleSummaryCard session={session} />

      <SectionCard
        title={`Animais (${countLabel})`}
        action={
          rows.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={scope} onValueChange={(v) => setScope(v as SaleRowScope)}>
                <SelectTrigger
                  className="min-h-11 md:min-h-9"
                  aria-label="Filtrar os animais da venda"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sold">Vendidos</SelectItem>
                  <SelectItem value="missed">Não passaram</SelectItem>
                  <SelectItem value="lot">Todo o lote</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar brinco"
                  aria-label="Buscar animal da venda por brinco"
                  className="min-h-11 pl-9 font-mono md:min-h-9"
                />
              </div>
            </div>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <p className="py-1 text-xs text-ink-soft">Nenhum animal nesta venda.</p>
        ) : scope === "missed" && inScope === 0 ? (
          <p className="py-1 text-xs text-ink-soft">Todos os animais passaram no brete.</p>
        ) : inScope === 0 ? (
          <p className="py-1 text-xs text-ink-soft">
            Nenhum animal chegou a ser vendido. Veja todo o lote para conferir o que
            saiu do brete.
          </p>
        ) : visible.length === 0 ? (
          <p className="py-1 text-xs text-ink-soft">Nenhum brinco corresponde à busca.</p>
        ) : (
          <>
            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Brinco" sort={sort} onSort={sortBy} />
                    <SortableHead label="Peso" sort={sort} onSort={sortBy} align="right" />
                    {perArroba ? (
                      <SortableHead label="@ carcaça" sort={sort} onSort={sortBy} align="right" />
                    ) : null}
                    {priced ? (
                      <SortableHead label="Valor" sort={sort} onSort={sortBy} align="right" />
                    ) : null}
                    <SortableHead label="Observação" sort={sort} onSort={sortBy} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.earTag}>
                      <TableCell className="font-mono font-medium text-ink">
                        {row.earTag}
                      </TableCell>
                      <TableCell className="text-right font-mono text-ink">
                        {row.weightKg === null ? "—" : formatKg(row.weightKg)}
                      </TableCell>
                      {perArroba ? (
                        <TableCell className="text-right font-mono text-ink">
                          {row.carcassArrobas === null
                            ? "—"
                            : formatArroba(row.carcassArrobas)}
                        </TableCell>
                      ) : null}
                      {priced ? (
                        <TableCell className="text-right font-mono text-ink">
                          {row.amountBrl === null ? "—" : formatCurrency(row.amountBrl)}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-ink-soft">{rowNote(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: stacked cards */}
            <ul className="space-y-3 md:hidden">
              {visible.map((row) => (
                <li
                  key={row.earTag}
                  className="rounded-lg border border-hairline bg-surface p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm font-medium text-ink">
                      {row.earTag}
                    </span>
                    {priced ? (
                      <span className="font-mono text-sm text-ink">
                        {row.amountBrl === null ? "—" : formatCurrency(row.amountBrl)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {row.weightKg === null ? "sem peso" : formatKg(row.weightKg)}
                    {perArroba && row.carcassArrobas !== null
                      ? ` · ${formatArroba(row.carcassArrobas)} de carcaça`
                      : ""}
                  </p>
                  {rowNote(row) ? (
                    <p className="mt-1 text-xs text-ink-soft">{rowNote(row)}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>
    </div>
  );
}

/** What each header of the table sorts by. */
const SORT_VALUE: Record<string, (row: SaleRow) => SortValue> = {
  Brinco: (row) => row.earTag,
  Peso: (row) => row.weightKg,
  "@ carcaça": (row) => row.carcassArrobas,
  Valor: (row) => row.amountBrl,
  Observação: (row) => rowNote(row),
};

/** Note shown for an animal: its own, prefixed by "pulado", "refugo" or "dúvida" when it did not sell. */
function rowNote(row: SaleRow): string {
  const label = outcomeLabel(row.outcome);
  if (label === null) return row.notes ?? "";
  return row.notes ? `${label} · ${row.notes}` : label;
}
