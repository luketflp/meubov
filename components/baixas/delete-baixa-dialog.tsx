"use client";

/**
 * "Excluir baixa": takes back a morte, perda or outra saída entered by mistake.
 * The animal returns to the active herd in the lot it left from, and a toast
 * can give the same baixa again. An animal whose lot was deleted since has
 * nowhere to return to, so the dialog says so instead of offering the delete.
 */
import { useState } from "react";
import { toast } from "sonner";
import type { Animal } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { INACTIVE_REASON_LABEL } from "@/lib/domain/labels";
import { ACTION_TOAST_MS, useHerdStore } from "@/lib/store/useHerdStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteBaixaDialogProps {
  animal: Animal | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteBaixaDialog({ animal, onOpenChange }: DeleteBaixaDialogProps) {
  const lots = useHerdStore((s) => s.lots);
  const reactivateAnimal = useHerdStore((s) => s.reactivateAnimal);
  const deactivateAnimal = useHerdStore((s) => s.deactivateAnimal);
  const [saving, setSaving] = useState(false);

  // The last animal stays on screen while the dialog closes.
  const [shown, setShown] = useState(animal);
  if (animal !== null && animal !== shown) setShown(animal);
  if (shown === null) return null;

  const lot = lots.find((l) => l.id === shown.lotId);
  const lotGone = lot === undefined || lot.deletedAt !== undefined;
  const reason = shown.inactiveReason ? INACTIVE_REASON_LABEL[shown.inactiveReason] : "Baixa";
  const when = shown.inactiveDate ? ` de ${formatDate(shown.inactiveDate)}` : "";

  async function confirm(target: Animal) {
    setSaving(true);
    try {
      await reactivateAnimal(target.earTag);
    } catch {
      return; // The store already showed the failure.
    } finally {
      setSaving(false);
    }
    onOpenChange(false);

    const { inactiveReason, inactiveDate, inactiveNotes } = target;
    const canRedo =
      inactiveReason !== undefined && inactiveReason !== "sale" && inactiveDate !== undefined;
    toast.success(`Baixa de ${target.earTag} excluída`, {
      duration: ACTION_TOAST_MS,
      action: canRedo
        ? {
            label: "Desfazer",
            onClick: () =>
              void deactivateAnimal(target.earTag, {
                reason: inactiveReason,
                date: inactiveDate,
                notes: inactiveNotes,
              }).catch(() => {
                // The store already showed the failure.
              }),
          }
        : undefined,
    });
  }

  return (
    <Dialog open={animal !== null} onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent>
        {lotGone ? (
          <>
            <DialogHeader>
              <DialogTitle>Não dá para excluir esta baixa</DialogTitle>
              <DialogDescription>
                {lot
                  ? `${shown.earTag} saiu do lote ${lot.name}, que foi excluído depois.`
                  : `O lote de ${shown.earTag} foi excluído.`}{" "}
                Sem lote, o animal não tem para onde voltar no rebanho.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" className="min-h-11 md:min-h-9" onClick={() => onOpenChange(false)}>
                Entendi
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Excluir a baixa de {shown.earTag}?</DialogTitle>
              <DialogDescription>
                {shown.earTag} volta ao rebanho ativo no lote {lot.name}.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-ink-soft">
              {reason}
              {when} sai do histórico do animal e da contagem do Painel.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 md:min-h-9"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="min-h-11 md:min-h-9"
                disabled={saving}
                onClick={() => void confirm(shown)}
              >
                {saving ? "Excluindo…" : "Excluir baixa"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
