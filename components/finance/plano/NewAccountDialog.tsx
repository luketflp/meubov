"use client";

/**
 * "Nova conta": where it sits in the plano — Banco ou caixa, Investimento,
 * Financiamento, Sócios, Despesa (with its grupo: one of the system's or the
 * farm's, archived ones left out) or Receita — then its name.
 * A financiamento may take the saldo devedor it had on a day. "Banco ou
 * caixa" hands over to the conta bancária form (BankAccountDialog), rendered
 * from here so callers need nothing else.
 */
import { useState, type FormEvent } from "react";
import { Banknote, HandCoins, Landmark, Receipt, Tractor, Users, type LucideIcon } from "lucide-react";
import type { AccountGroup, CapitalGroup, ExpenseCategory } from "@/lib/types";
import { despesaGroups } from "@/lib/domain/groups";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { parseAmount } from "@/components/finance/parseAmount";
import { BankAccountDialog } from "@/components/finance/contas/BankAccountDialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type AccountPlace = "bank" | CapitalGroup | "expense" | "revenue";

const PLACES: readonly { place: AccountPlace; label: string; hint: string; Icon: LucideIcon }[] = [
  { place: "bank", label: "Banco ou caixa", hint: "conta corrente, caixa, cartão, aplicação · tem saldo", Icon: Landmark },
  { place: "investment", label: "Investimento", hint: "benfeitorias, máquinas, equipamentos · fora do custo", Icon: Tractor },
  { place: "financing", label: "Financiamento", hint: "empréstimo, consórcio · tem saldo devedor", Icon: HandCoins },
  { place: "partners", label: "Sócios", hint: "retiradas, distribuição de lucro, aportes", Icon: Users },
  { place: "expense", label: "Despesa", hint: "entra no custo (COE), dentro de um grupo", Icon: Receipt },
  { place: "revenue", label: "Receita", hint: "aluguel de pasto, serviços, outras entradas", Icon: Banknote },
];

const NAME_PLACEHOLDER: Record<Exclude<AccountPlace, "bank">, string> = {
  investment: "Ex.: Máquinas e implementos",
  financing: "Ex.: Consórcio trator",
  partners: "Ex.: Distribuição de lucro",
  expense: "Ex.: Sal mineral",
  revenue: "Ex.: Aluguel de pasto",
};

/**
 * Saldo devedor inicial of a financiamento and its day, both or neither:
 * null when both are blank, else the values or the message that stops them.
 */
export function openingFromFields(
  amount: string,
  date: string
): { openingBalanceBrl: number; openingDate: string } | null | string {
  const typed = amount.trim();
  if (typed === "" && date === "") return null;
  if (typed === "" || date === "") return "Informe o saldo e a data, ou deixe os dois em branco.";
  const openingBalanceBrl = parseAmount(typed);
  if (!Number.isFinite(openingBalanceBrl) || openingBalanceBrl < 0) {
    return "Informe o saldo devedor inicial (zero ou mais).";
  }
  return { openingBalanceBrl, openingDate: date };
}

export function NewAccountDialog({
  open,
  onOpenChange,
  defaultPlace = "expense",
  defaultCategory = "nutrition",
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  defaultPlace?: AccountPlace;
  defaultCategory?: ExpenseCategory;
}) {
  /** "Banco ou caixa" was confirmed: the conta bancária form takes over. */
  const [bank, setBank] = useState(false);
  const close = () => {
    setBank(false);
    onOpenChange(false);
  };
  return (
    <>
      <Dialog
        open={open && !bank}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova conta</DialogTitle>
            <DialogDescription>A conta aparece na árvore de Lançamentos, com o extrato dela.</DialogDescription>
          </DialogHeader>
          <NewAccountForm
            defaultPlace={defaultPlace}
            defaultCategory={defaultCategory}
            onBank={() => setBank(true)}
            onDone={close}
          />
        </DialogContent>
      </Dialog>
      {open && bank ? (
        <BankAccountDialog
          open
          onOpenChange={(next) => {
            if (!next) close();
          }}
        />
      ) : null}
    </>
  );
}

function NewAccountForm({
  defaultPlace,
  defaultCategory,
  onBank,
  onDone,
}: {
  defaultPlace: AccountPlace;
  defaultCategory: ExpenseCategory;
  onBank(): void;
  onDone(): void;
}) {
  const addAccount = useHerdStore((s) => s.addAccount);
  const expenseGroups = useHerdStore((s) => s.expenseGroups);
  const { addToast } = useToast();
  const [place, setPlace] = useState<AccountPlace>(defaultPlace);
  const [category, setCategory] = useState<ExpenseCategory>(defaultCategory);
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (place === "bank") return onBank();
    const clean = name.trim();
    if (clean === "") return setError("Informe o nome da conta.");
    const start = place === "financing" ? openingFromFields(opening, openingDate) : null;
    if (typeof start === "string") return setError(start);
    const group: AccountGroup = place === "expense" ? category : place;
    setError(null);
    setBusy(true);
    let created;
    try {
      created = await addAccount({ group, name: clean, ...start });
    } catch {
      return; // apiFail already toasted
    } finally {
      setBusy(false);
    }
    if (!created) return setError("Já existe uma conta com esse nome");
    addToast({ messageType: "success", text: `Conta "${clean}" criada` });
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <span id="new-account-place" className="text-sm leading-none font-medium">
          Onde ela fica no plano
        </span>
        <div role="radiogroup" aria-labelledby="new-account-place" className="grid gap-2 sm:grid-cols-2">
          {PLACES.map(({ place: value, label, hint, Icon }) => {
            const selected = place === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setPlace(value);
                  setError(null);
                }}
                className={cn(
                  "flex min-h-11 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-brand bg-brand-soft shadow-[0_0_0_1px_var(--color-brand)]"
                    : "border-hairline bg-panel hover:bg-surface"
                )}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-brand" : "text-ink-soft")} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{label}</span>
                  <span className="block text-xs text-ink-soft">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {place === "bank" ? (
        <p className="text-xs text-ink-soft">Continue para escolher entre conta corrente, caixa, cartão e aplicação.</p>
      ) : (
        <>
          {place === "expense" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="new-account-group">Grupo</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as ExpenseCategory)}>
                <SelectTrigger id="new-account-group" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {despesaGroups(expenseGroups).map((g) => (
                    <SelectItem key={g.key} value={g.key}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="new-account-name">Nome</Label>
            <Input
              id="new-account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={NAME_PLACEHOLDER[place]}
              className="min-h-11 md:min-h-0"
            />
          </div>
          {place === "financing" ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="new-account-opening">Saldo devedor inicial (R$)</Label>
                  <Input
                    id="new-account-opening"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={opening}
                    onChange={(e) => setOpening(e.target.value)}
                    className="min-h-11 font-mono md:min-h-0"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="new-account-opening-date">Em</Label>
                  <Input
                    id="new-account-opening-date"
                    type="date"
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    className="min-h-11 font-mono md:min-h-0"
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-ink-soft">
                O que ainda faltava pagar nesse dia. Cada pagamento lançado depois baixa o saldo; cada liberação aumenta.
              </p>
            </>
          ) : null}
        </>
      )}

      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11" disabled={busy}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11" disabled={busy}>
          {place === "bank" ? "Continuar" : "Criar conta"}
        </Button>
      </DialogFooter>
    </form>
  );
}
