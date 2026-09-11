"use client";

/**
 * "Excluir manejo" / "Descartar manejo": one confirmation for every row of the
 * histórico. It spells the reversal out in the farmer's terms — how many
 * animals come back and where to — and, when the server refuses, lists the
 * animals standing in the way instead of the delete button. There is no undo:
 * registering the manejo again is the way back.
 */
import { useState } from "react";
import type { ManejoSession } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import type { BlockedAnimal, RevertBlockReason } from "@/lib/domain/manejoRevert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** What the dialog is about to delete: a session, or a row with none behind it. */
export type DeleteTarget =
  | { kind: "session"; session: ManejoSession }
  | { kind: "treatments"; treatmentId: string; name: string; headCount: number }
  | { kind: "weighings"; date: string; earTags: string[] };

interface DeleteManejoDialogProps {
  target: DeleteTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the server accepted the deletion. */
  onDeleted?: () => void;
}

/** One line per animal that refuses to be reverted. */
const BLOCK_REASON: Record<RevertBlockReason, (earTag: string) => string> = {
  moved_lot: (earTag) => `${earTag} está em outro lote desde este manejo.`,
  not_sold: (earTag) => `${earTag} voltou ao rebanho ativo depois deste manejo.`,
  has_history: (earTag) => `${earTag} já tem histórico registrado depois da entrada.`,
  origin_lot_gone: (earTag) => `${earTag} veio de um lote que foi excluído.`,
};

/** How many animals the delete actually puts back. */
function headCount(target: DeleteTarget): number {
  if (target.kind === "treatments") return target.headCount;
  if (target.kind === "weighings") return target.earTags.length;
  return target.session.animals.filter((a) => a.outcome === "done").length;
}

/** What the farmer gets back, in their own terms. */
function consequence(target: DeleteTarget): string {
  const n = headCount(target);
  const heads = n === 1 ? "1 animal" : `${n} animais`;
  if (target.kind === "treatments") return `As aplicações de ${heads} saem do histórico.`;
  if (target.kind === "weighings") return `As pesagens de ${heads} saem do histórico.`;
  switch (target.session.kind) {
    case "sale":
      return `${heads} ${n === 1 ? "volta" : "voltam"} ao rebanho ativo.`;
    case "transfer":
      return `${heads} ${n === 1 ? "volta" : "voltam"} para o lote de origem.`;
    case "entry":
      return `${heads} ${n === 1 ? "deixa" : "deixam"} de existir no rebanho.`;
    case "weighing":
      return `As pesagens de ${heads} saem do histórico.`;
    default:
      return `As aplicações de ${heads} saem do histórico.`;
  }
}

/** A venda also takes its money out of the financeiro. */
function moneyLine(target: DeleteTarget): string | null {
  if (target.kind !== "session" || target.session.kind !== "sale") return null;
  const total =
    target.session.totalAmountBrl ??
    target.session.animals.reduce((sum, a) => sum + (a.amountBrl ?? 0), 0);
  return total > 0 ? `O valor de ${formatCurrency(total)} sai do financeiro.` : null;
}

function title(target: DeleteTarget): string {
  if (target.kind === "treatments") return `Excluir ${target.name} do histórico?`;
  if (target.kind === "weighings") return `Excluir a pesagem de ${formatDate(target.date)}?`;
  const { session } = target;
  return session.status === "open"
    ? `Descartar o manejo de ${formatDate(session.date)}?`
    : `Excluir ${session.name.toLowerCase()} de ${formatDate(session.date)}?`;
}

function confirmLabel(target: DeleteTarget): string {
  return target.kind === "session" && target.session.status === "open"
    ? "Descartar manejo"
    : "Excluir manejo";
}

export function DeleteManejoDialog({
  target,
  open,
  onOpenChange,
  onDeleted,
}: DeleteManejoDialogProps) {
  const deleteManejoSession = useHerdStore((s) => s.deleteManejoSession);
  const deleteTreatment = useHerdStore((s) => s.deleteTreatment);
  const deleteWeighingGroup = useHerdStore((s) => s.deleteWeighingGroup);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState<BlockedAnimal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function change(next: boolean) {
    if (saving) return;
    if (!next) {
      setBlocked(null);
      setError(null);
    }
    onOpenChange(next);
  }

  async function confirm() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      if (target.kind === "session") {
        const refused = await deleteManejoSession(target.session.id);
        if (refused) {
          setBlocked(refused);
          return;
        }
      } else if (target.kind === "treatments") {
        await deleteTreatment(target.treatmentId, "batch");
      } else {
        await deleteWeighingGroup(target.date, target.earTags);
      }
      onOpenChange(false);
      onDeleted?.();
    } catch {
      setError("Não foi possível excluir agora. Tente de novo em instantes.");
    } finally {
      setSaving(false);
    }
  }

  if (!target) return null;
  const money = moneyLine(target);

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        {blocked ? (
          <>
            <DialogHeader>
              <DialogTitle>Não dá para excluir este manejo</DialogTitle>
              <DialogDescription>
                Um manejo mais recente depende dos animais deste aqui.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-1 text-sm text-ink">
              {blocked.map((animal) => (
                <li key={animal.earTag}>{BLOCK_REASON[animal.reason](animal.earTag)}</li>
              ))}
            </ul>
            <p className="text-sm text-ink-soft">Exclua o manejo mais recente primeiro.</p>
            <DialogFooter>
              <Button type="button" className="min-h-11 md:min-h-9" onClick={() => change(false)}>
                Entendi
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{title(target)}</DialogTitle>
              <DialogDescription>{consequence(target)}</DialogDescription>
            </DialogHeader>
            {money ? <p className="text-sm text-ink-soft">{money}</p> : null}
            <p className="text-sm text-ink-soft">
              O manejo sai do histórico e não tem como desfazer — para voltar atrás, registre o
              manejo de novo.
            </p>
            {error ? <p className="text-sm text-overdue">{error}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 md:min-h-9"
                disabled={saving}
                onClick={() => change(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="min-h-11 md:min-h-9"
                disabled={saving}
                onClick={confirm}
              >
                {saving ? "Excluindo…" : confirmLabel(target)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
