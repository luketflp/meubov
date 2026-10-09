"use client";

/**
 * "+ Grupo" of a Plano de contas card: a grupo of the farm, by name, under the
 * card's tipo, or under the tipo picked when the card holds several (Fora do
 * resultado: investimento, financiamento, sócios). Its contas come after, from
 * its own "+ Conta". A name any grupo of the farm already has is refused (409).
 */
import { useState, type FormEvent } from "react";
import type { GroupKind } from "@/lib/types";
import { ENTRY_KIND_LABEL } from "@/lib/domain/entries";
import { GROUP_NAME_MAX } from "@/lib/domain/groups";
import { cn } from "@/lib/utils";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
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

const OUTSIDE = "Fica fora do custo (COE) e do resultado: aparece em Lançamentos e no formulário de lançamento.";

/** Where a grupo of each tipo shows up. */
const DESCRIPTION: Record<GroupKind, string> = {
  revenue: "Entra no resultado: aparece em Lançamentos, nos relatórios e no formulário de lançamento.",
  expense: "Entra no custo (COE): aparece no Painel, no Orçamento, em Lançamentos e no formulário de lançamento.",
  investment: OUTSIDE,
  financing: OUTSIDE,
  partners: OUTSIDE,
};

const PLACEHOLDER: Record<GroupKind, string> = {
  revenue: "Ex.: Serviços",
  expense: "Ex.: Máquinas e veículos",
  investment: "Ex.: Benfeitorias",
  financing: "Ex.: Pronaf",
  partners: "Ex.: Aportes",
};

export function NewGroupDialog({
  kinds,
  open,
  onOpenChange,
}: {
  /** The tipos offered: one is fixed, several are picked with a switch. */
  kinds: readonly GroupKind[];
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const addPlanGroup = useHerdStore((s) => s.addPlanGroup);
  const { addToast } = useToast();
  const [kind, setKind] = useState<GroupKind>(kinds[0]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setName("");
    setError(null);
    onOpenChange(false);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim();
    if (clean === "") return setError("Informe o nome do grupo.");
    setError(null);
    setBusy(true);
    let created;
    try {
      created = await addPlanGroup(kind, clean);
    } catch {
      return; // apiFail already toasted
    } finally {
      setBusy(false);
    }
    if (!created) {
      addToast({ messageType: "error", text: "Já existe um grupo com esse nome" });
      return;
    }
    addToast({ messageType: "success", text: `Grupo "${clean}" criado` });
    close();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kinds.length === 1 ? `Novo grupo de ${ENTRY_KIND_LABEL[kind].toLowerCase()}` : "Novo grupo fora do resultado"}
          </DialogTitle>
          <DialogDescription>{DESCRIPTION[kind]}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {kinds.length > 1 ? (
            <div className="grid gap-1.5">
              <span id="new-group-kind" className="text-sm leading-none font-medium">
                Tipo
              </span>
              <div
                role="radiogroup"
                aria-labelledby="new-group-kind"
                className="flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5"
              >
                {kinds.map((value) => {
                  const selected = kind === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setKind(value)}
                      className={cn(
                        "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] whitespace-nowrap transition-colors md:min-h-8",
                        selected
                          ? "bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]"
                          : "text-ink-soft hover:text-ink"
                      )}
                    >
                      {ENTRY_KIND_LABEL[value]}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="new-group-name">Nome</Label>
            <Input
              id="new-group-name"
              value={name}
              maxLength={GROUP_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder={PLACEHOLDER[kind]}
              className="min-h-11 md:min-h-0"
            />
            <p className="text-xs text-ink-soft">Depois crie as contas dele com + Conta.</p>
          </div>
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
              Criar grupo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
