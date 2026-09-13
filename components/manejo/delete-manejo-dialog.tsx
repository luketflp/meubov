"use client";

/**
 * "Excluir manejo" / "Descartar manejo": one confirmation for every row of the
 * histórico. It spells the reversal out in the farmer's terms — how many
 * animals come back and where to — and, when the server refuses, lists the
 * animals standing in the way instead of the delete button. There is no undo:
 * registering the manejo again is the way back.
 *
 * An inseminação is held back by the diagnoses of its cows, which nothing else
 * can remove once the Ultrassom's toast is gone: each of those cows gets a
 * "Limpar diagnóstico" here, and with every one cleared the delete is offered
 * again.
 */
import { useState } from "react";
import { Eraser } from "lucide-react";
import type { ManejoSession } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { useHerdStore } from "@/lib/store/useHerdStore";
import type { BlockedAnimal, RevertBlockReason } from "@/lib/domain/manejoRevert";
import { ResultPill } from "@/components/animal/reproduction-pills";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
  has_diagnosis: (earTag) => `${earTag} já tem diagnóstico de prenhez.`,
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
    case "insemination":
      return n === 1
        ? "1 cobertura IATF é apagada e a dose volta ao estoque."
        : `${n} coberturas IATF são apagadas e as doses voltam ao estoque.`;
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

/** A diagnosed cow holding an inseminação back, with the cobertura to clear. */
type DiagnosisBlock = BlockedAnimal & { reason: "has_diagnosis"; breedingId: string };

/** A block the farmer can lift right here: a diagnosis, with the cobertura it sits on. */
function isDiagnosisBlock(animal: BlockedAnimal): animal is DiagnosisBlock {
  return animal.reason === "has_diagnosis" && animal.breedingId !== undefined;
}

interface DiagnosisBlockRowProps {
  block: DiagnosisBlock;
  /** Cleared from this dialog since the server refused. */
  cleared: boolean;
  onCleared: (breedingId: string) => void;
}

/**
 * One diagnosed cow: her result and "Limpar diagnóstico", then a muted
 * "Diagnóstico limpo" once the clear went through. The refusal, not the store,
 * says she is diagnosed — a result recorded on another device may not be in
 * the store, and the button is still there for it.
 */
function DiagnosisBlockRow({ block, cleared, onCleared }: DiagnosisBlockRowProps) {
  const result = useHerdStore(
    (s) =>
      s.animals
        .find((a) => a.earTag === block.earTag)
        ?.reproduction?.diagnoses.find((d) => d.breedingId === block.breedingId)?.result
  );
  const clearDiagnosis = useHerdStore((s) => s.clearDiagnosis);
  const [clearing, setClearing] = useState(false);

  async function clear() {
    setClearing(true);
    try {
      await clearDiagnosis(block.earTag, block.breedingId);
      onCleared(block.breedingId);
    } catch {
      // The store already told the farmer; the button stays to try again.
    } finally {
      setClearing(false);
    }
  }

  return (
    <li className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
      <span className={cn("font-mono font-medium", cleared ? "text-ink-soft" : "text-ink")}>
        {block.earTag}
      </span>
      {cleared ? (
        <span className="text-xs text-ink-soft">Diagnóstico limpo</span>
      ) : (
        <>
          {result !== undefined && result !== "pending" ? <ResultPill result={result} /> : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto min-h-11 text-brand hover:text-brand md:min-h-8"
            disabled={clearing}
            onClick={() => void clear()}
          >
            <Eraser data-icon="inline-start" aria-hidden />
            Limpar diagnóstico
          </Button>
        </>
      )}
    </li>
  );
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
  /** Coberturas whose diagnosis was cleared from here since the last refusal. */
  const [clearedIds, setClearedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  function change(next: boolean) {
    if (saving) return;
    if (!next) {
      setBlocked(null);
      setClearedIds(new Set());
      setError(null);
    }
    onOpenChange(next);
  }

  function markCleared(breedingId: string) {
    setClearedIds((ids) => new Set(ids).add(breedingId));
  }

  async function confirm() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      if (target.kind === "session") {
        const refused = await deleteManejoSession(target.session.id);
        if (refused) {
          // A fresh refusal says what still stands in the way.
          setBlocked(refused);
          setClearedIds(new Set());
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
  // An inseminação is not held by a newer manejo but by the ultrassom on its cows.
  const diagnosed = target.kind === "session" && target.session.kind === "insemination";
  const diagnosisBlocks = (blocked ?? []).filter(isDiagnosisBlock);
  const otherBlocks = (blocked ?? []).filter((animal) => !isDiagnosisBlock(animal));
  // With every diagnosis in the way cleared, the delete is offered again; the
  // cows stay listed, cleared, above it.
  const unblocked =
    otherBlocks.length === 0 &&
    diagnosisBlocks.length > 0 &&
    diagnosisBlocks.every((block) => clearedIds.has(block.breedingId));
  const diagnosisList =
    diagnosisBlocks.length > 0 ? (
      <ul className="space-y-1 text-sm">
        {diagnosisBlocks.map((block) => (
          <DiagnosisBlockRow
            key={block.breedingId}
            block={block}
            cleared={clearedIds.has(block.breedingId)}
            onCleared={markCleared}
          />
        ))}
      </ul>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        {blocked && !unblocked ? (
          <>
            <DialogHeader>
              <DialogTitle>Não dá para excluir este manejo</DialogTitle>
              <DialogDescription>
                {diagnosed
                  ? "Excluir as coberturas apagaria o diagnóstico destas vacas."
                  : "Um manejo mais recente depende dos animais deste aqui."}
              </DialogDescription>
            </DialogHeader>
            {diagnosisList ? (
              <>
                {diagnosisList}
                <p className="text-sm text-ink-soft">
                  Limpe o diagnóstico destas vacas para excluir a inseminação.
                </p>
              </>
            ) : null}
            {otherBlocks.length > 0 ? (
              <>
                <ul className="space-y-1 text-sm text-ink">
                  {otherBlocks.map((animal) => (
                    <li key={animal.earTag}>{BLOCK_REASON[animal.reason](animal.earTag)}</li>
                  ))}
                </ul>
                <p className="text-sm text-ink-soft">
                  {diagnosed
                    ? "Desfaça o diagnóstico no Ultrassom antes."
                    : "Exclua o manejo mais recente primeiro."}
                </p>
              </>
            ) : null}
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
            {unblocked ? diagnosisList : null}
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
