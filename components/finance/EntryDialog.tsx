"use client";

/**
 * "Novo lançamento": a despesa, a receita or money that stays out of the
 * resultado (investimento, financiamento, sócios), with vencimento, pagamento
 * and the conta bancária it was paid by ("Pago por"), conta do plano, pago
 * para, documento, lote (centro de custo), Repetir (uma vez, parcelado,
 * recorrente) and anexos. Every kind sits in a grupo of its tipo; a capital
 * kind needs a conta of that grupo and a Movimento (Compra / Venda do bem,
 * Pagamento / Liberação, Retirada / Aporte) and takes no lote, and the words
 * about paying follow the direction. The Grupo picker lists the tipo's grupos
 * by name; an archived one shows only while the lançamento sits in it.
 * `initial` starts it on the nó picked in Lançamentos; `template` fills it
 * from a lançamento (Duplicar: today, pending, no anexos, no repetition).
 * With `fromLine` it is "Criar lançamento" of the conciliação: the linha do
 * extrato fixes the kind (despesa or receita), the value and the payment (on
 * its date, by its conta) and the lançamento is saved paired with it. With
 * `expense` it edits that lançamento: the type switch and Repetir are hidden,
 * a row of a série says which ("Parcela 2/3", "Recorrente · todo dia 20") and
 * saving asks where the change applies. A rendimento opens the YieldDialog
 * instead. Vendas and compras de gado come from the manejos, never from here.
 * The form is three columns, O quê · Pagamento · Detalhes, side by side from
 * lg so it fits a 1366×768 notebook without scrolling, with a line at the foot
 * saying what will be lançado; below lg they stack and only they scroll, and
 * on the phone the dialog takes the whole screen.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { CircleCheck, Clock, Info, Paperclip, Receipt, Repeat, Wallet, X, type LucideIcon } from "lucide-react";
import { useHerdStore, type ExpensePatch } from "@/lib/store/useHerdStore";
import { activeAnimals, activeLots } from "@/lib/store/selectors";
import { useToast } from "@/components/providers/Toasts";
import type { CapitalGroup, EntryFlow, EntryKind, Expense, SeriesScope, StatementLine } from "@/lib/types";
import type { Resolved } from "@/lib/api/domains/statements/useCases/ResolveLine.useCase";
import { accountsByGroup, counterpartySuggestions } from "@/lib/domain/accounts";
import { CAPITAL_GROUPS, ENTRY_KIND_LABEL, FLOW_LABEL, isCapitalKind, isInflow } from "@/lib/domain/entries";
import type { EntryInitial } from "@/lib/domain/planTree";
import { todayISO } from "@/lib/domain/dates";
import { groupsOf } from "@/lib/domain/groups";
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS, installmentLabel, recurrenceLabel } from "@/lib/domain/series";
import { cn } from "@/lib/utils";
import { parseAmount } from "@/components/finance/parseAmount";
import {
  NONE,
  entrySummary,
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
import { PaidByField } from "@/components/finance/contas/PaidByField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

/** A column of the form: three side by side from lg, stacked below. */
const COLUMN = "grid min-w-0 content-start gap-2.5 px-5 py-3.5";

/** The label of a field that is no <Label>: a switch, a fixed value. */
const FIELD_LABEL = "text-xs leading-4 font-medium text-ink-soft";

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
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-[1040px] max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0"
      >
        <EntryForm
          title={expense ? "Editar lançamento" : fromLine ? "Criar lançamento" : "Novo lançamento"}
          description={
            fromLine
              ? "Preenchido pela linha do banco · confira a conta do plano."
              : initial?.kind || initial?.bankAccountId
                ? "Começa na conta escolhida no plano de contas. Vendas e compras de gado entram sozinhas pelos manejos."
                : "Vendas e compras de gado entram sozinhas pelos manejos."
          }
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
  title,
  description,
  source,
  onResolved,
  onBusyChange,
  onDone,
}: {
  title: string;
  /** Under the title; a kind outside the resultado says why instead. */
  description: string;
  source: EntrySource;
  onResolved?(resolved: Resolved): void;
  onBusyChange(busy: boolean): void;
  onDone(): void;
}) {
  const { expense, fromLine } = source;
  const accounts = useHerdStore((s) => s.accounts);
  const planGroups = useHerdStore((s) => s.planGroups);
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

  const [fields, setFields] = useState<EntryFields>(() => initialFields(source, bankAccounts, todayISO(), planGroups));
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

  /** Investimento, financiamento or sócios: conta required, Movimento, no lote. */
  const capitalKind = isCapitalKind(fields.kind) ? fields.kind : null;
  const inflow = isInflow(fields);
  // A grupo without contas has no entry in accountsByGroup.
  const groupAccounts = accountsByGroup(accounts)[fields.category] ?? [];
  // Only the row being edited keeps its archived grupo, whatever the farmer picks meanwhile. The dialog never
  // holds a rendimento, so the tipo is a grupo's.
  const groupOptions =
    fields.kind === "yield" ? [] : groupsOf(planGroups, fields.kind, { keep: source.expense?.category });
  const currentAccount = accounts.find((a) => a.id === fields.accountId);
  const accountOptions =
    currentAccount && currentAccount.group === fields.category && !groupAccounts.some((a) => a.id === currentAccount.id)
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
      created = await addAccount({ group: fields.category, name });
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

  const today = todayISO();
  // Repetir as chosen (null for Uma vez, and while editing or conciliating), for the line at the foot.
  const rule = expense || fixed || fields.date === "" ? null : repeatFromFields(repeatFields, fields.date);
  const summary =
    typeof rule === "string"
      ? null
      : entrySummary(
          fields,
          rule,
          {
            group: groupOptions.find((g) => g.id === fields.category)?.name,
            account: currentAccount?.name,
            bank: bankAccounts.find((a) => a.id === fields.bankAccountId)?.name,
          },
          today
        );
  const SummaryIcon = rule ? Repeat : fields.paid ? CircleCheck : Clock;

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="relative gap-3 border-b border-hairline px-5 pt-4 pb-3.5 lg:flex-row lg:items-center lg:gap-5">
        <div className="grid min-w-0 flex-1 gap-1 pr-10">
          <DialogTitle className="text-lg leading-[22px] font-semibold">{title}</DialogTitle>
          {capitalKind ? (
            <DialogDescription className="flex items-start gap-1.5 text-xs leading-4 text-scheduled">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              {CAPITAL_NOTICE[capitalKind]}
            </DialogDescription>
          ) : (
            <DialogDescription className="text-xs leading-4">{description}</DialogDescription>
          )}
        </div>
        {expense || fixed ? null : (
          // Five segments: on the phone the row scrolls sideways instead of wrapping.
          <div
            role="radiogroup"
            aria-label="Tipo de lançamento"
            className="flex items-center gap-0.5 overflow-x-auto rounded-lg border border-hairline bg-surface p-0.5 lg:mr-10 lg:shrink-0"
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
                  setFields((f) => withKind(f, kind, f.flow, bankAccounts, planGroups));
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
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fechar"
            disabled={saving}
            className="absolute top-3 right-3 max-md:top-1.5 max-md:right-1.5 max-md:size-11 lg:top-1/2 lg:-translate-y-1/2"
          >
            <X aria-hidden />
          </Button>
        </DialogClose>
      </DialogHeader>

      {/* The columns' labels (Repetir's and Pago por's too) read small and soft. */}
      <div className="grid min-h-0 flex-1 divide-y divide-hairline overflow-y-auto **:data-[slot=label]:text-xs **:data-[slot=label]:leading-4 **:data-[slot=label]:text-ink-soft lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <section aria-labelledby="entry-what" className={COLUMN}>
          <ColumnTitle id="entry-what" icon={Receipt} note={capitalKind ? "fora do custo (COE)" : undefined}>
            O quê
          </ColumnTitle>
          <div className="grid gap-1.5">
            <Label htmlFor="entry-amount">
              {repeatFields.choice === "installments" && !expense ? "Valor total" : "Valor"}
              <span className="sr-only"> (R$)</span>
            </Label>
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[15px] font-medium text-ink-soft"
              >
                R$
              </span>
              <Input
                id="entry-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={fields.amount}
                readOnly={fixed}
                onChange={(e) => set({ amount: e.target.value })}
                className="h-12 pl-11 font-mono text-[22px] font-medium md:h-[46px] md:text-[22px]"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <span className="flex items-baseline justify-between gap-2">
              <Label htmlFor="entry-history">Histórico</Label>
              <span className="text-[11px] text-ink-soft">o que foi · aparece primeiro na lista</span>
            </span>
            <Input
              id="entry-history"
              value={fields.history}
              maxLength={200}
              placeholder="Ex.: Trator MF 4275"
              onChange={(e) => set({ history: e.target.value })}
              className="min-h-11 md:min-h-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="entry-date">Data</Label>
              <Input
                id="entry-date"
                type="date"
                value={fields.date}
                onChange={(e) => onDateChange(e.target.value)}
                className="min-h-11 font-mono md:min-h-9"
              />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="entry-due">Vencimento</Label>
              {repeating ? (
                <Input
                  key="follows"
                  id="entry-due"
                  disabled
                  placeholder={repeatFields.choice === "installments" ? "segue a 1ª parcela" : "segue a recorrência"}
                  className="min-h-11 md:min-h-9"
                />
              ) : (
                <Input
                  id="entry-due"
                  type="date"
                  value={fields.dueDate}
                  onChange={(e) => set({ dueDate: e.target.value, dueTouched: true })}
                  className="min-h-11 font-mono md:min-h-9"
                />
              )}
            </div>
          </div>
          {/* A capital kind's Movimento takes a row of its own: there Grupo and Conta share one, so the column
              keeps the five rows that fit the notebook. */}
          <div className={capitalKind ? "grid grid-cols-2 gap-3" : "contents"}>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="entry-category">Grupo</Label>
              <Select
                value={fields.category}
                disabled={groupOptions.length === 0}
                onValueChange={(category) => {
                  // On a tipo change the value moves before the new options render: Radix's hidden native
                  // select then reports "" once. That is not a pick.
                  if (category === "") return;
                  set({ category, accountId: NONE });
                  setNewAccountName(null);
                }}
              >
                <SelectTrigger id="entry-category" className="min-h-11 w-full md:min-h-9">
                  <SelectValue
                    placeholder={groupOptions.length === 0 ? "Nenhum grupo — crie um no Plano de contas" : "Escolha o grupo"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {groupOptions.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid content-start gap-1.5">
              <span className="flex items-center justify-between gap-2">
                <Label htmlFor="entry-account">{capitalKind ? "Conta" : "Conta do plano"}</Label>
                {newAccountName === null && fields.category !== "" ? (
                  <button
                    type="button"
                    onClick={() => setNewAccountName("")}
                    className="-my-3.5 inline-flex min-h-11 items-center text-xs font-medium whitespace-nowrap text-brand hover:underline md:my-0 md:min-h-0"
                  >
                    + nova conta
                  </button>
                ) : null}
              </span>
              {newAccountName === null ? (
                <>
                  {/* A capital kind has no "Sem conta": "" shows the placeholder until one is picked. */}
                  <Select
                    value={capitalKind && fields.accountId === NONE ? "" : fields.accountId}
                    onValueChange={(accountId) => set({ accountId })}
                  >
                    <SelectTrigger
                      id="entry-account"
                      className="min-h-11 w-full md:min-h-9"
                      aria-required={capitalKind ? true : undefined}
                    >
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
                    className="min-h-11 min-w-0 md:min-h-9"
                  />
                  <Button
                    type="button"
                    className="min-h-11 md:min-h-9"
                    disabled={creatingAccount}
                    onClick={() => void onCreateAccount()}
                  >
                    Criar
                  </Button>
                </div>
              )}
            </div>
          </div>
          {capitalKind ? (
            <div className="grid content-start gap-1.5">
              <span id="entry-flow" className={FIELD_LABEL}>
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
                      onClick={() => setFields((f) => withKind(f, f.kind, flow, bankAccounts, planGroups))}
                      className={segmentClass(selected, "flex-1")}
                    >
                      {FLOW_LABEL[capitalKind][flow]}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="entry-pay" className={COLUMN}>
          <ColumnTitle id="entry-pay" icon={Wallet}>
            {inflow ? "Recebimento" : "Pagamento"}
          </ColumnTitle>
          <div className="grid gap-1.5">
            <span className="flex items-baseline justify-between gap-2">
              <span id="entry-paid" className={FIELD_LABEL}>
                Situação
              </span>
              {repeating && fields.paid ? (
                <span className="text-[11px] text-ink-soft">
                  {repeatFields.choice === "installments" ? "só a 1ª parcela" : "só a 1ª conta"}
                </span>
              ) : null}
            </span>
            <div className="flex gap-2">
              <div
                role="radiogroup"
                aria-labelledby="entry-paid"
                className="flex min-w-0 flex-1 items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
              >
                {[false, true].map((paid) => (
                  <button
                    key={String(paid)}
                    type="button"
                    role="radio"
                    aria-checked={fields.paid === paid}
                    disabled={fixed}
                    onClick={() => set({ paid })}
                    className={segmentClass(fields.paid === paid, "flex-1 disabled:pointer-events-none disabled:opacity-60")}
                  >
                    {paid ? (inflow ? "Já recebido" : "Já pago") : inflow ? "A receber" : "A pagar"}
                  </button>
                ))}
              </div>
              {fields.paid ? (
                <Input
                  type="date"
                  aria-label={inflow ? "Data do recebimento" : "Data do pagamento"}
                  value={fields.paidAt}
                  disabled={fixed}
                  onChange={(e) => set({ paidAt: e.target.value })}
                  className="min-h-11 w-36 shrink-0 font-mono md:min-h-9"
                />
              ) : null}
            </div>
          </div>
          {fields.paid ? (
            <PaidByField
              id="entry-paid-by"
              accounts={bankAccounts}
              kind={fields.kind}
              flow={fields.flow}
              value={fields.bankAccountId}
              disabled={fixed}
              onChange={(bankAccountId) => set({ bankAccountId })}
            />
          ) : null}
          {fixed ? null : expense ? (
            seriesLine ? (
              <p className="flex items-center gap-1.5 text-sm text-ink">
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
        </section>

        <section aria-labelledby="entry-details" className={COLUMN}>
          <ColumnTitle id="entry-details" icon={Paperclip}>
            Detalhes
          </ColumnTitle>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="entry-counterparty">{inflow ? "Recebido de" : "Pago para"}</Label>
              <Input
                id="entry-counterparty"
                list="entry-counterparty-list"
                value={fields.counterparty}
                onChange={(e) => set({ counterparty: e.target.value })}
                className="min-h-11 md:min-h-9"
              />
              <datalist id="entry-counterparty-list">
                {suggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="entry-document">Documento</Label>
              <Input
                id="entry-document"
                value={fields.document}
                placeholder="NF 4.812"
                onChange={(e) => set({ document: e.target.value })}
                className="min-h-11 font-mono md:min-h-9"
              />
            </div>
          </div>
          {capitalKind ? null : (
            <div className="grid gap-1.5">
              <Label htmlFor="entry-lot">Lote (centro de custo)</Label>
              <Select value={fields.lotId} onValueChange={(lotId) => set({ lotId })}>
                <SelectTrigger id="entry-lot" className="min-h-11 w-full md:min-h-9">
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
            </div>
          )}
          <AttachmentsField expenseId={expense?.id} pending={pending} onPendingChange={setPending} busy={saving} />
          <div className="grid gap-1.5">
            <Label htmlFor="entry-notes">Observação</Label>
            <Textarea
              id="entry-notes"
              rows={2}
              value={fields.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Ex.: reforço de aftosa, 2ª dose"
              className="min-h-14"
            />
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-3 border-t border-hairline bg-muted/50 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-center">
        {error ? (
          <p role="alert" className="text-[13px] leading-[18px] text-overdue">
            {error}
          </p>
        ) : summary ? (
          <p className="flex min-w-0 items-start gap-2 text-[13px] leading-[18px] text-ink">
            <SummaryIcon
              className={cn(
                "mt-px size-4 shrink-0",
                fields.paid ? (inflow ? "text-healthy" : "text-fmd") : "text-ink-soft"
              )}
              aria-hidden
            />
            <span>
              {summary.lead} <strong className="font-mono font-semibold">{summary.value}</strong> {summary.rest}
            </span>
          </p>
        ) : null}
        <div className="flex gap-2 sm:ml-auto sm:shrink-0">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11 max-sm:hidden md:min-h-10" disabled={saving}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit" className="min-h-12 flex-1 sm:min-h-11 sm:flex-none md:min-h-10" disabled={saving}>
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
        </div>
      </div>

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

/** The heading of a column: an icon tile and the question it answers. */
function ColumnTitle({
  id,
  icon: Icon,
  note,
  children,
}: {
  id: string;
  icon: LucideIcon;
  note?: string;
  children: ReactNode;
}) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-[13px] leading-5 font-semibold text-ink">
      <span aria-hidden className="flex size-[22px] items-center justify-center rounded-[7px] bg-brand-soft text-brand">
        <Icon className="size-3.5" />
      </span>
      {children}
      {note ? <span className="ml-auto text-[11px] font-normal text-ink-soft">{note}</span> : null}
    </h3>
  );
}
