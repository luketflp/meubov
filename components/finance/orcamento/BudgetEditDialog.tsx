"use client";

/**
 * "Orçamento · <grupo>" for one safra: the grupo's total, how it spreads over
 * the twelve months (Igual, Como a safra anterior, Manual) and the months
 * themselves, with the check that they add up; under "Contas", the same for
 * each conta of the grupo, each with its own total and distribution. A blank
 * conta has no budget, and clearing one that had removes it. Saving writes
 * only the lines that changed and is refused while a line's months do not add
 * up to its total. A bottom sheet on the phone (months in 3 columns), the
 * centred dialog from sm up (6 columns). From "Orçar um grupo" the grupo is
 * picked here.
 */
import { useMemo, useState, type FormEvent } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Trash2 } from "lucide-react";
import type { Budget, BudgetDistribution, ExpenseCategory } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { EXPENSE_GROUPS, accountsByGroup } from "@/lib/domain/accounts";
import { cents } from "@/lib/domain/bankAccounts";
import {
  budgetView,
  distribute,
  lineKey,
  previousShape,
  safraLabel,
  safraMonths,
  type BudgetInputs,
  type BudgetView,
} from "@/lib/domain/budget";
import { formatCurrency } from "@/lib/domain/format";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/domain/labels";
import { monthYear } from "@/lib/domain/series";
import { useToast } from "@/components/providers/Toasts";
import { parseAmount } from "@/components/finance/parseAmount";
import { reais } from "@/components/finance/orcamento/BudgetMeter";
import {
  checkLine,
  lineFields,
  withDistribution,
  withMonth,
  withTotal,
  type LineCheck,
  type LineFields,
} from "@/components/finance/orcamento/editFields";
import { Button } from "@/components/ui/button";
import { BOTTOM_SHEET } from "@/components/ui/bottom-sheet";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** A bottom sheet on the phone, the centred dialog from sm up. */
const SHEET = cn(
  BOTTOM_SHEET,
  "max-h-[90dvh] overflow-y-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-[720px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:pb-4"
);

const DISTRIBUTIONS: readonly { value: BudgetDistribution; label: string; short: string }[] = [
  { value: "equal", label: "Igual", short: "Igual" },
  { value: "previous", label: "Como a safra anterior", short: "Anterior" },
  { value: "manual", label: "Manual", short: "Manual" },
];

/** One segment of a conta's distribution switch. */
const segment = (selected: boolean) =>
  cn(
    "flex min-h-11 flex-1 items-center justify-center rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors md:min-h-7",
    selected ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]" : "text-ink-soft hover:text-ink"
  );

interface BudgetEditDialogProps {
  safra: number;
  startMonth: number;
  category: ExpenseCategory;
  /** Opened from "Orçar um grupo": the grupo is picked in the dialog. */
  pickGroup: boolean;
  onCategoryChange(category: ExpenseCategory): void;
  /** This safra's orçamento. */
  view: BudgetView;
  /** The previous safra's budgets, for the hint; undefined while they load. */
  previous: Budget[] | undefined;
  /** This safra's budgets and the farm's lançamentos, treatments and contas. */
  inputs: BudgetInputs;
  /** The page's today: a prop, so the React Compiler keeps the form's memos. */
  today: string;
  onOpenChange(open: boolean): void;
}

export function BudgetEditDialog({
  safra,
  startMonth,
  category,
  pickGroup,
  onCategoryChange,
  view,
  previous,
  inputs,
  today,
  onOpenChange,
}: BudgetEditDialogProps) {
  // While saving the dialog stays: Esc, outside click and Cancelar wait.
  const [busy, setBusy] = useState(false);
  const months = safraMonths(safra, startMonth);
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className={SHEET}>
        <DialogHeader>
          <DialogTitle className="text-lg leading-6 font-semibold sm:text-xl">
            Orçamento · {EXPENSE_CATEGORY_LABEL[category]}
          </DialogTitle>
          <DialogDescription>
            {safraLabel(safra, startMonth)} · {monthYear(`${months[0].key}-01`)} a {monthYear(`${months[11].key}-01`)}
          </DialogDescription>
        </DialogHeader>
        {pickGroup ? (
          <div className="grid gap-1.5">
            <Label htmlFor="budget-group">Grupo</Label>
            <Select
              value={category}
              onValueChange={(next) => onCategoryChange(next as ExpenseCategory)}
              disabled={busy}
            >
              <SelectTrigger id="budget-group" className="min-h-11 w-full sm:w-60 md:min-h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_GROUPS.map((group) => (
                  <SelectItem key={group} value={group}>
                    {EXPENSE_CATEGORY_LABEL[group]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {/* A new grupo starts a new form. */}
        <EditForm
          key={category}
          safra={safra}
          startMonth={startMonth}
          category={category}
          view={view}
          previous={previous}
          inputs={inputs}
          today={today}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** One line the form writes: the grupo's own (no accountId) or a conta's. */
interface Line {
  accountId?: string;
  label: string;
  /** It had rows of its own when the dialog opened. */
  had: boolean;
  start: LineFields;
}

interface EditFormProps
  extends Pick<BudgetEditDialogProps, "safra" | "startMonth" | "category" | "view" | "previous" | "inputs" | "today"> {
  onBusyChange(busy: boolean): void;
  onDone(): void;
}

function EditForm({ safra, startMonth, category, view, previous, inputs, today, onBusyChange, onDone }: EditFormProps) {
  const accounts = useHerdStore((s) => s.accounts);
  const saveBudgetLine = useHerdStore((s) => s.saveBudgetLine);
  const removeBudgetLine = useHerdStore((s) => s.removeBudgetLine);
  const { addToast } = useToast();
  const label = EXPENSE_CATEGORY_LABEL[category];
  const labels = safraMonths(safra, startMonth).map((month) => month.label);
  const group = view.groups.find((line) => line.category === category);
  const lineOf = (accountId: string) => group?.accounts.find((line) => line.accountId === accountId);
  // The grupo's contas, and an archived one that still holds a budget in this safra.
  const contas = accountsByGroup(accounts, true)[category].filter(
    (account) => account.archivedAt === undefined || lineOf(account.id)?.ownRows
  );

  const [lines] = useState<Line[]>(() => [
    { label, had: group?.ownRows === true, start: lineFields(group) },
    ...contas.map((account) => ({
      accountId: account.id,
      label: account.name,
      had: lineOf(account.id)?.ownRows === true,
      start: lineFields(lineOf(account.id)),
    })),
  ]);
  // By accountId; "" is the grupo's own line.
  const [fields, setFields] = useState<Record<string, LineFields>>(() =>
    Object.fromEntries(lines.map((line) => [line.accountId ?? "", line.start]))
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSavingState] = useState(false);
  const setSaving = (next: boolean) => {
    setSavingState(next);
    onBusyChange(next);
  };

  const fieldsOf = (accountId = "") => fields[accountId] ?? lineFields();
  const change = (accountId: string, next: (current: LineFields) => LineFields) => {
    setError(null);
    setFields((all) => ({ ...all, [accountId]: next(all[accountId] ?? lineFields()) }));
  };
  /** "Como a safra anterior": the previous safra's realizado of the line, by month. */
  const shapeOf = (accountId: string) => previousShape(inputs, lineKey(category, accountId), safra, startMonth, today);
  const groupShape = useMemo(
    () => previousShape(inputs, lineKey(category), safra, startMonth, today),
    [inputs, category, safra, startMonth, today]
  );
  const previousView = useMemo(
    () => budgetView({ ...inputs, budgets: previous ?? [] }, safra - 1, startMonth, today),
    [inputs, previous, safra, startMonth, today]
  );

  const own = fieldsOf();
  const total = parseAmount(own.total);
  const previousShort = safraLabel(safra - 1, startMonth).replace("Safra ", "");
  const preview: Record<BudgetDistribution, string> = {
    equal:
      Number.isFinite(total) && total >= 0
        ? `${formatCurrency(distribute(total, "equal")[0])} por mês`
        : "o total dividido por 12",
    previous: groupShape.every((value) => value === 0)
      ? `sem gasto em ${previousShort}: fica igual`
      : `segue o gasto de ${previousShort}`,
    manual: "você digita cada mês",
  };
  const before = previousView.groups.find((line) => line.category === category);
  const typedContas = contas
    .map((account) => ({ name: account.name, total: parseAmount(fieldsOf(account.id).total) }))
    .filter((conta) => Number.isFinite(conta.total) && conta.total > 0);
  const hint =
    `${safraLabel(safra - 1, startMonth)}: ` +
    (previous === undefined ? "" : before?.hasBudget ? `orçado ${reais(before.budgetedTotal)} · ` : "sem orçamento · ") +
    `realizado ${reais(before?.realizedToDate ?? 0)}.` +
    (typedContas.length > 0
      ? ` As contas do grupo (${typedContas.map((conta) => conta.name).join(", ")}) somam ${reais(
          cents(typedContas.reduce((sum, conta) => sum + conta.total, 0))
        )}.`
      : "");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const writes: { line: Line; check: LineCheck }[] = [];
    for (const line of lines) {
      const current = fieldsOf(line.accountId);
      if (JSON.stringify(current) === JSON.stringify(line.start)) continue;
      const check = checkLine(current, labels);
      if (check.state === "invalid" || check.state === "off") {
        setError(`${line.label} · ${check.state === "off" ? "A soma dos meses não confere com o total." : check.message}`);
        return;
      }
      writes.push({ line, check });
    }
    setError(null);
    if (writes.length === 0) {
      onDone();
      return;
    }
    setSaving(true);
    try {
      for (const { line, check } of writes) {
        const key = { safra, category, accountId: line.accountId };
        if (check.state === "ok") {
          await saveBudgetLine({ ...key, months: check.months, distribution: fieldsOf(line.accountId).distribution });
        } else if (line.had) {
          // A line cleared to blank had a budget: it goes.
          await removeBudgetLine(key);
        }
      }
    } catch {
      setSaving(false); // the store already toasted
      return;
    }
    setSaving(false);
    addToast({ messageType: "success", text: `Orçamento de ${label} salvo` });
    onDone();
  }

  /** The grupo's own line only: its contas keep theirs. */
  async function onRemove() {
    setSaving(true);
    try {
      await removeBudgetLine({ safra, category });
    } catch {
      setSaving(false); // the store already toasted
      return;
    }
    setSaving(false);
    addToast({ messageType: "success", text: `Orçamento de ${label} removido` });
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-[240px_minmax(0,1fr)] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="budget-total">Total do grupo (R$)</Label>
          <Input
            id="budget-total"
            inputMode="decimal"
            placeholder="0,00"
            value={own.total}
            onChange={(e) => change("", (current) => withTotal(current, e.target.value, groupShape))}
            className="h-11 font-mono text-lg md:text-lg"
          />
        </div>
        <p className="text-[13px] leading-[18px] text-ink-soft sm:pb-1">{hint}</p>
      </div>

      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">Distribuir por mês</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {DISTRIBUTIONS.map(({ value, label: name }) => {
            const on = own.distribution === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5",
                  on ? "border-brand bg-brand-soft shadow-[0_0_0_1px_var(--color-brand)]" : "border-hairline"
                )}
              >
                <input
                  type="radio"
                  name="budget-distribution"
                  value={value}
                  checked={on}
                  onChange={() => change("", (current) => withDistribution(current, value, groupShape))}
                  className="mt-0.5 size-4 shrink-0 accent-brand"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{name}</span>
                  <span className="block text-xs text-ink-soft">{preview[value]}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium text-ink">Meses da safra</p>
          <p className="text-xs text-ink-soft">mudar um mês passa a distribuição para Manual</p>
        </div>
        <MonthsGrid
          id="budget-month"
          labels={labels}
          fields={own}
          onMonth={(index, text) => change("", (current) => withMonth(current, index, text))}
        />
      </div>

      <CheckLine check={checkLine(own, labels)} blank="Sem total, o orçado do grupo é a soma das contas." />

      <details className="group rounded-lg border border-hairline">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 md:min-h-10 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-medium text-ink">
            Contas <span className="font-normal text-ink-soft">· opcional, cada conta com seu total</span>
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 border-t border-hairline p-3">
          {contas.length === 0 ? (
            <p className="text-xs text-ink-soft">O grupo não tem contas no plano de contas.</p>
          ) : (
            contas.map((account) => {
              const conta = fieldsOf(account.id);
              return (
                <div key={account.id} className="grid gap-2.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_15rem]">
                    <Label htmlFor={`budget-conta-${account.id}`} className="block truncate font-normal">
                      {account.name}
                    </Label>
                    <Input
                      id={`budget-conta-${account.id}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={conta.total}
                      onChange={(e) =>
                        change(account.id, (current) => withTotal(current, e.target.value, shapeOf(account.id)))
                      }
                      className="min-h-11 text-right font-mono md:min-h-8"
                    />
                    <div
                      role="radiogroup"
                      aria-label={`Distribuição de ${account.name}`}
                      className="col-span-2 flex gap-0.5 rounded-lg border border-hairline bg-surface p-0.5 sm:col-span-1"
                    >
                      {DISTRIBUTIONS.map(({ value, short }) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={conta.distribution === value}
                          onClick={() =>
                            change(account.id, (current) => withDistribution(current, value, shapeOf(account.id)))
                          }
                          className={segment(conta.distribution === value)}
                        >
                          {short}
                        </button>
                      ))}
                    </div>
                  </div>
                  {conta.distribution === "manual" ? (
                    <>
                      <MonthsGrid
                        id={`budget-conta-${account.id}-month`}
                        name={account.name}
                        labels={labels}
                        fields={conta}
                        onMonth={(index, text) => change(account.id, (current) => withMonth(current, index, text))}
                      />
                      <CheckLine check={checkLine(conta, labels)} blank="Sem orçamento para a conta." />
                    </>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </details>

      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        {lines[0].had ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 text-overdue hover:text-overdue sm:mr-auto md:min-h-8"
            disabled={saving}
            onClick={() => void onRemove()}
          >
            <Trash2 aria-hidden />
            Remover orçamento do grupo
          </Button>
        ) : null}
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11 md:min-h-8" disabled={saving}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11 md:min-h-8" disabled={saving}>
          Salvar orçamento
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Meses da safra": twelve inputs labelled "out/25"… with a little bar each; 3 columns on the phone, 6 from sm up. */
function MonthsGrid({
  id,
  name,
  labels,
  fields,
  onMonth,
}: {
  id: string;
  /** A conta's months carry its name in their accessible name. */
  name?: string;
  labels: string[];
  fields: LineFields;
  onMonth(index: number, text: string): void;
}) {
  const values = fields.months.map((text) => {
    const value = parseAmount(text);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
  const max = Math.max(...values);
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-2.5 sm:grid-cols-6">
      {labels.map((label, i) => (
        <div key={label} className="grid min-w-0 gap-1.5">
          <label htmlFor={`${id}-${i}`} className="text-xs font-medium text-ink-soft">
            {label}
          </label>
          <Input
            id={`${id}-${i}`}
            aria-label={name ? `${name}, ${label}` : undefined}
            inputMode="decimal"
            placeholder="0,00"
            value={fields.months[i]}
            onChange={(e) => onMonth(i, e.target.value)}
            className="min-h-11 px-2 text-right font-mono text-[13px] md:h-9 md:min-h-9 md:text-[13px]"
          />
          <span aria-hidden className="h-[3px] overflow-hidden rounded-full bg-surface">
            <span className="block h-full bg-brand opacity-60" style={{ width: `${max > 0 ? (values[i] / max) * 100 : 0}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** "Soma dos meses confere com o total", or how far off the months are. */
function CheckLine({ check, blank }: { check: LineCheck; blank: string }) {
  return (
    <div aria-live="polite">
      {check.state === "blank" ? (
        <p className="text-xs text-ink-soft">{blank}</p>
      ) : check.state === "ok" ? (
        <p className="flex items-center justify-between gap-3 rounded-lg bg-healthy-soft px-3 py-2.5 text-sm text-healthy">
          <span className="flex items-center gap-2">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            Soma dos meses confere com o total
          </span>
          <span className="font-mono font-medium">{formatCurrency(check.total)}</span>
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-overdue-soft px-3 py-2.5 text-sm text-overdue">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {check.state === "invalid"
            ? check.message
            : check.sum > check.total
              ? `Os meses somam ${formatCurrency(check.sum)} · passam ${formatCurrency(check.sum - check.total)} do total`
              : `Os meses somam ${formatCurrency(check.sum)} · faltam ${formatCurrency(check.total - check.sum)} para o total`}
        </p>
      )}
    </div>
  );
}
