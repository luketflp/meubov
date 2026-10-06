"use client";

/**
 * "Novo lançamento": a despesa, a receita or money that stays out of the
 * resultado (investimento, financiamento, sócios), with vencimento, pagamento
 * and the conta bancária it was paid by ("Pago por"), conta do plano, pago
 * para, documento, lote (centro de custo), Repetir (uma vez, parcelado,
 * recorrente) and anexos. A capital kind needs a conta of its grupo and a
 * Movimento (Compra / Venda do bem, Pagamento / Liberação, Retirada / Aporte)
 * and takes no grupo or lote; the words about paying follow the direction.
 * The Grupo picker lists the seven of the system, then the farm's under "da
 * fazenda"; an archived grupo shows only while the lançamento sits in it.
 * `initial` starts it on the nó picked in Lançamentos; `template` fills it
 * from a lançamento (Duplicar: today, pending, no anexos, no repetition).
 * With `fromLine` it is "Criar lançamento" of the conciliação: the linha do
 * extrato fixes the kind (despesa or receita), the value and the payment (on
 * its date, by its conta) and the lançamento is saved paired with it. With
 * `expense` it edits that lançamento: the type switch and Repetir are hidden,
 * a row of a série says which ("Parcela 2/3", "Recorrente · todo dia 20") and
 * saving asks where the change applies. A rendimento opens the YieldDialog
 * instead. Vendas and compras de gado come from the manejos, never from here.
 */
import { useState, type FormEvent } from "react";
import { Info, Repeat } from "lucide-react";
import { useHerdStore, type ExpensePatch } from "@/lib/store/useHerdStore";
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type {
  AccountGroup,
  CapitalGroup,
  EntryFlow,
  EntryKind,
  Expense,
  ExpenseCategory,
  SeriesScope,
  StatementLine,
} from "@/lib/types";
import type { Resolved } from "@/lib/api/domains/statements/useCases/ResolveLine.useCase";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
import { CAPITAL_GROUPS, ENTRY_KIND_LABEL, FLOW_LABEL, isCapitalKind, isInflow } from "@/lib/domain/entries";
import type { EntryInitial } from "@/lib/domain/planTree";
import { todayISO } from "@/lib/domain/dates";
import { despesaGroups } from "@/lib/domain/groups";
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS, installmentLabel, recurrenceLabel } from "@/lib/domain/series";
import { cn } from "@/lib/utils";
import { parseAmount } from "@/components/finance/parseAmount";
import {
  NONE,
  entryValues,
  initialFields,
  withKind,
  type EntryFields,
  type EntrySource,
} from "@/components/finance/entryFields";
import {
  RepeatSection,
  initialRepeat,
  repeatFromFields,
  type RepeatFields,
} from "@/components/finance/RepeatSection";
import { SeriesScopeDialog } from "@/components/finance/SeriesScopeDialog";
import { YieldDialog } from "@/components/finance/YieldDialog";
import { AttachmentsField, type PendingFile } from "@/components/finance/attachments/AttachmentsField";
import { PaidByField, paidByOptions } from "@/components/finance/contas/PaidByField";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** The type switch: despesa, receita, then the three kinds outside the resultado. */
const KINDS: readonly EntryKind[] = ["expense", "revenue", ...CAPITAL_GROUPS];

/** Movimento, the saída first. */
const FLOWS: readonly EntryFlow[] = ["out", "in"];

/** The line under the type switch of a kind outside the resultado. */
const CAPITAL_NOTICE: Record<CapitalGroup, string> = {
  investment:
    "Investimento é capital: fica fora do custo (COE) e do resultado do período. Sai do caixa quando é pago.",
  financing:
    "Financiamento é dívida: fica fora do custo (COE) e do resultado do período. A liberação aumenta o saldo devedor; cada pagamento o baixa.",
  partners:
    "Sócios é dinheiro dos donos: fica fora do custo (COE) e do resultado do período. A retirada sai do caixa; o aporte entra.",
};

/** Toast after one lançamento was created; parcelas and recorrências say so instead. */
const CREATED_TOAST: Record<EntryKind, string> = {
  expense: "Despesa lançada",
  revenue: "Receita lançada",
  investment: "Investimento lançado",
  financing: "Financiamento lançado",
  partners: "Lançamento de sócios salvo",
  yield: "Rendimento lançado",
};

/** One segment of the type and Movimento switches. */
function segmentClass(selected: boolean, className: string) {
  return cn(
    "flex min-h-11 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors md:min-h-8",
    selected ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]" : "text-ink-soft hover:text-ink",
    className
  );
}

/** Whether "Parcelas" holds a count the server takes (2–48). */
function countInRange(typed: string): boolean {
  const count = Number(typed);
  return Number.isInteger(count) && count >= MIN_INSTALLMENTS && count <= MAX_INSTALLMENTS;
}

export function EntryDialog({
  open,
  onOpenChange,
  expense,
  defaultKind = "expense",
  fromLine,
  onResolved,
  initial,
  template,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  expense?: Expense;
  defaultKind?: EntryKind;
  /** "Criar lançamento" from a linha do extrato. */
  fromLine?: StatementLine;
  /** After the lançamento was created and paired with `fromLine`. */
  onResolved?(resolved: Resolved): void;
  /** "Novo" on a picked nó: kind, movimento, grupo, conta and conta bancária start from it. */
  initial?: EntryInitial;
  /** Duplicar: a new lançamento filled from this one. */
  template?: Expense;
}) {
  // While saving (and uploading) the dialog stays: Esc, outside click and Cancelar wait.
  const [busy, setBusy] = useState(false);
  // A rendimento has its own small form, on the aplicação of whichever started it.
  const rendimento = [expense, template, initial].find((source) => source?.kind === "yield");
  if (rendimento) {
    return (
      <YieldDialog
        open={open}
        onOpenChange={onOpenChange}
        bankAccountId={rendimento.bankAccountId ?? ""}
        expense={expense?.kind === "yield" ? expense : undefined}
      />
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar lançamento" : fromLine ? "Criar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            {fromLine
              ? "Preenchido pela linha do banco · confira a conta do plano."
              : initial?.kind || initial?.bankAccountId
                ? "Começa na conta escolhida no plano de contas. Vendas e compras de gado entram sozinhas pelos manejos."
                : "Despesas, receitas, investimentos, financiamentos e sócios. Vendas e compras de gado entram sozinhas pelos manejos."}
          </DialogDescription>
        </DialogHeader>
        <EntryForm
          source={{ expense, template, initial, fromLine, defaultKind }}
          onResolved={onResolved}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  source,
  onResolved,
  onBusyChange,
  onDone,
}: {
  source: EntrySource;
  onResolved?(resolved: Resolved): void;
  onBusyChange(busy: boolean): void;
  onDone(): void;
}) {
  const { expense, fromLine } = source;
  const accounts = useHerdStore((s) => s.accounts);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const bankAccounts = useHerdStore((s) => s.bankAccounts);
  const expenses = useHerdStore((s) => s.expenses);
  const lots = useHerdStore((s) => s.lots);
  const animals = useHerdStore((s) => s.animals);
  const addExpense = useHerdStore((s) => s.addExpense);
  const updateExpense = useHerdStore((s) => s.updateExpense);
  const addAccount = useHerdStore((s) => s.addAccount);
  const uploadAttachment = useHerdStore((s) => s.uploadAttachment);
  const resolveStatementLine = useHerdStore((s) => s.resolveStatementLine);
  const { addToast } = useToast();
  /** The linha do extrato fixes the kind, the value and the payment. */
  const fixed = fromLine !== undefined;

  const [fields, setFields] = useState<EntryFields>(() => initialFields(source, bankAccounts, todayISO(), expenseGroups));
  const [repeatFields, setRepeatFields] = useState<RepeatFields>(() => initialRepeat(todayISO()));
  const [pending, setPending] = useState<PendingFile[]>([]);
  /** The edit waiting for "Só esta" · "Esta e as próximas" · "Todas". */
  const [scopePatch, setScopePatch] = useState<ExpensePatch | null>(null);
  const [newAccountName, setNewAccountName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSavingState] = useState(false);
  const setSaving = (next: boolean) => {
    setSavingState(next);
    onBusyChange(next);
  };
  const [creatingAccount, setCreatingAccount] = useState(false);

  const set = (patch: Partial<EntryFields>) => setFields((f) => ({ ...f, ...patch }));

  /** Investimento, financiamento or sócios: conta required, Movimento, no grupo or lote. */
  const capitalKind = isCapitalKind(fields.kind) ? fields.kind : null;
  const inflow = isInflow(fields);
  const group: AccountGroup = capitalKind ?? (fields.kind === "revenue" ? "revenue" : fields.category);
  // A farm grupo without contas has no entry in accountsByGroup.
  const groupAccounts = accountsByGroup(accounts)[group] ?? [];
  // Only the row being edited keeps its archived grupo, whatever the farmer picks meanwhile.
  const groupOptions = despesaGroups(expenseGroups, { keep: source.expense?.category });
  const farmGroups = groupOptions.filter((g) => g.custom);
  const currentAccount = accounts.find((a) => a.id === fields.accountId);
  const accountOptions =
    currentAccount && currentAccount.group === group && !groupAccounts.some((a) => a.id === currentAccount.id)
      ? [...groupAccounts, currentAccount]
      : groupAccounts;

  const heads = activeAnimals(animals);
  const lotOptions = [
    ...activeLots(lots),
    ...lots.filter((lot) => lot.deletedAt != null && lot.id === fields.lotId),
  ];
  const suggestions = counterpartySuggestions(expenses);

  const repeating = !expense && !fixed && repeatFields.choice !== "once";
  const seriesLine = expense
    ? installmentLabel(expense)
      ? `Parcela ${installmentLabel(expense)}`
      : recurrenceLabel(expense)
        ? `Recorrente · ${recurrenceLabel(expense)}`
        : null
    : null;

  function onDateChange(date: string) {
    setFields((f) => ({ ...f, date, dueDate: f.dueTouched ? f.dueDate : date }));
    // The first parcela never falls before Data; the day follows Data until Repetir is chosen.
    if (date === "") return;
    setRepeatFields((r) => ({
      ...r,
      firstDue: r.firstDue < date ? date : r.firstDue,
      day: r.choice === "once" ? String(Number(date.slice(8, 10))) : r.day,
    }));
  }

  async function saveEdit(target: Expense, patch: ExpensePatch, scope: SeriesScope) {
    setSaving(true);
    try {
      await updateExpense(target.id, patch, scope);
      addToast({ messageType: "success", text: "Lançamento salvo" });
    } catch {
      setSaving(false); // apiFail already toasted
      return;
    }
    setSaving(false);
    onDone();
  }

  /**
   * Uploads the files chosen before the lançamento existed, one at a time, with
   * progress; answers how many failed.
   */
  async function uploadPending(expenseId: string): Promise<number> {
    let failed = 0;
    for (const item of pending) {
      const patch = (next: Partial<PendingFile>) =>
        setPending((files) => files.map((f) => (f.key === item.key ? { ...f, ...next } : f)));
      try {
        patch({ progress: 0 });
        await uploadAttachment(expenseId, item.file, (progress) => patch({ progress }));
        patch({ progress: 100 });
      } catch {
        patch({ progress: null, error: "não enviado" }); // the store already toasted
        failed += 1;
      }
    }
    return failed;
  }

  async function onCreateAccount() {
    const name = (newAccountName ?? "").trim();
    if (name === "" || creatingAccount) return;
    setCreatingAccount(true);
    let created;
    try {
      // A financiamento created here has no saldo inicial: Configurações › Plano de contas sets it.
      created = await addAccount({ group, name });
    } catch {
      return; // apiFail already toasted
    } finally {
      setCreatingAccount(false);
    }
    if (!created) {
      addToast({ messageType: "error", text: "Já existe uma conta com esse nome" });
      return;
    }
    set({ accountId: created.id });
    setNewAccountName(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = entryValues(fields, repeating);
    if (typeof values === "string") {
      setError(values);
      return;
    }
    const repeat = expense || fixed ? null : repeatFromFields(repeatFields, fields.date);
    if (typeof repeat === "string") {
      setError(repeat);
      return;
    }
    setError(null);

    if (expense) {
      // Every field, null clearing; a capital row also sends its Movimento.
      const patch: ExpensePatch = values;
      // A row of a série asks where the change applies before saving.
      if (expense.seriesId) setScopePatch(patch);
      else await saveEdit(expense, patch, "one");
      return;
    }

    if (fromLine) {
      setSaving(true);
      const resolved = await resolveStatementLine(fromLine, {
        type: "create",
        entry: {
          date: values.date,
          category: values.category,
          amountBrl: values.amountBrl,
          dueDate: values.dueDate,
          history: values.history ?? undefined,
          counterparty: values.counterparty ?? undefined,
          document: values.document ?? undefined,
          accountId: values.accountId ?? undefined,
          lotId: values.lotId ?? undefined,
          notes: values.notes ?? undefined,
        },
      }).catch(() => null); // apiFail already toasted
      if (!resolved?.expense) {
        setSaving(false);
        return;
      }
      const failed = pending.length > 0 ? await uploadPending(resolved.expense.id) : 0;
      addToast(
        failed > 0
          ? { messageType: "warning", text: `Lançamento conciliado; ${failed} anexo(s) não enviado(s) — anexe em Editar.` }
          : { messageType: "success", text: "Lançamento criado e conciliado" }
      );
      setSaving(false);
      onResolved?.(resolved);
      onDone();
      return;
    }

    setSaving(true);
    let created: Expense[];
    try {
      created = await addExpense(
        {
          kind: fields.kind,
          flow: values.flow,
          date: values.date,
          category: values.category,
          amountBrl: values.amountBrl,
          dueDate: values.dueDate,
          paidAt: values.paidAt ?? undefined,
          history: values.history ?? undefined,
          counterparty: values.counterparty ?? undefined,
          document: values.document ?? undefined,
          accountId: values.accountId ?? undefined,
          bankAccountId: values.bankAccountId ?? undefined,
          lotId: values.lotId ?? undefined,
          notes: values.notes ?? undefined,
        },
        repeat ?? undefined
      );
    } catch {
      setSaving(false); // apiFail already toasted
      return;
    }
    // The NF or recibo belongs to the purchase: the first parcela or ocorrência carries it.
    const failed = created.length > 0 && pending.length > 0 ? await uploadPending(created[0].id) : 0;
    if (failed > 0) {
      addToast({
        messageType: "warning",
        text: `Lançamento salvo; ${failed} anexo(s) não enviado(s) — anexe em Editar.`,
      });
    } else {
      const text =
        created.length > 1
          ? repeatFields.choice === "recurring"
            ? "Recorrência lançada"
            : "Parcelas lançadas"
          : CREATED_TOAST[fields.kind];
      addToast({ messageType: "success", text });
    }
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {expense || fixed ? null : (
        // Five segments: on the phone the row scrolls sideways instead of wrapping.
        <div
          role="radiogroup"
          aria-label="Tipo de lançamento"
          className="flex items-center gap-0.5 overflow-x-auto rounded-lg border border-hairline bg-surface p-0.5"
        >
          {KINDS.map((kind) => {
            const selected = fields.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setFields((f) => withKind(f, kind, f.flow, bankAccounts));
                  setNewAccountName(null);
                }}
                className={segmentClass(selected, "shrink-0 grow")}
              >
                {ENTRY_KIND_LABEL[kind]}
              </button>
            );
          })}
        </div>
      )}

      {capitalKind ? (
        <p className="flex items-start gap-2.5 rounded-lg bg-scheduled-soft px-3 py-2.5 text-[13px] leading-[18px] text-scheduled">
          <Info className="mt-px size-4 shrink-0" aria-hidden />
          {CAPITAL_NOTICE[capitalKind]}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="entry-date">Data</Label>
          <Input
            id="entry-date"
            type="date"
            value={fields.date}
            onChange={(e) => onDateChange(e.target.value)}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="entry-amount">
            {repeatFields.choice === "installments" && !expense ? "Valor total (R$)" : "Valor (R$)"}
          </Label>
          <Input
            id="entry-amount"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={fields.amount}
            readOnly={fixed}
            onChange={(e) => set({ amount: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>

        {capitalKind ? null : (
          <div className="grid gap-1.5">
            {fields.kind === "revenue" ? (
              <>
                <span className="text-sm leading-none font-medium">Grupo</span>
                <p className="flex min-h-11 items-center rounded-lg border border-input bg-surface px-2.5 text-sm text-ink-soft">
                  Receitas
                </p>
              </>
            ) : (
              <>
                <Label htmlFor="entry-category">Grupo</Label>
                <Select
                  value={fields.category}
                  onValueChange={(category) => {
                    set({ category: category as ExpenseCategory, accountId: NONE });
                    setNewAccountName(null);
                  }}
                >
                  <SelectTrigger id="entry-category" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groupOptions
                      .filter((g) => !g.custom)
                      .map((g) => (
                        <SelectItem key={g.key} value={g.key}>
                          {g.label}
                        </SelectItem>
                      ))}
                    {farmGroups.length > 0 ? (
                      <>
                        <SelectSeparator />
                        <SelectGroup className="p-0">
                          <SelectLabel className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
                            da fazenda
                          </SelectLabel>
                          {farmGroups.map((g) => (
                            <SelectItem key={g.key} value={g.key}>
                              {g.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </>
                    ) : null}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="entry-account">Conta do plano</Label>
          {newAccountName === null ? (
            <>
              {/* A capital kind has no "Sem conta": "" shows the placeholder until one is picked. */}
              <Select
                value={capitalKind && fields.accountId === NONE ? "" : fields.accountId}
                onValueChange={(accountId) => set({ accountId })}
              >
                <SelectTrigger id="entry-account" className="min-h-11 w-full" aria-required={capitalKind ? true : undefined}>
                  <SelectValue placeholder="Escolha a conta" />
                </SelectTrigger>
                <SelectContent>
                  {capitalKind ? null : <SelectItem value={NONE}>Sem conta</SelectItem>}
                  {accountOptions.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => setNewAccountName("")}
                className="inline-flex min-h-11 items-center self-start text-xs font-medium text-brand hover:underline md:min-h-0"
              >
                + nova conta
              </button>
            </>
          ) : (
            <div className="flex gap-2">
              <Input
                id="entry-account"
                autoFocus
                value={newAccountName}
                placeholder="Nome da conta"
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onCreateAccount();
                  }
                }}
                className="min-h-11"
              />
              <Button
                type="button"
                className="min-h-11"
                disabled={creatingAccount}
                onClick={() => void onCreateAccount()}
              >
                Criar
              </Button>
            </div>
          )}
        </div>
        {capitalKind ? (
          <div className="grid content-start gap-1.5">
            <span id="entry-flow" className="text-sm leading-none font-medium">
              Movimento
            </span>
            <div
              role="radiogroup"
              aria-labelledby="entry-flow"
              className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
            >
              {FLOWS.map((flow) => {
                const selected = fields.flow === flow;
                return (
                  <button
                    key={flow}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setFields((f) => withKind(f, f.kind, flow, bankAccounts))}
                    className={segmentClass(selected, "flex-1")}
                  >
                    {FLOW_LABEL[capitalKind][flow]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <Label htmlFor="entry-due">Vencimento</Label>
          <Input
            id="entry-due"
            type="date"
            value={repeating ? "" : fields.dueDate}
            disabled={repeating}
            onChange={(e) => set({ dueDate: e.target.value, dueTouched: true })}
            className="min-h-11 font-mono md:min-h-0"
          />
          {repeating ? (
            <p className="text-xs text-ink-soft">
              {repeatFields.choice === "installments"
                ? "segue a 1ª parcela, abaixo"
                : "segue a recorrência, abaixo"}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm leading-none font-medium">{inflow ? "Recebimento" : "Pagamento"}</span>
          <div className="flex min-h-11 items-center gap-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={fields.paid}
                disabled={fixed}
                onChange={(e) => set({ paid: e.target.checked })}
                className="size-4 shrink-0 accent-brand"
              />
              {inflow ? "Já recebido" : "Já pago"}
              {fields.paid ? " em" : ""}
            </label>
            {fields.paid ? (
              <Input
                type="date"
                aria-label={inflow ? "Data do recebimento" : "Data do pagamento"}
                value={fields.paidAt}
                disabled={fixed}
                onChange={(e) => set({ paidAt: e.target.value })}
                className="min-h-11 min-w-0 flex-1 font-mono md:min-h-9"
              />
            ) : null}
          </div>
          {repeating ? (
            <p className="text-xs text-ink-soft">
              {repeatFields.choice === "installments" ? "só a 1ª parcela" : "só a 1ª conta"}
            </p>
          ) : null}
        </div>
        {fields.paid && paidByOptions(bankAccounts, fields.kind, fields.bankAccountId, fields.flow).length > 0 ? (
          <div className="sm:col-start-2">
            <PaidByField
              id="entry-paid-by"
              accounts={bankAccounts}
              kind={fields.kind}
              flow={fields.flow}
              value={fields.bankAccountId}
              disabled={fixed}
              onChange={(bankAccountId) => set({ bankAccountId })}
            />
          </div>
        ) : null}
      </div>

      {fixed ? null : expense ? (
        seriesLine ? (
          <p className="flex items-center gap-1.5 border-t border-hairline pt-4 text-sm text-ink">
            <Repeat className="size-4 text-ink-soft" aria-hidden />
            {seriesLine}
          </p>
        ) : null
      ) : (
        <RepeatSection
          fields={repeatFields}
          onChange={(patch) =>
            setRepeatFields((r) => ({
              ...r,
              ...patch,
              // Parcelado picks up a Vencimento the user already set.
              ...(patch.choice === "installments" && r.choice !== "installments" && fields.dueTouched && fields.dueDate
                ? { firstDue: fields.dueDate }
                : {}),
            }))
          }
          date={fields.date}
          amount={parseAmount(fields.amount)}
        />
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="entry-history">Histórico</Label>
        <Input
          id="entry-history"
          value={fields.history}
          maxLength={200}
          placeholder="Ex.: Trator MF 4275"
          onChange={(e) => set({ history: e.target.value })}
          className="min-h-11"
        />
        <p className="text-xs text-ink-soft">o que foi: aparece em primeiro na lista</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Without Lote, Pago para and Documento share the row. */}
        <div className={cn("grid gap-1.5", capitalKind ? null : "sm:col-span-2")}>
          <Label htmlFor="entry-counterparty">{inflow ? "Recebido de" : "Pago para"}</Label>
          <Input
            id="entry-counterparty"
            list="entry-counterparty-list"
            value={fields.counterparty}
            onChange={(e) => set({ counterparty: e.target.value })}
            className="min-h-11"
          />
          <datalist id="entry-counterparty-list">
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {suggestions.length > 0 ? (
            <p className="text-xs text-ink-soft">sugestões dos lançamentos anteriores</p>
          ) : null}
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="entry-document">Documento</Label>
          <Input
            id="entry-document"
            value={fields.document}
            placeholder="NF 4.812"
            onChange={(e) => set({ document: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
        {capitalKind ? null : (
          <div className="grid gap-1.5">
            <Label htmlFor="entry-lot">Lote (centro de custo)</Label>
            <Select value={fields.lotId} onValueChange={(lotId) => set({ lotId })}>
              <SelectTrigger id="entry-lot" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Fazenda toda (rateio por cabeça)</SelectItem>
                {lotOptions.map((lot) => (
                  <SelectItem key={lot.id} value={lot.id}>
                    {lot.name} · {heads.filter((a) => a.lotId === lot.id).length} cab
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-ink-soft">Sem lote = fazenda toda, rateado por cabeça</p>
          </div>
        )}
      </div>

      <AttachmentsField
        expenseId={expense?.id}
        pending={pending}
        onPendingChange={setPending}
        busy={saving}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="entry-notes">Observação</Label>
        <Textarea
          id="entry-notes"
          value={fields.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Ex.: reforço de aftosa, 2ª dose"
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11" disabled={saving}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11" disabled={saving}>
          {expense
            ? "Salvar"
            : fixed
              ? "Salvar e conciliar"
              : repeatFields.choice === "installments"
                ? `Lançar ${countInRange(repeatFields.count) ? `${repeatFields.count} ` : ""}parcelas`
                : repeatFields.choice === "recurring"
                  ? "Lançar recorrência"
                  : "Lançar"}
        </Button>
      </DialogFooter>

      {expense && scopePatch ? (
        <SeriesScopeDialog
          open
          onOpenChange={(open) => {
            if (!open) setScopePatch(null);
          }}
          expense={expense}
          action="edit"
          amountChange={
            scopePatch.amountBrl !== undefined && scopePatch.amountBrl !== expense.amountBrl
              ? { from: expense.amountBrl, to: scopePatch.amountBrl }
              : null
          }
          busy={saving}
          onConfirm={(scope) => void saveEdit(expense, scopePatch, scope)}
        />
      ) : null}
    </form>
  );
}
