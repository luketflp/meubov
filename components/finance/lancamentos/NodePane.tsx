"use client";

/**
 * The right column of Lançamentos: where the nó sits, its name and kind, its
 * own actions (a conta bancária transfers and imports its extrato, an
 * aplicação takes its rendimento), the strip of four figures, the "% quitado"
 * of a financiamento, then the filters and the rows. On a
 * phone it drops the card and the filters.
 */
import { useEffect, useState } from "react";
import { ArrowLeftRight, Receipt, Search, SearchX, TrendingUp, Upload } from "lucide-react";
import type { Lot } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/domain/format";
import type { FigureTone, NodeSummary, PaneRow, PlanNode } from "@/lib/domain/planTree";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { YieldDialog } from "@/components/finance/YieldDialog";
import { ImportDialog } from "@/components/finance/contas/ImportDialog";
import { TransferDialog } from "@/components/finance/contas/TransferDialog";
import { PaneRows } from "@/components/finance/lancamentos/PaneRows";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TONE: Record<FigureTone, string> = {
  ink: "text-ink",
  healthy: "text-healthy",
  attention: "text-attention",
  overdue: "text-overdue",
  scheduled: "text-scheduled",
};

const PILL_TONE: Record<NodeSummary["pills"][number]["tone"], string> = {
  muted: "bg-surface text-ink-soft",
  brand: "bg-brand-soft text-brand",
  scheduled: "bg-scheduled-soft text-scheduled",
  fmd: "bg-fmd-soft text-fmd",
};

const SEARCH_DELAY_MS = 300;
const ACTION = "min-h-11 md:min-h-8";

/** The URL keys the pane writes. */
type PaneKey = "lote" | "status" | "q" | "pagina";

interface NodePaneProps {
  node: PlanNode;
  summary: NodeSummary;
  /** The rows after the filters. */
  rows: PaneRow[];
  /** The nó's rows in the window before the filters. */
  total: number;
  lotId: string;
  pendingOnly: boolean;
  search: string;
  /** The lotes offered: the active ones plus removed ones the rows name. */
  lots: Lot[];
  page: number;
  selectedId: string | null;
  /** Changes with the nó, the window and the filters: the phone list starts over. */
  listKey: string;
  canEdit: boolean;
  onChange(changes: Partial<Record<PaneKey, string>>): void;
  onSelect(id: string | null): void;
}

export function NodePane({
  node,
  summary,
  rows,
  total,
  lotId,
  pendingOnly,
  search,
  lots,
  page,
  selectedId,
  listKey,
  canEdit,
  onChange,
  onSelect,
}: NodePaneProps) {
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const [dialog, setDialog] = useState<"transfer" | "import" | "yield" | null>(null);
  // The conta bancária of the nó, while the user may move money in it.
  const bank = canEdit && summary.bank?.archivedAt === undefined ? summary.bank : undefined;
  const canTransfer = bankAccounts.filter((a) => a.archivedAt === undefined).length > 1;
  const quitado = summary.paidShare === undefined ? null : Math.round(summary.paidShare * 100);

  return (
    <section
      aria-labelledby="node-pane-title"
      className="flex flex-col gap-3 md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-hairline md:bg-panel"
    >
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:border-b md:border-hairline md:px-4 md:py-3">
        <div className="min-w-0">
          {summary.crumb ? <p className="text-xs text-ink-soft">{summary.crumb}</p> : null}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h2
              id="node-pane-title"
              className="font-heading text-[22px] leading-7 font-semibold text-ink md:text-lg md:leading-[26px]"
            >
              {summary.title}
            </h2>
            {summary.pills.map((pill) => (
              <span
                key={pill.text}
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                  PILL_TONE[pill.tone]
                )}
              >
                {pill.text}
              </span>
            ))}
          </div>
          {summary.bank?.label ? <p className="mt-0.5 text-xs text-ink-soft">{summary.bank.label}</p> : null}
        </div>
        {bank ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {canTransfer ? (
              <Button variant="outline" size="sm" className={ACTION} onClick={() => setDialog("transfer")}>
                <ArrowLeftRight aria-hidden />
                Transferir
              </Button>
            ) : null}
            {bank.kind === "checking" ? (
              <Button variant="outline" size="sm" className={ACTION} onClick={() => setDialog("import")}>
                <Upload aria-hidden />
                Importar extrato
              </Button>
            ) : null}
            {bank.kind === "investment" ? (
              <Button variant="outline" size="sm" className={ACTION} onClick={() => setDialog("yield")}>
                <TrendingUp aria-hidden />
                Lançar rendimento
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:rounded-none md:border-x-0 md:border-t-0 lg:grid-cols-4">
        {summary.figures.map((figure) => (
          <div key={figure.label} className="min-w-0 bg-panel px-4 py-3">
            <dt className="truncate text-[11px] font-medium tracking-wide text-ink-soft uppercase">{figure.label}</dt>
            <dd
              className={cn(
                "mt-1 truncate font-mono text-base font-medium tabular-nums md:text-[17px]",
                TONE[figure.tone]
              )}
            >
              {figure.text ?? (figure.amountBrl === null ? "—" : formatCurrency(figure.amountBrl))}
            </dd>
            {/* The sub wraps: "3 compras · pela data da compra" is cut in a narrow cell otherwise. */}
            <dd className="mt-0.5 text-[11px] leading-4 text-ink-soft">{figure.sub}</dd>
          </div>
        ))}
      </dl>

      {quitado !== null ? (
        <div className="flex items-center gap-3 md:border-b md:border-hairline md:px-4 md:py-2.5">
          <div
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={quitado}
            aria-label={`${formatPercent(quitado)} quitado`}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface ring-1 ring-hairline ring-inset"
          >
            <div className="h-full bg-brand" style={{ width: `${quitado}%` }} />
          </div>
          <span className="text-xs whitespace-nowrap text-ink-soft">
            <span className="font-mono font-medium text-ink">{formatPercent(quitado)}</span> quitado
          </span>
        </div>
      ) : null}

      <div className="hidden justify-end border-b border-hairline px-4 py-2.5 md:flex">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={lotId} onValueChange={(lote) => onChange({ lote })}>
            <SelectTrigger aria-label="Filtrar por lote" className="font-medium">
              <span className="flex min-w-0 items-center gap-1">
                <span className="text-ink-soft">Lote:</span>
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">todos</SelectItem>
              <SelectItem value="farm">Fazenda (sem lote)</SelectItem>
              {lots.map((lot) => (
                <SelectItem key={lot.id} value={lot.id}>
                  {lot.deletedAt ? `${lot.name} (removido)` : lot.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap text-ink">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(event) => onChange({ status: event.target.checked ? "pendentes" : "" })}
              className="size-4 accent-brand"
            />
            Só pendentes
          </label>
          <SearchField value={search} onSearch={(q) => onChange({ q })} />
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-hairline bg-panel md:rounded-none md:border-0">
          <EmptyState
            icon={Receipt}
            title="Nenhum lançamento no período"
            description={
              canEdit
                ? "Lance o primeiro nesta conta, ou escolha outro período."
                : "Escolha outro período para ver os lançamentos."
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-hairline bg-panel pb-8 md:rounded-none md:border-0">
          <EmptyState
            icon={SearchX}
            title="Nada com esses filtros"
            description="Nenhum lançamento desta conta passa pelos filtros escolhidos."
            className="pb-4"
          />
          <Button
            variant="outline"
            className="min-h-11 md:min-h-8"
            onClick={() => onChange({ lote: "all", status: "", q: "" })}
          >
            Limpar filtros
          </Button>
        </div>
      ) : (
        <PaneRows
          key={listKey}
          node={node}
          rows={rows}
          selectedId={selectedId}
          onSelect={onSelect}
          page={page}
          onPageChange={(next) => onChange({ pagina: String(next) })}
        />
      )}

      {dialog === "transfer" ? (
        <TransferDialog open onOpenChange={() => setDialog(null)} defaultFromId={bank?.id} />
      ) : null}
      {dialog === "import" && bank ? <ImportDialog account={bank} onOpenChange={() => setDialog(null)} /> : null}
      {dialog === "yield" && bank ? (
        <YieldDialog open onOpenChange={() => setDialog(null)} bankAccountId={bank.id} />
      ) : null}
    </section>
  );
}

/** Types into local state; `q` in the URL catches up 300 ms after the last key. */
function SearchField({ value, onSearch }: { value: string; onSearch(q: string): void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // The URL's q changed elsewhere ("Limpar filtros"): the box follows it.
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }

  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onSearch(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, value, onSearch]);

  return (
    <div className="relative w-48">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-soft"
      />
      <Input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Buscar no histórico"
        aria-label="Buscar no histórico, documento ou contra partida"
        className="h-8 pl-8"
      />
    </div>
  );
}
