"use client";

/**
 * "Nova conta" / "Editar conta": a conta corrente, the farm's caixa or a
 * cartão. A cartão takes its fechamento and vencimento days and the conta
 * that pays it; the others take a saldo inicial on a date. Editing adds
 * Arquivar and Excluir (only a conta nothing points at).
 */
import { useState, type FormEvent } from "react";
import type { BankAccount, BankAccountKind } from "@/lib/types";
import { BANK_ACCOUNT_KIND_LABEL, bankAccountLabel } from "@/lib/domain/bankAccounts";
import { addDays, todayISO } from "@/lib/domain/dates";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { parseAmount } from "@/components/finance/parseAmount";
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

const KINDS: readonly BankAccountKind[] = ["checking", "cash", "card"];

/** Select value for "Nenhuma": Radix refuses "". */
const NONE = "none";

interface Fields {
  kind: BankAccountKind;
  name: string;
  label: string;
  /** A cartão types what was owed on it (positive); it is stored negative. */
  opening: string;
  openingDate: string;
  closingDay: string;
  dueDay: string;
  paysFromId: string;
  isMain: boolean;
}

function initialFields(account: BankAccount | undefined, first: boolean): Fields {
  return {
    kind: account?.kind ?? "checking",
    name: account?.name ?? "",
    label: account?.label ?? "",
    opening: account
      ? String(account.kind === "card" ? -account.openingBalanceBrl : account.openingBalanceBrl).replace(".", ",")
      : "",
    // End of yesterday: what the farm pays from today on counts in the saldo.
    openingDate: account?.openingDate ?? addDays(todayISO(), -1),
    closingDay: account?.closingDay ? String(account.closingDay) : "",
    dueDay: account?.dueDay ? String(account.dueDay) : "",
    paysFromId: account?.paysFromId ?? NONE,
    isMain: account?.isMain ?? first,
  };
}

/** A day of the month typed in a field, or null. */
function day(text: string): number | null {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

export function BankAccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  account?: BankAccount;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle>
          <DialogDescription>
            Onde o dinheiro da fazenda fica: conta no banco, caixa em dinheiro ou cartão de crédito.
          </DialogDescription>
        </DialogHeader>
        <BankAccountForm account={account} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function BankAccountForm({ account, onDone }: { account?: BankAccount; onDone(): void }) {
  const accounts = useHerdStore((s) => s.bankAccounts);
  const addBankAccount = useHerdStore((s) => s.addBankAccount);
  const updateBankAccount = useHerdStore((s) => s.updateBankAccount);
  const archiveBankAccount = useHerdStore((s) => s.archiveBankAccount);
  const removeBankAccount = useHerdStore((s) => s.removeBankAccount);
  const { addToast } = useToast();
  const first = !accounts.some((a) => a.kind !== "card");
  const [fields, setFields] = useState<Fields>(() => initialFields(account, first));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Fields>) => setFields((f) => ({ ...f, ...patch }));

  const card = fields.kind === "card";
  const payers = accounts.filter((a) => a.kind === "checking" && a.archivedAt === undefined && a.id !== account?.id);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch {
      // apiFail already toasted
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = fields.name.trim();
    if (name === "") return setError("Informe o nome da conta.");
    const typed = fields.opening.trim() === "" ? 0 : parseAmount(fields.opening);
    if (!Number.isFinite(typed)) return setError("Informe o saldo inicial.");
    // What is owed on a cartão is its saldo, negative.
    const opening = card ? -Math.abs(typed) : typed;
    if (fields.openingDate === "") return setError("Informe a data do saldo inicial.");
    const closingDay = day(fields.closingDay);
    const dueDay = day(fields.dueDay);
    if (card && (closingDay === null || dueDay === null)) {
      return setError("Informe os dias de fechamento e de vencimento (1 a 31).");
    }
    setError(null);
    const common = {
      name,
      openingBalanceBrl: opening,
      openingDate: fields.openingDate || addDays(todayISO(), -1),
      ...(card ? { closingDay: closingDay!, dueDay: dueDay! } : {}),
      ...(!card && fields.isMain ? { isMain: true } : {}),
    };
    await run(async () => {
      if (account) {
        await updateBankAccount(account.id, {
          ...common,
          label: fields.label.trim() || null,
          ...(card ? { paysFromId: fields.paysFromId === NONE ? null : fields.paysFromId } : {}),
        });
        addToast({ messageType: "success", text: "Conta salva" });
      } else {
        await addBankAccount({
          kind: fields.kind,
          ...common,
          label: fields.label.trim() || undefined,
          ...(card && fields.paysFromId !== NONE ? { paysFromId: fields.paysFromId } : {}),
        });
        addToast({ messageType: "success", text: `Conta "${name}" criada` });
      }
      onDone();
    });
  }

  async function onArchive() {
    if (!account) return;
    await run(async () => {
      const archived = account.archivedAt === undefined;
      if (await archiveBankAccount(account.id, archived)) {
        addToast({ messageType: "success", text: archived ? "Conta arquivada" : "Conta restaurada" });
        onDone();
      }
    });
  }

  async function onDelete() {
    if (!account) return;
    await run(async () => {
      const result = await removeBankAccount(account.id);
      if (result === "deleted") {
        addToast({ messageType: "success", text: "Conta excluída" });
        onDone();
      } else {
        setError(
          result === "in_use"
            ? "Essa conta já tem lançamentos, transferências ou extratos. Arquive em vez de excluir."
            : "Marque outra conta como principal antes de excluir esta."
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div role="radiogroup" aria-label="Tipo" className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5">
        {KINDS.map((kind) => {
          const selected = fields.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={account !== undefined && !selected}
              onClick={() => set({ kind, isMain: kind === "card" ? false : fields.isMain || first })}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] transition-colors disabled:opacity-50 md:min-h-8",
                selected
                  ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                  : "text-ink-soft hover:text-ink"
              )}
            >
              {BANK_ACCOUNT_KIND_LABEL[kind]}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="bank-name">Nome</Label>
          <Input
            id="bank-name"
            value={fields.name}
            placeholder={card ? "Cartão Sicredi" : fields.kind === "cash" ? "Caixa da fazenda" : "Sicredi"}
            onChange={(e) => set({ name: e.target.value })}
            className="min-h-11 md:min-h-0"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bank-label">Identificação</Label>
          <Input
            id="bank-label"
            value={fields.label}
            placeholder={card ? "final 4471" : "c/c 12.345-6"}
            onChange={(e) => set({ label: e.target.value })}
            className="min-h-11 md:min-h-0"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="bank-opening">Saldo inicial (R$)</Label>
          <Input
            id="bank-opening"
            inputMode="decimal"
            placeholder="0,00"
            value={fields.opening}
            onChange={(e) => set({ opening: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bank-opening-date">em</Label>
          <Input
            id="bank-opening-date"
            type="date"
            value={fields.openingDate}
            onChange={(e) => set({ openingDate: e.target.value })}
            className="min-h-11 font-mono md:min-h-0"
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-ink-soft">
        {card
          ? "Valor em aberto no cartão nessa data. O que foi comprado até ela já está nele."
          : "O saldo no fim desse dia. O que foi pago até ele já está no saldo inicial."}
        {account?.lastImportId ? " Mudar esta data não refaz extratos já importados." : null}
      </p>

      {card ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="bank-closing">Fechamento (dia)</Label>
              <Input
                id="bank-closing"
                inputMode="numeric"
                value={fields.closingDay}
                onChange={(e) => set({ closingDay: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bank-due">Vencimento (dia)</Label>
              <Input
                id="bank-due"
                inputMode="numeric"
                value={fields.dueDay}
                onChange={(e) => set({ dueDay: e.target.value })}
                className="min-h-11 font-mono md:min-h-0"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bank-pays-from">Paga pela conta</Label>
            <Select value={fields.paysFromId} onValueChange={(paysFromId) => set({ paysFromId })}>
              <SelectTrigger id="bank-pays-from" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhuma</SelectItem>
                {payers.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {bankAccountLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : (
        <>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink md:min-h-0">
            <input
              type="checkbox"
              checked={fields.isMain}
              disabled={account?.isMain || account?.archivedAt !== undefined}
              onChange={(e) => set({ isMain: e.target.checked })}
              className="size-4 shrink-0 accent-brand"
            />
            Conta principal
            <span className="text-xs text-ink-soft">· “Pago por” começa nela</span>
          </label>
        </>
      )}

      {error ? (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}

      <DialogFooter className="gap-2 sm:justify-between">
        {account ? (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="min-h-11 md:min-h-9" disabled={busy} onClick={onArchive}>
              {account.archivedAt === undefined ? "Arquivar" : "Restaurar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 text-overdue hover:text-overdue md:min-h-9"
              disabled={busy}
              onClick={onDelete}
            >
              Excluir
            </Button>
          </div>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit" className="min-h-11 md:min-h-9" disabled={busy}>
            {account ? "Salvar" : "Criar conta"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
