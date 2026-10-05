"use client";

/**
 * "+ Grupo" of the Despesas (COE) card: a grupo de despesa of the farm, by
 * name. It counts in the COE like the seven of the system; its contas come
 * after, from its own "+ Conta". A name taken by another grupo, or by one of
 * the system's, is refused (409).
 */
import { useState, type FormEvent } from "react";
import { GROUP_NAME_MAX } from "@/lib/domain/groups";
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

export function NewGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const addExpenseGroup = useHerdStore((s) => s.addExpenseGroup);
  const { addToast } = useToast();
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
      created = await addExpenseGroup(clean);
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
          <DialogTitle>Novo grupo de despesa</DialogTitle>
          <DialogDescription>
            Entra no custo (COE) como os grupos do sistema: aparece no Painel, no Orçamento, em Lançamentos e no
            formulário de lançamento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="new-group-name">Nome</Label>
            <Input
              id="new-group-name"
              value={name}
              maxLength={GROUP_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Máquinas e veículos"
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
