"use client";

/**
 * /finance/extrato: every lançamento of the window plus the vendas, compras
 * and tratamentos the manejos wrote. The window and the filters live in the
 * URL query (de, ate, tipo, grupo, conta, lote, status, q, pagina), so "Ver
 * extrato" links land on a filtered list and reloading keeps it.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Receipt, SearchX } from "lucide-react";
import type { AccountGroup } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { periodFromSearch, periodSearch, type Period } from "@/lib/domain/period";
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { filterLedger, ledgerRows, ledgerSummary, matchesStatusChoice } from "@/lib/domain/ledger";
import { ledgerExportTable } from "@/lib/export/datasets/finance";
import { paginate } from "@/components/herd/pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { ExportMenu } from "@/components/export/ExportMenu";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { LancarButton } from "@/components/finance/LancarButton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ExtratoFilters,
  KIND_TABS,
  KIND_TAB_LABEL,
  STATUS_CHOICES,
  STATUS_CHOICE_LABEL,
  type ExtratoFilter,
} from "@/components/finance/extrato/ExtratoFilters";
import { ExtratoSummary } from "@/components/finance/extrato/ExtratoSummary";
import { ExtratoTable } from "@/components/finance/extrato/ExtratoTable";
import { ExtratoList } from "@/components/finance/extrato/ExtratoList";

const PAGE_SIZE = 50;
const GROUP_VALUES: readonly (AccountGroup | "capital" | "all")[] = ["all", ...ACCOUNT_GROUPS, "capital"];

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function parseFilter(params: URLSearchParams): ExtratoFilter {
  return {
    kind: oneOf(params.get("tipo"), KIND_TABS, "all"),
    group: oneOf(params.get("grupo"), GROUP_VALUES, "all"),
    accountId: params.get("conta") || "all",
    lotId: params.get("lote") || "all",
    status: oneOf(params.get("status"), STATUS_CHOICES, "all"),
    search: params.get("q")?.trim() ?? "",
  };
}

const lancamentos = (n: number): string => (n === 1 ? "1 lançamento" : `${formatNumber(n)} lançamentos`);

export function ExtratoPage() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const today = todayISO();
  const canEdit = useCan("finance", "edit");

  const expenses = useHerdStore((s) => s.expenses);
  const accounts = useHerdStore((s) => s.accounts);
  const movements = useHerdStore((s) => s.movements);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const lots = useHerdStore((s) => s.lots);

  const { period, filter, pageNumber } = useMemo(() => {
    const params = new URLSearchParams(query);
    return {
      period: periodFromSearch(params, today),
      filter: parseFilter(params),
      pageNumber: Math.max(1, Number.parseInt(params.get("pagina") ?? "1", 10) || 1),
    };
  }, [query, today]);

  const rows = useMemo(
    () => ledgerRows({ expenses, accounts, movements, manejoSessions, animals, treatments, lots }, period, today),
    [expenses, accounts, movements, manejoSessions, animals, treatments, lots, period, today]
  );
  const filtered = useMemo(
    () => filterLedger(rows, { ...filter, status: "all" }).filter((row) => matchesStatusChoice(row, filter.status)),
    [rows, filter]
  );
  const summary = useMemo(() => ledgerSummary(filtered), [filtered]);
  const page = paginate(filtered, pageNumber, PAGE_SIZE);
  const lotOptions = lots.filter((lot) => !lot.deletedAt || rows.some((row) => row.lotId === lot.id));

  /** Merges `changes` into the query; defaults leave the URL, and any filter change goes back to page 1. */
  const setParams = (changes: Record<string, string | undefined>): void => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      if (value === "" || value === "all" || (key === "pagina" && value === "1")) next.delete(key);
      else next.set(key, value);
    }
    if (!("pagina" in changes)) next.delete("pagina");
    const nextQuery = next.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };
  const setPeriod = (next: Period) => setParams({ de: next.start, ate: next.end });
  const clearFilters = () => router.replace(`${pathname}?${periodSearch(period)}`, { scroll: false });

  const filterLabels: string[] = [];
  if (filter.kind !== "all") filterLabels.push(`Tipo: ${KIND_TAB_LABEL[filter.kind]}`);
  if (filter.group !== "all") {
    filterLabels.push(`Grupo: ${filter.group === "capital" ? "Capital" : ACCOUNT_GROUP_LABEL[filter.group]}`);
  }
  if (filter.accountId !== "all") filterLabels.push(`Conta: ${accountName(filter.accountId, accounts) ?? "—"}`);
  if (filter.lotId !== "all") {
    const lotName =
      filter.lotId === "farm" ? "Fazenda (sem lote)" : (lots.find((lot) => lot.id === filter.lotId)?.name ?? "—");
    filterLabels.push(`Lote: ${lotName}`);
  }
  if (filter.status !== "all") filterLabels.push(`Status: ${STATUS_CHOICE_LABEL[filter.status]}`);
  if (filter.search) filterLabels.push(`Busca: “${filter.search}”`);
  const periodLabel = `${formatDate(period.start)} e ${formatDate(period.end)}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 pb-16 md:px-8 md:pb-6">
      <Link
        href={`/finance?${periodSearch(period)}`}
        className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Financeiro
      </Link>

      <PageHeader
        title="Extrato"
        subtitle={`${lancamentos(filtered.length)} entre ${periodLabel}`}
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={
          <>
            {filtered.length > 0 ? (
              <ExportMenu
                title="Extrato"
                formats={["xlsx", "csv", "print"]}
                current={{
                  label: "Extrato",
                  detail: lancamentos(filtered.length),
                  filters: [`Período: ${formatDate(period.start)} a ${formatDate(period.end)}`, ...filterLabels],
                  build: () => [ledgerExportTable(filtered)],
                }}
              />
            ) : null}
            <LancarButton className="hidden md:inline-flex" />
          </>
        }
      />

      <ExtratoFilters
        period={period}
        filter={filter}
        accounts={accounts}
        lots={lotOptions}
        activeCount={filterLabels.length - (filter.kind === "all" ? 0 : 1)}
        onPeriodChange={setPeriod}
        onChange={setParams}
      />

      {rows.length === 0 ? (
        <section className="rounded-lg border border-hairline bg-panel">
          <EmptyState
            icon={Receipt}
            title="Nenhum lançamento no período"
            description={
              canEdit
                ? "Use “Lançar” para registrar uma despesa ou receita, ou escolha outro período."
                : "Escolha outro período para ver os lançamentos."
            }
          />
        </section>
      ) : filtered.length === 0 ? (
        <section className="flex flex-col items-center rounded-lg border border-hairline bg-panel pb-8">
          <EmptyState
            icon={SearchX}
            title="Nada com esses filtros"
            description="Nenhum lançamento do período passa pelos filtros escolhidos."
            className="pb-4"
          />
          <Button variant="outline" className="min-h-11 md:min-h-8" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </section>
      ) : (
        <>
          <ExtratoSummary rows={filtered} summary={summary} />
          <div className="hidden md:block">
            <ExtratoTable page={page} onPageChange={(next) => setParams({ pagina: String(next) })} />
          </div>
          <div className="md:hidden">
            {/* A new query starts the phone list over at 50 rows. */}
            <ExtratoList key={query} rows={filtered} />
          </div>
        </>
      )}

      {canEdit ? <FloatingLancar /> : null}
    </div>
  );
}

/** The phone's round "Lançar" over the tab bar; md+ uses the header's button. */
function FloatingLancar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        aria-label="Lançar"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-24 z-30 size-12 rounded-full shadow-lg md:hidden"
      >
        <Plus className="size-5" aria-hidden />
      </Button>
      {open ? <EntryDialog open onOpenChange={setOpen} /> : null}
    </>
  );
}
