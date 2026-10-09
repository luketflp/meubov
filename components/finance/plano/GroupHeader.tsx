"use client";

/**
 * The header of a grupo on the Plano de contas, any tipo: its name (with the
 * tipo on a grupo outside the resultado), Renomear (inline, like a conta),
 * Arquivar (confirmed, naming what leaves the forms and what stays), Excluir
 * while no lançamento was ever made in it (confirmed; the server still refuses
 * one a recorrência keeps) and "+ Conta".
 */
import { useState, type KeyboardEvent } from "react";
import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import type { Account, Expense, ExpenseCategory, GroupKind, PlanGroup } from "@/lib/types";
import { ENTRY_KIND_LABEL, isCapitalKind } from "@/lib/domain/entries";
import { GROUP_NAME_MAX } from "@/lib/domain/groups";
import { formatNumber } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Lançamentos ever made in a grupo: carrying it as their grupo, or one of its contas. */
export function groupEntryCount(
  key: ExpenseCategory,
  expenses: readonly Expense[],
  accounts: readonly Account[]
): number {
  const contas = new Set(accounts.filter((a) => a.group === key).map((a) => a.id));
  return expenses.filter((e) => e.category === key || (e.accountId !== undefined && contas.has(e.accountId)))
    .length;
}

/**
 * What "Arquivar <nome>?" says: the contas that leave the forms, the
 * lançamentos that stay. Only a grupo de despesa has an Orçamento and a custo.
 */
export function archiveGroupText(kind: GroupKind, contas: number, entries: number): string {
  const leaving =
    contas === 0
      ? "O grupo sai"
      : contas === 1
        ? "O grupo e a conta dele saem"
        : `O grupo e as ${formatNumber(contas)} contas dele saem`;
  if (kind !== "expense") {
    const kept =
      entries === 0
        ? ""
        : entries === 1
          ? " O lançamento continua em Lançamentos e nos relatórios."
          : ` Os ${formatNumber(entries)} lançamentos continuam em Lançamentos e nos relatórios.`;
    return `${leaving} do formulário de lançamento.${kept}`;
  }
  const staying =
    entries === 0
      ? ""
      : entries === 1
        ? " O lançamento continua no Painel, em Lançamentos e no custo do mês em que foi feito."
        : ` Os ${formatNumber(entries)} lançamentos continuam no Painel, em Lançamentos e no custo dos meses em que foram feitos.`;
  return `${leaving} do formulário de lançamento e do Orçamento da próxima safra.${staying}`;
}

function AddAccountButton({ onClick }: { onClick(): void }) {
  return (
    <Button variant="ghost" size="sm" className="min-h-11 md:min-h-0" onClick={onClick}>
      <Plus data-icon="inline-start" aria-hidden />
      Conta
    </Button>
  );
}

export function GroupHeader({
  group,
  contas,
  entries,
  onAdd,
}: {
  /** Not archived. */
  group: PlanGroup;
  /** Its contas that are not archived. */
  contas: number;
  /** Lançamentos ever made in it (groupEntryCount). */
  entries: number;
  /** "+ Conta" in this grupo; absent for a reader, who gets no buttons. */
  onAdd?: () => void;
}) {
  const updatePlanGroup = useHerdStore((s) => s.updatePlanGroup);
  const removePlanGroup = useHerdStore((s) => s.removePlanGroup);
  const { addToast } = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  /** Which confirmation; kept while it closes so the title does not flip. */
  const [action, setAction] = useState<"archive" | "delete">("archive");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  function confirm(next: "archive" | "delete") {
    setAction(next);
    setConfirming(true);
  }

  async function onRename() {
    if (draft === null) return;
    const clean = draft.trim();
    if (clean === "" || clean === group.name) {
      setDraft(null);
      return;
    }
    try {
      if (!(await updatePlanGroup(group.id, { name: clean }))) {
        addToast({ messageType: "error", text: "Já existe um grupo com esse nome" });
        return;
      }
    } catch {
      // apiFail already told the user; the name stays open to retry or Esc.
      return;
    }
    addToast({ messageType: "success", text: "Grupo renomeado" });
    setDraft(null);
  }

  async function onArchive() {
    setBusy(true);
    try {
      await updatePlanGroup(group.id, { archived: true });
      addToast({ messageType: "success", text: "Grupo arquivado" });
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      if ((await removePlanGroup(group.id)) === "in_use") {
        addToast({ messageType: "error", text: "Grupo com lançamentos não se apaga. Arquive em vez de excluir." });
        setConfirming(false);
        return;
      }
      addToast({ messageType: "success", text: "Grupo excluído" });
    } catch {
      // apiFail already told the user.
    } finally {
      setBusy(false);
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void onRename();
    if (e.key === "Escape") setDraft(null);
  };

  if (draft !== null) {
    return (
      <header className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          aria-label={`Novo nome de ${group.name}`}
          value={draft}
          maxLength={GROUP_NAME_MAX}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-11 min-w-40 flex-1 md:min-h-8"
        />
        <Button size="sm" className="min-h-11 md:min-h-0" onClick={() => void onRename()}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost" className="min-h-11 md:min-h-0" onClick={() => setDraft(null)}>
          Cancelar
        </Button>
      </header>
    );
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold break-words text-ink">{group.name}</h3>
        {isCapitalKind(group.kind) ? (
          <span className="inline-flex items-center rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-ink-soft">
            {ENTRY_KIND_LABEL[group.kind].toLowerCase()}
          </span>
        ) : null}
      </div>
      {onAdd ? (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="size-11 md:size-8"
            aria-label={`Renomear o grupo ${group.name}`}
            title="Renomear grupo"
            onClick={() => setDraft(group.name)}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-11 md:size-8"
            aria-label={`Arquivar o grupo ${group.name}`}
            title="Arquivar grupo"
            onClick={() => confirm("archive")}
          >
            <Archive aria-hidden />
          </Button>
          {entries === 0 ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-11 md:size-8"
              aria-label={`Excluir o grupo ${group.name}`}
              title="Excluir grupo"
              onClick={() => confirm("delete")}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
          <AddAccountButton onClick={onAdd} />
        </div>
      ) : null}
      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirming(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === "delete" ? "Excluir" : "Arquivar"} {group.name}?
            </DialogTitle>
            <DialogDescription>
              {action === "delete"
                ? "O grupo ainda não tem lançamentos. Ele sai do plano de contas e do orçamento, com as contas que tiver."
                : archiveGroupText(group.kind, contas, entries)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:min-h-9"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </Button>
            {action === "delete" ? (
              <Button
                type="button"
                variant="destructive"
                className="min-h-11 md:min-h-9"
                disabled={busy}
                onClick={() => void onRemove()}
              >
                {busy ? "Excluindo…" : "Excluir"}
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-11 md:min-h-9"
                disabled={busy}
                onClick={() => void onArchive()}
              >
                {busy ? "Arquivando…" : "Arquivar"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
