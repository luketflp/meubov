"use client";

/**
 * /finance/orcamento: what the farm planned to spend in each grupo of the
 * plano de contas over the safra in ?safra= (absent = the one holding today,
 * from the farm's "Início da safra"), how much of it is used and where the
 * safra is heading. The safra's budgets load on demand, and the previous
 * safra's with them for the edit dialog's hint and the copy. A table on md+,
 * cards on the phone. The window (?de&ate) only rides along for the
 * sub-navigation.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Plus, Target } from "lucide-react";
import type { ExpenseCategory } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { EXPENSE_GROUPS } from "@/lib/domain/accounts";
import { budgetView, safraLabel, safraOf, safraRange, type BudgetInputs, type BudgetView } from "@/lib/domain/budget";
import { MONTH_ABBREV, formatDate, todayISO } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { periodFromSearch } from "@/lib/domain/period";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { BudgetCards } from "@/components/finance/orcamento/BudgetCards";
import { BudgetEditDialog } from "@/components/finance/orcamento/BudgetEditDialog";
import { reais } from "@/components/finance/orcamento/BudgetMeter";
import { BudgetTable } from "@/components/finance/orcamento/BudgetTable";
import { CopyDialog } from "@/components/finance/orcamento/CopyDialog";
import { SafraPicker } from "@/components/finance/orcamento/SafraPicker";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

/** "?safra=2025": a year the API takes (2000–2100), else null. */
function safraParam(value: string | null): number | null {
  const year = value !== null && /^\d{4}$/.test(value) ? Number(value) : NaN;
  return year >= 2000 && year <= 2100 ? year : null;
}

export function OrcamentoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEdit = useCan("finance", "edit");
  // An offline snapshot from before the orçamento has no início da safra.
  const startMonth = useHerdStore((s) => s.farm.safraStartMonth ?? 10);
  const expenses = useHerdStore((s) => s.expenses);
  const treatments = useHerdStore((s) => s.treatments);
  const accounts = useHerdStore((s) => s.accounts);
  const loadBudgets = useHerdStore((s) => s.loadBudgets);
  const today = todayISO();

  const period = useMemo(() => periodFromSearch(searchParams, today), [searchParams, today]);
  const current = safraOf(today, startMonth);
  const safra = safraParam(searchParams.get("safra")) ?? current;
  const budgets = useHerdStore((s) => s.budgets[safra]);
  const previousBudgets = useHerdStore((s) => s.budgets[safra - 1]);
  const setSafra = (next: number) => {
    const query = new URLSearchParams(searchParams.toString());
    query.set("safra", String(next));
    router.replace(`/finance/orcamento?${query}`, { scroll: false });
  };

  /** The safra whose load failed, and whether there was no signal then. */
  const [failed, setFailed] = useState<{ safra: number; offline: boolean } | null>(null);
  const [editing, setEditing] = useState<{ category: ExpenseCategory; pick: boolean } | null>(null);
  const [copying, setCopying] = useState(false);

  // Loaded whenever absent: the store empties the cache on a farm switch and on a new início da safra.
  const missing = budgets === undefined;
  const previousMissing = previousBudgets === undefined;
  useEffect(() => {
    if (!missing) return;
    let live = true;
    // The store toasts a failed load, but not one without signal; the page says so either way instead of waiting forever.
    loadBudgets(safra).catch(() => {
      if (live) setFailed({ safra, offline: useHerdStore.getState().offline || !navigator.onLine });
    });
    return () => {
      live = false;
    };
  }, [missing, safra, loadBudgets]);
  useEffect(() => {
    // The previous safra only feeds the edit dialog's hint and the copy; 1999 is out of the API's range.
    if (previousMissing && safra > 2000) loadBudgets(safra - 1).catch(() => {});
  }, [previousMissing, safra, loadBudgets]);

  const inputs = useMemo<BudgetInputs>(
    () => ({ budgets: budgets ?? [], expenses, treatments, accounts }),
    [budgets, expenses, treatments, accounts]
  );
  const view = useMemo(
    () => (budgets ? budgetView(inputs, safra, startMonth, today) : null),
    [budgets, inputs, safra, startMonth, today]
  );
  const range = safraRange(safra, startMonth);
  const budgeted = view?.groups.some((group) => group.hasBudget) ?? false;
  /** "Orçar um grupo": the first grupo without an orçado, Nutrição on an empty safra. */
  const orcar = () =>
    setEditing({
      category:
        EXPENSE_GROUPS.find((category) => !view?.groups.some((g) => g.category === category && g.hasBudget)) ??
        "nutrition",
      pick: true,
    });
  const onEdit = (category: ExpenseCategory) => setEditing({ category, pick: false });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 pb-16 md:px-8 md:pb-6">
      <PageHeader
        title={`Orçamento · ${safraLabel(safra, startMonth).replace("Safra", "safra")}`}
        subtitle={`${formatDate(range.start)} a ${formatDate(range.end)} · COE por grupo do plano de contas`}
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={
          <>
            <SafraPicker value={safra} current={current} startMonth={startMonth} onChange={setSafra} />
            {canEdit ? (
              <Button
                variant="outline"
                className="min-h-11 md:min-h-8"
                aria-label="Copiar da safra anterior"
                disabled={view === null}
                onClick={() => setCopying(true)}
              >
                <Copy aria-hidden />
                <span className="md:hidden">Copiar</span>
                <span className="hidden md:inline">Copiar da safra anterior</span>
              </Button>
            ) : null}
          </>
        }
      />
      <FinanceSubnav current="orcamento" period={period} />

      {view === null ? (
        <p className="py-10 text-center text-sm text-ink-soft">
          {failed?.safra !== safra
            ? "Carregando o orçamento…"
            : failed.offline
              ? "Sem conexão: o orçamento precisa de sinal. Tente de novo quando conectar."
              : "Não foi possível carregar o orçamento desta safra."}
        </p>
      ) : !budgeted ? (
        <section className="flex flex-col items-center rounded-lg border border-hairline bg-panel pb-8">
          <EmptyState
            icon={Target}
            title="Nenhum orçamento para esta safra"
            description={
              canEdit
                ? "Copie o orçado ou o realizado da safra anterior, ou orce um grupo do plano de contas mês a mês."
                : "Quem edita o Financeiro define aqui quanto cada grupo pode gastar na safra."
            }
            className="pb-4"
          />
          {canEdit ? (
            <div className="flex flex-wrap justify-center gap-2 px-4">
              <Button variant="outline" className="min-h-11 md:min-h-8" onClick={() => setCopying(true)}>
                <Copy aria-hidden />
                Copiar da safra anterior
              </Button>
              <Button className="min-h-11 md:min-h-8" onClick={orcar}>
                <Plus aria-hidden />
                Orçar um grupo
              </Button>
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <BudgetStrip view={view} today={today} end={range.end} />
          <div className="hidden md:block">
            <BudgetTable view={view} canEdit={canEdit} onEdit={onEdit} onAdd={orcar} />
          </div>
          <div className="md:hidden">
            <BudgetCards view={view} canEdit={canEdit} onEdit={onEdit} onAdd={orcar} />
          </div>
        </>
      )}

      {editing && view ? (
        <BudgetEditDialog
          safra={safra}
          startMonth={startMonth}
          category={editing.category}
          pickGroup={editing.pick}
          onCategoryChange={(category) => setEditing({ category, pick: true })}
          view={view}
          previous={previousBudgets}
          inputs={inputs}
          today={today}
          onOpenChange={() => setEditing(null)}
        />
      ) : null}
      {copying && view ? (
        <CopyDialog
          safra={safra}
          startMonth={startMonth}
          inputs={inputs}
          source={previousBudgets}
          onOpenChange={() => setCopying(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Orçado (whole safra), Realizado up to today's month, Variação against the
 * orçado to date and Previsto até o fim, all of the grupos with a budget (a
 * grupo without one shows its spending in its own row). The phone keeps three
 * cells in two columns and folds the previsto into the Variação's line.
 */
function BudgetStrip({ view, today, end }: { view: BudgetView; today: string; end: string }) {
  const t = view.totals;
  const at = view.todayIndex;
  const grupos = view.groups.filter((group) => group.hasBudget).length;
  const toDate = t.budgetedToDate > 0;
  const diff = t.realizedToDate - t.budgetedToDate;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-4">
      <Cell
        label="Orçado"
        value={reais(t.budgetedTotal)}
        sub={
          <>
            {grupos} {grupos === 1 ? "grupo" : "grupos"} com orçamento
            <span className="hidden md:inline"> · safra inteira</span>
          </>
        }
      />
      <Cell
        label={at < 0 ? "Realizado" : `Realizado até ${MONTH_ABBREV[view.months[Math.min(at, 11)].month - 1]}`}
        value={reais(t.realizedToDate)}
        sub={
          at < 0 ? (
            "a safra ainda não começou"
          ) : at > 11 ? (
            "safra encerrada"
          ) : (
            <>
              <span className="hidden md:inline">pago e a pagar </span>até {formatDate(today).slice(0, 5)}
            </>
          )
        }
      />
      <Cell
        label="Variação"
        value={toDate ? `${sign}${formatNumber((Math.abs(diff) / t.budgetedToDate) * 100, 1)} %` : "—"}
        ink={toDate && diff > 0 ? "text-overdue" : "text-ink"}
        sub={
          <>
            {!toDate
              ? "nada orçado até hoje"
              : diff === 0
                ? "igual ao orçado"
                : `${reais(Math.abs(diff))} ${diff > 0 ? "acima" : "abaixo"} do orçado`}
            <span className="md:hidden"> · previsto {reais(t.forecast)}</span>
          </>
        }
        className="col-span-2 md:col-span-1"
      />
      <Cell
        label="Previsto até o fim"
        value={reais(t.forecast)}
        sub={`com pendentes e recorrências até ${formatDate(end).slice(0, 5)}`}
        className="hidden md:block"
      />
    </dl>
  );
}

function Cell({
  label,
  value,
  sub,
  ink = "text-ink",
  className,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  ink?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 bg-panel px-4 py-3.5", className)}>
      <dt className="truncate text-[11px] font-medium tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono text-lg font-medium tabular-nums", ink)}>{value}</dd>
      {/* The sub wraps on the phone instead of being cut. */}
      <dd className="mt-0.5 text-[11px] leading-4 text-ink-soft">{sub}</dd>
    </div>
  );
}
