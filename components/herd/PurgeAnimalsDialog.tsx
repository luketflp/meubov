"use client";

/**
 * "Excluir" on the herd's selection: for animals entered by mistake (a wrong
 * import, a test). They go for good with everything recorded on them, along
 * with the partos that brought them in and the manejos only they fill; the
 * farmer types "excluir" to confirm. The store is read inside the content
 * only, while it is open.
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/domain/dates";
import { compareEarTags } from "@/lib/domain/earTags";
import { confirmsFarmName } from "@/lib/domain/farms";
import { formatEarTagList } from "@/lib/domain/birthImport";
import { sessionHasMoney } from "@/lib/domain/moneyRedaction";
import { animalsPurge } from "@/lib/store/selectors";
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
  "Há um manejo em aberto com um destes animais. Encerre ou descarte o manejo antes.";

/** What the farmer types to confirm. */
const CONFIRM_WORD = "excluir";

const headsLabel = (heads: number) => (heads === 1 ? "1 animal" : `${heads} animais`);

interface PurgeAnimalsDialogProps {
  /** The ticked animals. */
  ids: ReadonlySet<string>;
  /** Called after the server deleted them. */
  onDeleted: () => void;
}

export function PurgeAnimalsDialog({ ids, onDeleted }: PurgeAnimalsDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" className="min-h-9">
          <Trash2 aria-hidden />
          Excluir
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <PurgeAnimalsForm
          ids={ids}
          onClose={() => setOpen(false)}
          onDeleted={() => {
            setOpen(false);
            onDeleted();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function PurgeAnimalsForm({
  ids,
  onClose,
  onDeleted,
}: {
  ids: ReadonlySet<string>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const animals = useHerdStore((s) => s.animals);
  const manejoSessions = useHerdStore((s) => s.manejoSessions);
  const purgeAnimals = useHerdStore((s) => s.purgeAnimals);
  const canEditFinance = useCan("finance", "edit");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  const { animalIds, earTags, calvings, emptied, openManejo } = animalsPurge(
    ids,
    animals,
    manejoSessions
  );
  const heads = animalIds.length;
  const withMoney = emptied.some(sessionHasMoney);
  const financeBlocked = withMoney && !canEditFinance;
  const blocked = heads === 0 || openManejo || refused || financeBlocked;
  const confirmed = confirmsFarmName(typed, CONFIRM_WORD);

  async function confirm() {
    if (!confirmed || blocked || busy) return;
    setBusy(true);
    try {
      if (!(await purgeAnimals(animalIds))) {
        setRefused(true);
        return;
      }
    } catch {
      return; // The store already showed the failure.
    } finally {
      setBusy(false);
    }
    toast.success(`${headsLabel(heads)} ${heads === 1 ? "excluído" : "excluídos"}`);
    onDeleted();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Excluir {headsLabel(heads)}?</DialogTitle>
        <DialogDescription>
          Para animais lançados errado ou de teste. {heads === 1 ? "Some" : "Somem"} de vez, com
          pesagens, tratamentos, coberturas e partos. Não tem como desfazer.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5 text-sm">
        <p className="font-mono text-ink">{formatEarTagList([...earTags].sort(compareEarTags))}</p>
        {calvings > 0 ? (
          <p className="text-ink-soft">
            {calvings === 1
              ? "Sai também o parto registrado na mãe."
              : `Saem também os ${calvings} partos registrados nas mães.`}
          </p>
        ) : null}
      </div>

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
        <Label htmlFor="purge-animals-confirm">Digite EXCLUIR para confirmar</Label>
        <Input
          id="purge-animals-confirm"
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
          {busy ? "Excluindo…" : `Excluir ${headsLabel(heads)}`}
        </Button>
      </DialogFooter>
    </>
  );
}
