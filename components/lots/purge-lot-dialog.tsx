"use client";

/**
 * "Excluir lote e animais": for a lote entered by mistake. Its live animals go
 * for good with everything recorded on them, and so do the manejos only they
 * fill; the farmer types the lote's name to confirm. The ••• menu wraps its
 * dialogs in a div that cancels clicks, so the confirm is a plain button, never
 * a form submit. The store is read inside the content only, while it is open.
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Lot } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { confirmsFarmName } from "@/lib/domain/farms";
import { sessionHasMoney } from "@/lib/domain/moneyRedaction";
import { lotPurge } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const OPEN_MANEJO =
  "Há um manejo em aberto com este lote ou com animais dele. Encerre ou descarte o manejo antes.";

const headsLabel = (heads: number) => (heads === 1 ? "1 animal" : `${heads} animais`);

interface PurgeLotDialogProps {
  lot: Lot;
  /** "none" leaves the opening to the parent (the card's ••• menu). */
  trigger?: "button" | "none";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called after the server deleted the lote. */
  onDeleted?: () => void;
}

export function PurgeLotDialog({
  lot,
  trigger = "button",
  open: controlledOpen,
  onOpenChange,
  onDeleted,
}: PurgeLotDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === "none" ? null : (
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-9 text-ink-soft hover:text-overdue"
          >
            <Trash2 aria-hidden />
            Excluir lote e animais
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <PurgeLotForm
          lot={lot}
          onClose={() => setOpen(false)}
          onDeleted={() => {
            setOpen(false);
            onDeleted?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function PurgeLotForm({
  lot,
  onClose,
  onDeleted,
}: {
  lot: Lot;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const animals = useHerdStore((s) => s.animals);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const purgeLot = useHerdStore((s) => s.purgeLot);
  const canEditFinance = useCan("finance", "edit");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  const { heads, emptied, openManejo } = lotPurge(lot.id, animals, manejoSessions);
  const withMoney = emptied.some(sessionHasMoney);
  const financeBlocked = withMoney && !canEditFinance;
  const blocked = openManejo || refused || financeBlocked;
  const confirmed = confirmsFarmName(typed, lot.name);
  const inputId = `purge-lot-name-${lot.id}`;

  async function confirm() {
    if (!confirmed || blocked || busy) return;
    setBusy(true);
    try {
      if (!(await purgeLot(lot.id))) {
        setRefused(true);
        return;
      }
    } catch {
      return; // The store already showed the failure.
    } finally {
      setBusy(false);
    }
    toast.success(`Lote ${lot.name} excluído com ${headsLabel(heads)}`);
    onDeleted();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Excluir {lot.name} e os animais?</DialogTitle>
        <DialogDescription>
          Para lote lançado errado ou de teste. {heads === 1 ? "Some" : "Somem"} de vez{" "}
          {headsLabel(heads)} do lote, com pesagens, tratamentos, coberturas e partos. Quem já
          saiu dele (morte, venda) continua no histórico. Não tem como desfazer.
        </DialogDescription>
      </DialogHeader>

      {emptied.length > 0 ? (
        <div className="grid gap-1.5 text-sm">
          <p>
            {emptied.length === 1
              ? "Este manejo fica sem animais e sai do histórico:"
              : "Estes manejos ficam sem animais e saem do histórico:"}
          </p>
          <ul className="list-disc pl-5 text-ink-soft">
            {emptied.map((session) => (
              <li key={session.id}>
                {session.name} · {formatDate(session.date)}
              </li>
            ))}
          </ul>
          {withMoney ? (
            <p className="text-ink-soft">
              {emptied.length === 1 ? "Os valores dele saem" : "Os valores deles saem"} do
              Financeiro.
            </p>
          ) : null}
        </div>
      ) : null}

      {openManejo || refused ? (
        <p role="alert" className="text-sm text-overdue">
          {OPEN_MANEJO}
        </p>
      ) : financeBlocked ? (
        <p role="alert" className="text-sm text-overdue">
          Só quem edita o Financeiro pode excluir manejos com valores.
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor={inputId}>Digite {lot.name} para confirmar</Label>
        <Input
          id={inputId}
          autoComplete="off"
          value={typed}
          disabled={blocked}
          onChange={(event) => setTyped(event.target.value)}
          className="min-h-11"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="min-h-11"
          disabled={!confirmed || blocked || busy}
          onClick={() => void confirm()}
        >
          <Trash2 aria-hidden />
          {busy ? "Excluindo…" : "Excluir lote e animais"}
        </Button>
      </DialogFooter>
    </>
  );
}
