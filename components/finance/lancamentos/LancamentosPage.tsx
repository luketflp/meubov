"use client";

/**
 * /finance/lancamentos: the plano de contas as a tree on the left and, on the
 * right, the nó picked in it with its figures and its lançamentos, under one
 * toolbar that acts on the lançamento picked in the list. The nó, the window,
 * the view and the filters live in the URL query (conta, de, ate, visao, lote,
 * status, q, pagina), so the Painel's links land on a nó and reloading keeps
 * it. Below xl (phones, tablets) the two columns do not fit: the page is the
 * tree until a nó is picked, then its pane.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { usePrintStore } from "@/lib/store/usePrintStore";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { periodFromSearch, type Period } from "@/lib/domain/period";
import {
  entryInitialFor,
  filterPaneRows,
  nodeParam,
  nodeRows,
  planTree,
  type PlanInputs,
  type PlanNode,
} from "@/lib/domain/planTree";
import { paneExportTable } from "@/lib/export/datasets/finance";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { ExportMenu } from "@/components/export/ExportMenu";
import { useExportContext } from "@/components/export/useExportContext";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { resolveNode } from "@/components/finance/lancamentos/legacySearch";
import { LancamentosToolbar } from "@/components/finance/lancamentos/LancamentosToolbar";
import { NodePane } from "@/components/finance/lancamentos/NodePane";
import { PlanTreeNav } from "@/components/finance/lancamentos/PlanTreeNav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ALL: PlanNode = { type: "all" };

const lancamentos = (n: number): string => (n === 1 ? "1 lançamento" : `${formatNumber(n)} lançamentos`);

export function LancamentosPage() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const today = todayISO();
  const canEdit = useCan("finance", "edit");
  const print = usePrintStore((s) => s.print);
  const exportContext = useExportContext();

  const expenses = useHerdStore((s) => s.expenses);
  const accounts = useHerdStore((s) => s.accounts);
  const movements = useHerdStore((s) => s.movements);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const lots = useHerdStore((s) => s.lots);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const transfers = useHerdStore((s) => s.transfers);
  const inputs = useMemo<PlanInputs>(
    () => ({ expenses, accounts, movements, manejoSessions, animals, treatments, lots, bankAccounts, transfers }),
    [expenses, accounts, movements, manejoSessions, animals, treatments, lots, bankAccounts, transfers]
  );

  const params = useMemo(() => new URLSearchParams(query), [query]);
  const period = useMemo(() => periodFromSearch(params, today), [params, today]);
  const view = params.get("visao") === "detalhado" ? "detalhado" : "extrato";
  const lotId = params.get("lote") || "all";
  const pendingOnly = params.get("status") === "pendentes";
  const search = params.get("q")?.trim() ?? "";
  const pageNumber = Math.max(1, Number.parseInt(params.get("pagina") ?? "1", 10) || 1);

  // A nó that is malformed or gone reads as none: "todos" on md+, the tree on a phone.
  const { picked, node, summary } = useMemo(
    () => resolveNode(params.get("conta"), inputs, period, today),
    [params, inputs, period, today]
  );
  const tree = useMemo(() => planTree(inputs, period, today), [inputs, period, today]);
  const rows = useMemo(() => nodeRows(node, inputs, period, today), [node, inputs, period, today]);
  const allCount = useMemo(
    () => (node.type === "all" ? rows.length : nodeRows(ALL, inputs, period, today).length),
    [node, rows, inputs, period, today]
  );
  const shown = useMemo(
    () => filterPaneRows(rows, { lotId, pendingOnly, search }),
    [rows, lotId, pendingOnly, search]
  );
  const lotOptions = lots.filter((lot) => !lot.deletedAt || rows.some((row) => row.ledger?.lotId === lot.id));

  // The picked row belongs to one nó, window, filter set and page: changing any of them drops it.
  const scope = [nodeParam(node), period.start, period.end, lotId, pendingOnly, search, pageNumber].join("|");
  const [selection, setSelection] = useState<{ id: string; scope: string } | null>(null);
  const selectedRow = selection?.scope === scope ? (shown.find((row) => row.id === selection.id) ?? null) : null;
  const [entering, setEntering] = useState(false);

  /** The URL with `changes` merged in; defaults leave it, and all but a page change go back to page 1. */
  const hrefWith = (changes: Record<string, string | undefined>): string => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      if (value === "" || value === "all" || (key === "pagina" && value === "1")) next.delete(key);
      else next.set(key, value);
    }
    if (!("pagina" in changes)) next.delete("pagina");
    const nextQuery = next.toString();
    return nextQuery ? `${pathname}?${nextQuery}` : pathname;
  };
  const setParams = (changes: Record<string, string | undefined>) =>
    router.replace(hrefWith(changes), { scroll: false });
  const setPeriod = (next: Period) => setParams({ de: next.start, ate: next.end });

  const lotLabel = lotId === "farm" ? "Fazenda (sem lote)" : (lots.find((lot) => lot.id === lotId)?.name ?? "—");
  const filters = [
    `Período: ${formatDate(period.start)} a ${formatDate(period.end)}`,
    `Conta: ${summary.crumb ? `${summary.crumb} › ` : ""}${summary.title}`,
    ...(lotId === "all" ? [] : [`Lote: ${lotLabel}`]),
    ...(pendingOnly ? ["Só pendentes"] : []),
    ...(search ? [`Busca: “${search}”`] : []),
  ];
  // Imprimir of the toolbar: the rows on screen, through the print sheet Exportar uses.
  const printRows = () =>
    print({
      title: summary.title,
      subtitle: lancamentos(shown.length),
      tables: [paneExportTable(shown, summary.title)],
      context: exportContext(filters),
    });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 pb-16 md:px-8 md:pb-6">
      <div className={cn("flex flex-col gap-4", picked && "max-md:hidden")}>
        <PageHeader
          title="Lançamentos"
          subtitle="A conta escolhida no plano de contas mostra o saldo e o extrato dela"
          badges={canEdit ? undefined : <ReadOnlyPill />}
          actions={
            <>
              <div className="hidden md:block">
                <PeriodPicker value={period} onChange={setPeriod} />
              </div>
              {shown.length > 0 ? (
                <ExportMenu
                  title="Lançamentos"
                  className="hidden md:inline-flex"
                  formats={["xlsx", "csv", "print"]}
                  current={{
                    label: summary.title,
                    detail: lancamentos(shown.length),
                    filters,
                    build: () => [paneExportTable(shown, summary.title)],
                  }}
                />
              ) : null}
            </>
          }
        />
        <FinanceSubnav current="lancamentos" period={period} />
        {/* PeriodPicker is inline-flex: full width on a phone. */}
        <div className="md:hidden [&_input]:flex-1 [&>div]:flex [&>div]:w-full">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </div>

      <LancamentosToolbar node={node} row={selectedRow} onPrint={printRows} onDone={() => setSelection(null)} />

      <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <PlanTreeNav
          className={cn(picked && "max-xl:hidden")}
          tree={tree}
          allCount={allCount}
          selectedKey={nodeParam(node)}
          hrefFor={(target) => hrefWith({ conta: nodeParam(target) })}
          period={period}
          canEdit={canEdit}
        />
        <div className={cn("flex min-w-0 flex-col gap-3", !picked && "max-xl:hidden")}>
          <Link
            href={hrefWith({ conta: "" })}
            className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-brand xl:hidden"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Plano de contas
          </Link>
          <NodePane
            node={node}
            summary={summary}
            rows={shown}
            total={rows.length}
            view={view}
            lotId={lotId}
            pendingOnly={pendingOnly}
            search={search}
            lots={lotOptions}
            page={pageNumber}
            selectedId={selectedRow?.id ?? null}
            listKey={scope}
            canEdit={canEdit}
            onChange={setParams}
            onSelect={(id) => setSelection(id === null ? null : { id, scope })}
          />
        </div>
      </div>

      {canEdit ? (
        <>
          {/* The phone's "Lançar" over the tab bar; md+ has Novo in the toolbar. */}
          <Button
            onClick={() => setEntering(true)}
            className="fixed right-4 bottom-24 z-30 h-12 gap-2 rounded-full px-[18px] text-[15px] shadow-lg md:hidden"
          >
            <Plus className="size-[18px]" aria-hidden />
            Lançar
          </Button>
          {entering ? (
            <EntryDialog open onOpenChange={setEntering} initial={entryInitialFor(node, accounts, bankAccounts)} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
