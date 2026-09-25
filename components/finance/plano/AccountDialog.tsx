"use client";

/** "Nova conta": a name inside one grupo, Receitas included. */
import { useState, type FormEvent } from "react";
import type { AccountGroup } from "@/lib/types";
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABEL } from "@/lib/domain/accounts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AccountDialog({
  open,
  onOpenChange,
  defaultGroup,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  defaultGroup: AccountGroup;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conta</DialogTitle>
          <DialogDescription>
            A conta detalha um grupo: &quot;Sal mineral&quot; em Nutrição, &quot;Aluguel de
            pasto&quot; em Receitas.
          </DialogDescription>
        </DialogHeader>
        <AccountForm defaultGroup={defaultGroup} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({ defaultGroup, onDone }: { defaultGroup: AccountGroup; onDone(): void }) {
  const addAccount = useHerdStore((s) => s.addAccount);
  const { addToast } = useToast();
  const [group, setGroup] = useState<AccountGroup>(defaultGroup);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim();
    if (clean === "") {
      setError("Informe o nome da conta.");
      return;
    }
    if (!(await addAccount({ group, name: clean }))) {
      setError("Já existe uma conta com esse nome");
      return;
    }
    addToast({ messageType: "success", text: `Conta "${clean}" criada` });
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="account-group">Grupo</Label>
        <Select value={group} onValueChange={(value) => setGroup(value as AccountGroup)}>
          <SelectTrigger id="account-group" className="min-h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_GROUPS.map((g) => (
              <SelectItem key={g} value={g}>
                {ACCOUNT_GROUP_LABEL[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="account-name">Nome</Label>
        <Input
          id="account-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Sal mineral"
          className="min-h-11"
        />
      </div>
      {error ? <p className="text-xs text-overdue">{error}</p> : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="min-h-11">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" className="min-h-11">
          Criar conta
        </Button>
      </DialogFooter>
    </form>
  );
}
