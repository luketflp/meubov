"use client";

/**
 * "Copiar da safra anterior": the previous safra's orçado or realizado, with
 * an ajuste in % (−50 to +100, each month rounded to the centavo), becomes
 * this safra's orçado on every line, grupo or conta, that has none yet; the
 * realizado gives grupo lines only. The preview counts the lines and shows the
 * safra's orçado after copying.
 */
import { useMemo, useState, type FormEvent } from "react";
import type { Budget } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { budgetView, copyPlan, safraLabel, safraMonths, type BudgetInputs } from "@/lib/domain/budget";
import { todayISO } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import { useToast } from "@/components/providers/Toasts";
import { reais } from "@/components/finance/orcamento/BudgetMeter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Source = "budgeted" | "realized";

const SOURCES: readonly { value: Source; label: string }[] = [
  { value: "budgeted", label: "Orçado" },
  { value: "realized", label: "Realizado" },
];

const count = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

interface CopyDialogProps {
  /** The safra copied into; the source is the one before it. */
  safra: number;
  startMonth: number;
  /** This safra's budgets and the farm's lançamentos, contas and grupos. */
  inputs: BudgetInputs;
  /** The previous safra's budgets; undefined while they load. */
  source: Budget[] | undefined;
  onOpenChange(open: boolean): void;
}

export function CopyDialog({ safra, startMonth, inputs, source, onOpenChange }: CopyDialogProps) {
  const copyBudgets = useHerdStore((s) => s.copyBudgets);
  const { addToast } = useToast();
  const [from, setFrom] = useState<Source>("budgeted");
  const [adjust, setAdjust] = useState("0");
  const [busy, setBusy] = useState(false);
  const today = todayISO();
  const previous = safraLabel(safra - 1, startMonth).replace("Safra", "safra");
  const pct = Number(adjust.replace(",", "."));
  const pctOk = adjust.trim() !== "" && Number.isFinite(pct) && pct >= -50 && pct <= 100;

  // What Copiar would write and the safra's orçado with it; null while the source loads.
  const preview = useMemo(() => {
    if (!pctOk || (from === "budgeted" && source === undefined)) return null;
    const plan = copyPlan(
      { ...inputs, budgets: [...(source ?? []), ...inputs.budgets] },
      safra - 1,
      safra,
      from,
      pct,
      startMonth,
      today
    );
    const months = safraMonths(safra, startMonth);
    // CopyLine.months follow the safra's months: each becomes the row of its calendar month.
    const planned: Budget[] = plan.lines.flatMap((line, l) =>
      line.months.map((amountBrl, i) => ({
        id: `copy-${l}-${i}`,
        category: line.category,
        accountId: line.accountId ?? undefined,
        month: `${months[i].key}-01`,
        amountBrl,
        distribution: "manual" as const,
      }))
    );
    const after = budgetView({ ...inputs, budgets: [...inputs.budgets, ...planned] }, safra, startMonth, today).totals
      .budgetedTotal;
    return { lines: plan.lines.length, skipped: plan.skipped, after };
  }, [pctOk, from, source, inputs, safra, pct, startMonth, today]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || preview.lines === 0) return;
    setBusy(true);
    let result: { copied: number; skipped: number };
    try {
      result = await copyBudgets({ from: safra - 1, to: safra, source: from, adjustPct: pct });
    } catch {
      setBusy(false); // the store already toasted
      return;
    }
    addToast({
      messageType: "success",
      text: `${count(result.copied, "linha copiada", "linhas copiadas")} · ${count(
        result.skipped,
        "já tinha orçamento",
        "já tinham orçamento"
      )}`,
    });
    onOpenChange(false);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copiar da safra anterior</DialogTitle>
          <DialogDescription>
            Para a {safraLabel(safra, startMonth).replace("Safra", "safra")}: só as linhas que ainda não têm orçamento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <span id="copy-source" className="text-sm leading-none font-medium">
              Copiar da {previous}
            </span>
            <div
              role="radiogroup"
              aria-labelledby="copy-source"
              className="flex gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
            >
              {SOURCES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={from === value}
                  onClick={() => setFrom(value)}
                  className={cn(
                    "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] transition-colors md:min-h-8",
                    from === value
                      ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {from === "realized" ? (
              <p className="text-xs text-ink-soft">
                O realizado de cada grupo vira o orçado do mês; as contas ficam sem orçamento.
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="copy-adjust">Ajuste (%)</Label>
            <Input
              id="copy-adjust"
              type="number"
              inputMode="decimal"
              min={-50}
              max={100}
              step={1}
              value={adjust}
              onChange={(e) => setAdjust(e.target.value)}
              className="min-h-11 w-32 font-mono md:min-h-8"
            />
            <p className={cn("text-xs", pctOk ? "text-ink-soft" : "text-overdue")}>
              {pctOk ? "de −50 a +100 %, em cada mês, arredondado ao centavo" : "Informe um ajuste de −50 a +100 %."}
            </p>
          </div>
          <div aria-live="polite" className="rounded-lg border border-hairline bg-surface px-3 py-2.5 text-sm">
            {preview === null ? (
              <p className="text-ink-soft">{pctOk ? `Carregando o orçamento da ${previous}…` : "—"}</p>
            ) : preview.lines === 0 ? (
              <p className="text-ink-soft">
                {preview.skipped > 0
                  ? "Todas as linhas já têm orçamento nesta safra."
                  : from === "budgeted"
                    ? `A ${previous} não tem orçamento.`
                    : `A ${previous} não tem despesas.`}
              </p>
            ) : (
              <>
                <p className="text-ink">
                  {count(preview.lines, "linha nova", "linhas novas")}
                  {preview.skipped > 0 ? ` · ${count(preview.skipped, "já tem orçamento", "já têm orçamento")}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  orçado da safra depois de copiar{" "}
                  <span className="font-mono text-sm font-medium text-ink">{reais(preview.after)}</span>
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11 md:min-h-8" disabled={busy}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="min-h-11 md:min-h-8"
              disabled={busy || preview === null || preview.lines === 0}
            >
              Copiar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
