"use client";

/**
 * /finance/contas/[id]/conciliar/[importId]: each linha of an imported
 * extrato beside the MeuBov record it confirms — conciliada (Desfazer), a
 * suggestion to confirm, or "Sem lançamento correspondente" with Criar
 * lançamento · É transferência · Ignorar. The suggestions are built here from
 * the herd the page holds; every decision goes to the server one line at a
 * time.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CheckCheck, CircleCheck, CircleDashed, Plus, Sparkles } from "lucide-react";
import type { Resolved } from "@/lib/api/domains/statements/useCases/ResolveLine.useCase";
import type { ImportView } from "@/lib/api/domains/statements/useCases/GetImport.useCase";
import type { StatementLine } from "@/lib/types";
import { ACCOUNT_GROUP_LABEL, accountName } from "@/lib/domain/accounts";
import { accountBalance, bankAccountLabel } from "@/lib/domain/bankAccounts";
import { addDays, formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import {
  MATCH_WINDOW_DAYS,
  candidatesFor,
  pairKey,
  suggestMatches,
  suggestionReason,
  type Candidate,
  type MatchTarget,
  type Suggestion,
} from "@/lib/domain/statements/match";
import { useHerdStore, type LineDecision } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { PageHeader } from "@/components/layout/PageHeader";
import { FinanceSubnav } from "@/components/finance/FinanceSubnav";
import { EntryDialog } from "@/components/finance/EntryDialog";
import { IgnoreLineDialog, OtherMatchDialog, TransferLineDialog } from "@/components/finance/contas/LineDialogs";
import { Button } from "@/components/ui/button";
import { defaultPeriod } from "@/lib/domain/period";
import { todayISO } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";

type Filter = "all" | "suggested" | "unmatched" | "resolved";
const FILTERS: readonly { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "suggested", label: "Sugestões" },
  { key: "unmatched", label: "Sem par" },
  { key: "resolved", label: "Conciliadas" },
];

const PILL = "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

/** The record a line points at, if any. */
const pairedId = (line: StatementLine) => line.expenseId ?? line.movementId ?? line.transferId;

export function ConciliarPage({ accountId, importId }: { accountId: string; importId: string }) {
  const canEdit = useCan("finance", "edit");
  const loadImport = useHerdStore((s) => s.loadImport);
  const resolveStatementLine = useHerdStore((s) => s.resolveStatementLine);
  const confirmHighMatches = useHerdStore((s) => s.confirmHighMatches);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const expenses = useHerdStore((s) => s.expenses);
  const movements = useHerdStore((s) => s.movements);
  const transfers = useHerdStore((s) => s.transfers);
  const accounts = useHerdStore((s) => s.accounts);
  const { addToast } = useToast();

  const [view, setView] = useState<ImportView | null | "missing">(null);
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [paired, setPaired] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ kind: "other" | "transfer" | "ignore" | "create"; line: StatementLine } | null>(null);

  const show = (loaded: ImportView) => {
    setView(loaded);
    setLines(loaded.lines);
    setPaired(new Set(loaded.pairedIds));
  };

  useEffect(() => {
    let live = true;
    loadImport(importId)
      .then((loaded) => {
        if (!live) return;
        if (!loaded) return setView("missing");
        show(loaded);
      })
      .catch(() => live && setView("missing"));
    return () => {
      live = false;
    };
  }, [importId, loadImport]);

  // The import names its conta; the URL's is only a fallback until it loads.
  const conta = view !== null && view !== "missing" ? view.import.bankAccountId : accountId;
  const account = bankAccounts.find((a) => a.id === conta);
  const inputs = useMemo(
    () => ({ expenses, movements, transfers, bankAccounts }),
    [expenses, movements, transfers, bankAccounts]
  );
  const candidates = useMemo(() => candidatesFor(conta, inputs, paired), [conta, inputs, paired]);
  const suggestions = useMemo(() => suggestMatches(lines, candidates), [lines, candidates]);
  // Every record of this conta, paired or not, to name what a resolved line points at.
  const records = useMemo(
    () => new Map(candidatesFor(conta, inputs, new Set()).map((c) => [c.target.id, c])),
    [conta, inputs]
  );

  if (view === null) return <p className="px-4 py-10 text-center text-sm text-ink-soft">Carregando o extrato…</p>;
  if (view === "missing" || !account) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center">
        <p className="text-sm text-ink">Esse extrato não existe nesta fazenda.</p>
        <Link href="/finance/contas" className="text-sm font-medium text-brand hover:underline">
          Contas bancárias
        </Link>
      </div>
    );
  }

  const describe = (c: Candidate): { title: string; detail: string } => {
    const when = `${c.pending ? "venc. " : ""}${formatDate(c.date).slice(0, 5)}`;
    if (c.expense) {
      const e = c.expense;
      const group = ACCOUNT_GROUP_LABEL[e.kind === "revenue" ? "revenue" : e.category];
      const plan = accountName(e.accountId, accounts);
      return {
        title: plan ? `${group} › ${plan}` : group,
        detail: [e.counterparty, formatCurrency(c.amountBrl), when].filter(Boolean).join(" · "),
      };
    }
    if (c.movement) {
      return {
        title: c.kind === "sale" ? "Venda de gado" : "Compra de gado",
        detail: [c.name, formatCurrency(c.amountBrl), when].filter(Boolean).join(" · "),
      };
    }
    return {
      title: `Transferência ${c.kind === "transferOut" ? "para" : "de"} ${c.name ?? "outra conta"}`,
      detail: [formatCurrency(c.amountBrl), when].join(" · "),
    };
  };

  const pendingLines = lines.filter((l) => l.status === "pending");
  const resolvedCount = lines.length - pendingLines.length;
  const suggestedCount = pendingLines.filter((l) => suggestions.has(l.id)).length;
  const counts: Record<Filter, number> = {
    all: lines.length,
    suggested: suggestedCount,
    unmatched: pendingLines.length - suggestedCount,
    resolved: resolvedCount,
  };
  const high = pendingLines
    .map((l) => ({ line: l, top: suggestions.get(l.id)?.[0] }))
    .filter((x): x is { line: StatementLine; top: Suggestion } => x.top?.confidence === "high");
  const shown = lines.filter((l) =>
    filter === "all"
      ? true
      : filter === "resolved"
        ? l.status !== "pending"
        : l.status === "pending" && suggestions.has(l.id) === (filter === "suggested")
  );

  const imp = view.import;
  const bankBalance = imp.bankBalanceBrl;
  const ourBalance =
    bankBalance !== undefined && imp.bankBalanceDate ? accountBalance(account, inputs, imp.bankBalanceDate) : null;
  const difference = ourBalance === null || bankBalance === undefined ? 0 : Math.round((bankBalance - ourBalance) * 100) / 100;

  /** Applies decided lines to the page: the line itself and what is paired now. */
  const apply = (before: StatementLine[], results: Resolved[]) => {
    setLines((current) => current.map((l) => results.find((r) => r.line.id === l.id)?.line ?? l));
    setPaired((current) => {
      const next = new Set(current);
      for (const line of before) {
        const key = pairKey(line);
        if (key) next.delete(key);
      }
      for (const r of results) {
        const key = pairKey(r.line);
        if (key) next.add(key);
      }
      return next;
    });
  };

  const decide = async (line: StatementLine, decision: LineDecision) => {
    setBusyId(line.id);
    try {
      const result = await resolveStatementLine(line, decision);
      if (result) {
        apply(decision.type === "undo" ? [line] : [], [result]);
        setAsking(null);
      }
    } catch {
      // apiFail already toasted
    } finally {
      setBusyId(null);
    }
  };

  const confirmHigh = async () => {
    setBusyId("high");
    try {
      const result = await confirmHighMatches(
        imp.id,
        high.map(({ line, top }) => ({ lineId: line.id, ...top.candidate.target }))
      );
      apply([], result.resolved);
      // A refused pair may mean the page is stale (paid meanwhile, another value): read the import again.
      if (result.refused > 0) {
        const fresh = await loadImport(imp.id);
        if (fresh) show(fresh);
      }
      addToast({
        messageType: result.refused > 0 ? "warning" : "success",
        text:
          result.refused > 0
            ? `${result.resolved.length} confirmadas · ${result.refused} recusadas`
            : `${result.resolved.length} confirmadas`,
      });
    } catch {
      // apiFail already toasted
    } finally {
      setBusyId(null);
    }
  };

  const match = (line: StatementLine, target: MatchTarget) => decide(line, { type: "match", target });
  const lineBusy = (line: StatementLine) => busyId === line.id || busyId === "high";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 pb-16 md:px-8 md:pb-6">
      <PageHeader
        title={`Conciliar · ${bankAccountLabel(account)} · ${formatNumber(lines.length)} ${lines.length === 1 ? "linha" : "linhas"}`}
        subtitle={`Extrato importado: ${imp.fileName} · ${formatDate(imp.periodFrom).slice(0, 5)} a ${formatDate(imp.periodTo)}`}
        actions={
          <Link
            href="/finance/contas"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline md:min-h-0"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Contas bancárias
          </Link>
        }
      />
      <FinanceSubnav current="contas" period={defaultPeriod(todayISO())} />

      <section aria-label="Andamento da conciliação" className="flex flex-col gap-2.5 rounded-lg border border-hairline bg-panel px-4 py-3.5">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <p className="text-[15px] text-ink">
            <span className="font-mono font-medium">{formatNumber(resolvedCount)}</span> de{" "}
            <span className="font-mono font-medium">{formatNumber(lines.length)}</span> resolvidas ·{" "}
            <span className="font-mono font-medium text-scheduled">{formatNumber(suggestedCount)}</span> sugestões ·{" "}
            <span className="font-mono font-medium text-overdue">{formatNumber(counts.unmatched)}</span> sem par
          </p>
          {bankBalance !== undefined && imp.bankBalanceDate && ourBalance !== null ? (
            <p className="text-xs text-ink-soft">
              Banco: <span className="font-mono text-ink">{formatCurrency(bankBalance)}</span> em{" "}
              {formatDate(imp.bankBalanceDate).slice(0, 5)} · MeuBov:{" "}
              <span className="font-mono text-ink">{formatCurrency(ourBalance)}</span>
              {difference !== 0 ? (
                <>
                  {" "}
                  · diferença <span className="font-mono text-attention">{formatCurrency(Math.abs(difference))}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div
          role="progressbar"
          aria-label="Linhas resolvidas"
          aria-valuemin={0}
          aria-valuemax={lines.length}
          aria-valuenow={resolvedCount}
          className="flex h-2 overflow-hidden rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--color-hairline)]"
        >
          <div className="bg-brand" style={{ width: `${(resolvedCount / Math.max(1, lines.length)) * 100}%` }} />
          <div className="bg-scheduled opacity-55" style={{ width: `${(suggestedCount / Math.max(1, lines.length)) * 100}%` }} />
        </div>
      </section>

      <section className="rounded-lg border border-hairline bg-panel">
        <header className="border-b border-hairline px-4 py-3">
          <h2 className="font-heading text-base font-semibold text-ink">Linhas do extrato</h2>
          <p className="text-xs text-ink-soft">cada linha do banco ao lado do lançamento que ela confirma</p>
        </header>
        <div className="flex flex-col gap-3 border-b border-hairline px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div role="group" aria-label="Mostrar" className="flex gap-0.5 overflow-x-auto rounded-lg border border-hairline bg-surface p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-md px-3 text-[13px] whitespace-nowrap md:min-h-8",
                  filter === f.key
                    ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                {f.label}
                <span className="font-mono text-xs text-ink-soft">{formatNumber(counts[f.key])}</span>
              </button>
            ))}
          </div>
          {canEdit && high.length > 0 ? (
            <Button variant="outline" size="sm" className="min-h-11 md:min-h-8" disabled={busyId !== null} onClick={() => void confirmHigh()}>
              <CheckCheck aria-hidden />
              Confirmar as {formatNumber(high.length)} de confiança alta
            </Button>
          ) : null}
        </div>

        <div className="hidden grid-cols-[minmax(0,440px)_24px_minmax(0,1fr)] gap-4 bg-surface px-4 py-2.5 md:grid">
          <span className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">Linha do banco</span>
          <span />
          <span className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">Lançamento no MeuBov</span>
        </div>
        <ul>
          {shown.map((line) => {
            const top = suggestions.get(line.id)?.[0];
            const record = pairedId(line) ? records.get(pairedId(line)!) : undefined;
            const outflow = line.amountBrl < 0;
            const fullButton = "max-md:min-h-11 max-md:w-full";
            let right: ReactNode;
            if (line.status !== "pending") {
              const described = record ? describe(record) : null;
              right = (
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5">
                  <span className="flex min-w-0 flex-1 items-start gap-2.5">
                    <CircleCheck
                      className="mt-0.5 size-5 shrink-0 text-healthy"
                      aria-label={line.status === "ignored" ? "ignorada" : "conciliada"}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">
                        {line.status === "ignored" ? "Ignorada" : (described?.title ?? "Conciliada")}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {line.status === "ignored" ? line.ignoreReason : (described?.detail ?? "")}
                      </span>
                    </span>
                  </span>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("text-ink-soft", fullButton)}
                      disabled={lineBusy(line)}
                      onClick={() => void decide(line, { type: "undo" })}
                    >
                      Desfazer
                    </Button>
                  ) : null}
                </div>
              );
            } else if (top) {
              const { title, detail } = describe(top.candidate);
              right = (
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5">
                  <span className="flex min-w-0 flex-1 items-start gap-2.5">
                    <Sparkles className="mt-0.5 size-5 shrink-0 text-scheduled" aria-hidden />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            PILL,
                            top.confidence === "high" ? "bg-healthy-soft text-healthy" : "bg-attention-soft text-attention"
                          )}
                        >
                          confiança {top.confidence === "high" ? "alta" : "média"}
                        </span>
                        <span className="text-xs text-ink-soft">{suggestionReason(top)}</span>
                      </span>
                      <span className="mt-1 block text-sm text-ink">
                        <span className="text-ink-soft">provável: </span>
                        {title} · {detail}
                      </span>
                    </span>
                  </span>
                  {canEdit ? (
                    <span className="flex flex-col gap-2 md:flex-row">
                      <Button size="sm" className={fullButton} disabled={lineBusy(line)} onClick={() => void match(line, top.candidate.target)}>
                        <Check aria-hidden />
                        Confirmar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={fullButton}
                        disabled={lineBusy(line)}
                        onClick={() => setAsking({ kind: "other", line })}
                      >
                        Outro lançamento
                      </Button>
                    </span>
                  ) : null}
                </div>
              );
            } else {
              // Four actions beside the hint: they wrap below it rather than squeeze it.
              right = (
                <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-2.5">
                  <span className="flex min-w-0 flex-1 items-start gap-2.5 md:min-w-56">
                    <CircleDashed className="mt-0.5 size-5 shrink-0 text-overdue" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">Sem lançamento correspondente</span>
                      <span className="block text-xs text-ink-soft">
                        nenhum lançamento com esse valor entre {formatDate(addDays(line.date, -MATCH_WINDOW_DAYS)).slice(0, 5)} e{" "}
                        {formatDate(addDays(line.date, MATCH_WINDOW_DAYS)).slice(0, 5)}
                      </span>
                    </span>
                  </span>
                  {canEdit ? (
                    <span className="flex flex-col gap-2 md:flex-row md:flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className={fullButton}
                        disabled={lineBusy(line)}
                        onClick={() => setAsking({ kind: "create", line })}
                      >
                        <Plus aria-hidden />
                        Criar lançamento
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={fullButton}
                        disabled={lineBusy(line)}
                        onClick={() => setAsking({ kind: "transfer", line })}
                      >
                        É transferência
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn("text-ink-soft", fullButton)}
                        disabled={lineBusy(line)}
                        onClick={() => setAsking({ kind: "ignore", line })}
                      >
                        Ignorar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn("text-ink-soft", fullButton)}
                        disabled={lineBusy(line)}
                        onClick={() => setAsking({ kind: "other", line })}
                      >
                        Buscar lançamento
                      </Button>
                    </span>
                  ) : null}
                </div>
              );
            }
            return (
              <li
                key={line.id}
                className="grid grid-cols-1 gap-3 border-t border-hairline px-4 py-3.5 first:border-t-0 md:grid-cols-[minmax(0,440px)_24px_minmax(0,1fr)] md:items-start md:gap-4"
              >
                <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-baseline gap-3">
                  <span className="font-mono text-xs text-ink-soft">{formatDate(line.date).slice(0, 5)}</span>
                  <span className="truncate font-mono text-[13px] text-ink" title={line.description}>
                    {line.description}
                  </span>
                  <span className={cn("font-mono text-sm font-medium", outflow ? "text-ink" : "text-healthy")}>
                    {outflow ? "−" : "+"}
                    {formatNumber(Math.abs(line.amountBrl), 2)}
                  </span>
                </div>
                <ArrowRight className="hidden size-4 text-ink-soft opacity-50 md:block" aria-hidden />
                {right}
              </li>
            );
          })}
        </ul>
        <p className="border-t border-hairline px-4 py-2.5 text-xs text-ink-soft">
          Mostrando {formatNumber(shown.length)} de {formatNumber(lines.length)} linhas, por data
        </p>
      </section>

      {asking?.kind === "create" ? (
        <EntryDialog
          open
          onOpenChange={(open) => {
            if (!open) setAsking(null);
          }}
          fromLine={asking.line}
          onResolved={(result) => apply([], [result])}
        />
      ) : null}
      {asking?.kind === "other" ? (
        <OtherMatchDialog
          line={asking.line}
          suggestions={suggestions.get(asking.line.id) ?? []}
          candidates={candidates}
          describe={describe}
          busy={busyId !== null}
          onClose={() => setAsking(null)}
          onPick={(target) => void match(asking.line, target)}
        />
      ) : null}
      {asking?.kind === "transfer" ? (
        <TransferLineDialog
          line={asking.line}
          accounts={bankAccounts}
          busy={busyId !== null}
          onClose={() => setAsking(null)}
          onPick={(otherAccountId) => void decide(asking.line, { type: "transfer", otherAccountId })}
        />
      ) : null}
      {asking?.kind === "ignore" ? (
        <IgnoreLineDialog
          line={asking.line}
          busy={busyId !== null}
          onClose={() => setAsking(null)}
          onPick={(reason) => void decide(asking.line, { type: "ignore", reason })}
        />
      ) : null}
    </div>
  );
}
