"use client";

/**
 * The lançamentos of the nó picked, newest first. md+: a table of 50 rows a
 * page with a radio per row that picks the lançamento the toolbar acts on,
 * with the contra partida and the saldo (or the status). The headers sort it
 * like the other tables (the saldo follows the date, so it does not sort). A
 * click on a row opens the lançamento in full; the radio only picks it. Phone:
 * a list that grows by 50, a tap opening the same lançamento as a sheet.
 */
import { useState } from "react";
import { nextLineSort, sortLines, type LineSort, type SortValue } from "@/lib/domain/lineSort";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import type { PaneRow, PlanNode } from "@/lib/domain/planTree";
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { groupKind } from "@/lib/domain/groups";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { ELLIPSIS, pageWindow, paginate } from "@/components/herd/pagination";
import { AttachmentCount, InstallmentChip, RecurrenceTag } from "@/components/finance/SeriesMarkers";
import { LedgerStatusPill } from "@/components/finance/lancamentos/pills";
import { EntryDetailDialog } from "@/components/finance/lancamentos/EntryDetailDialog";
import { Button } from "@/components/ui/button";
import { SortableHead } from "@/components/ui/sortable-head";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const HEAD = "h-9 px-2 text-left text-[11px] font-medium tracking-wide whitespace-nowrap text-ink-soft uppercase";
const CELL = "px-2 py-2 align-middle";

/** "84.312,40", "−3.700,00"; "+148.320,00" when signed. */
const money = (value: number, signed: boolean): string =>
  `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}${formatNumber(Math.abs(value), 2)}`;
const dayMonth = (iso: string): string => formatDate(iso).slice(0, 5);
/** "Trator MF 4275, NF 2.871 · parcela 6/6, 10/02/2026": tells the parcelas of one compra apart. */
const rowName = (row: PaneRow): string => [row.history, row.detail, formatDate(row.date)].filter(Boolean).join(", ");

/** What needs looking at first sorts first: vencida, a pagar, a receber, then the settled ones. */
const STATUS_RANK = { overdue: 0, payable: 1, receivable: 2, paid: 3, received: 4 } as const;

/** Money in is "+" and healthy. */
function Amount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("font-mono whitespace-nowrap tabular-nums", value > 0 ? "text-healthy" : "text-ink", className)}>
      {money(value, true)}
    </span>
  );
}

function Dash() {
  return <span className="text-ink-soft">—</span>;
}

function LockMark() {
  return (
    <span title="do manejo, automático" className="inline-flex shrink-0 text-ink-soft">
      <Lock className="size-3" aria-hidden />
      <span className="sr-only">do manejo, automático</span>
    </span>
  );
}

/** Who or what, over the observação, documento and parcela (the detail already names the parcela). */
function HistoryCell({ row }: { row: PaneRow }) {
  const expense = row.ledger?.expense ?? null;
  return (
    <td className={CELL}>
      <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
        <span className="truncate">{row.history}</span>
        <AttachmentCount expense={expense} />
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-soft empty:hidden">
        {row.detail ? <span className="truncate">{row.detail}</span> : null}
        <RecurrenceTag expense={expense} />
      </span>
    </td>
  );
}

function ExtratoCells({ row, saldo }: { row: PaneRow; saldo: boolean }) {
  return (
    <>
      <td className={cn(CELL, "font-mono text-xs text-ink")}>{formatDate(row.date)}</td>
      <HistoryCell row={row} />
      <td className={CELL}>
        {row.contra ? (
          <>
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
              <span className="truncate">{row.contra}</span>
              {row.ledger?.locked ? <LockMark /> : null}
            </span>
            {row.contraGroup ? <span className="block truncate text-xs text-ink-soft">{row.contraGroup}</span> : null}
          </>
        ) : (
          <Dash />
        )}
      </td>
      <td className={cn(CELL, "text-right")}>
        <Amount value={row.amountBrl} />
      </td>
      {/* A pending line of a financiamento has no saldo devedor yet: its status stands there. */}
      <td className={cn(CELL, "pr-4", saldo && "text-right")}>
        {row.balance !== null ? (
          <span className="font-mono font-medium whitespace-nowrap text-ink tabular-nums">{money(row.balance, false)}</span>
        ) : row.ledger ? (
          <LedgerStatusPill status={row.ledger.status} />
        ) : (
          <Dash />
        )}
      </td>
    </>
  );
}

interface PaneRowsProps {
  node: PlanNode;
  rows: PaneRow[];
  selectedId: string | null;
  onSelect(id: string | null): void;
  page: number;
  onPageChange(page: number): void;
}

export function PaneRows({ node, rows, selectedId, onSelect, page: pageNumber, onPageChange }: PaneRowsProps) {
  const accounts = useHerdStore((s) => s.accounts);
  const planGroups = useHerdStore((s) => s.planGroups);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSort] = useState<LineSort | null>(null);
  // Looked up on every render: a removed row closes its dialog.
  const open = openId === null ? null : (rows.find((row) => row.id === openId) ?? null);
  const sortValue: Record<string, (row: PaneRow) => SortValue> = {
    date: (row) => row.date,
    history: (row) => row.history,
    contra: (row) => row.contra,
    amount: (row) => row.amountBrl,
    status: (row) => (row.ledger ? STATUS_RANK[row.ledger.status] : null),
  };
  const sorted = sort ? sortLines(rows, sortValue[sort.key], sort.direction) : rows;
  const page = paginate(sorted, pageNumber, PAGE_SIZE);
  const onSort = (key: string) => {
    setSort((current) => nextLineSort(current, key));
    onPageChange(1);
  };

  // The last column: the saldo after each line on a conta bancária, the saldo devedor on a financiamento.
  const accountGroup = node.type === "account" ? accounts.find((a) => a.id === node.id)?.group : undefined;
  const last =
    node.type === "bank"
      ? "Saldo (R$)"
      : accountGroup !== undefined && groupKind(accountGroup, planGroups) === "financing"
        ? "Saldo devedor"
        : "Status";
  const saldo = last !== "Status";
  // [label, sort key (null: not sortable), width and alignment]
  const heads: [string, string | null, string][] = [
    ["Data", "date", "w-24"],
    ["Histórico", "history", ""],
    ["Contra partida", "contra", "w-44"],
    ["Valor (R$)", "amount", "w-28 text-right"],
    [last, saldo ? null : "status", cn("w-28 pr-4", saldo && "text-right")],
  ];

  return (
    <>
      <div className="hidden md:block">
        {/* A narrow pane scrolls the table sideways rather than crushing the Histórico. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-collapse">
            <caption className="sr-only">Lançamentos da conta escolhida</caption>
            <thead>
              <tr className="bg-surface">
                <th scope="col" className={cn(HEAD, "w-10 pl-4")}>
                  <span className="sr-only">Selecionar</span>
                </th>
                {heads.map(([label, key, className]) =>
                  key ? (
                    <SortableHead
                      key={label}
                      label={label}
                      sortKey={key}
                      sort={sort}
                      onSort={onSort}
                      className={cn(HEAD, className)}
                    />
                  ) : (
                    <th key={label} scope="col" className={cn(HEAD, className)}>
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {page.items.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <tr
                    key={row.id}
                    aria-selected={selected || undefined}
                    onClick={() => {
                      onSelect(row.id);
                      setOpenId(row.id);
                    }}
                    className={cn(
                      "cursor-pointer border-t border-hairline text-sm transition-colors",
                      selected ? "bg-brand-soft" : "hover:bg-surface/60"
                    )}
                  >
                    {/* The radio picks the row for the toolbar without opening it. */}
                    <td className="py-2 pl-4 align-middle" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="radio"
                        name="lancamento"
                        checked={selected}
                        onChange={() => onSelect(row.id)}
                        aria-label={`Selecionar ${rowName(row)}`}
                        className="block size-4 accent-brand"
                      />
                    </td>
                    <ExtratoCells row={row} saldo={saldo} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <nav
          aria-label="Paginação"
          className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5 text-xs text-ink-soft"
        >
          <span aria-live="polite">
            Mostrando {formatNumber(page.from)}–{formatNumber(page.to)} de {formatNumber(page.total)} · mais recentes
            primeiro
          </span>
          {page.pageCount > 1 ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={page.page === 1}
                onClick={() => onPageChange(page.page - 1)}
                aria-label="Página anterior"
              >
                <ChevronLeft aria-hidden />
              </Button>
              {pageWindow(page.page, page.pageCount).map((slot, index) =>
                slot === ELLIPSIS ? (
                  <span key={`ellipsis-${index}`} aria-hidden className="w-8 text-center">
                    …
                  </span>
                ) : (
                  <Button
                    key={slot}
                    variant={slot === page.page ? "outline" : "ghost"}
                    size="icon"
                    className={cn("font-mono", slot === page.page && "pointer-events-none text-ink")}
                    aria-current={slot === page.page ? "page" : undefined}
                    aria-label={`Página ${slot}`}
                    onClick={() => onPageChange(slot)}
                  >
                    {formatNumber(slot)}
                  </Button>
                )
              )}
              <Button
                variant="ghost"
                size="icon"
                disabled={page.page === page.pageCount}
                onClick={() => onPageChange(page.page + 1)}
                aria-label="Próxima página"
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          ) : null}
        </nav>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-panel">
          {sorted.slice(0, shown).map((row) => {
            const expense = row.ledger?.expense ?? null;
            const sub = [
              expense && row.ledger ? `vence ${dayMonth(row.ledger.dueDate)}` : null,
              row.contra,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(row.id)}
                  className="grid min-h-11 w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left transition-colors hover:bg-surface"
                >
                  <span className="font-mono text-xs text-ink-soft">{dayMonth(row.date)}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-medium text-ink">
                    <span className="truncate">{row.history}</span>
                    <InstallmentChip expense={expense} />
                  </span>
                  <Amount value={row.amountBrl} className="text-sm" />
                  <span className="col-start-2 truncate text-xs text-ink-soft">{sub}</span>
                  <span className="justify-self-end">
                    {row.ledger ? <LedgerStatusPill status={row.ledger.status} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {sorted.length > shown ? (
          <Button variant="outline" className="min-h-11" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Carregar mais
          </Button>
        ) : null}
      </div>

      <EntryDetailDialog
        row={open}
        node={node}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
      />
    </>
  );
}
