"use client";

/**
 * "Excluir {fazenda}?": the Dono types the farm's name to confirm. The farm
 * disappears for everyone at once; the rows stay for a mistake to be undone.
 */
import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmsFarmName, farmLabel } from "@/lib/domain/farms";
import { useHerdStore, type FarmOption } from "@/lib/store/useHerdStore";
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
import { Label } from "@/components/ui/label";

interface DeleteFarmDialogProps {
  /** The farm to delete; null keeps the dialog closed. */
  farm: FarmOption | null;
  onClose: () => void;
}

export function DeleteFarmDialog({ farm, onClose }: DeleteFarmDialogProps) {
  return (
    <Dialog open={farm !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        {farm ? <DeleteFarmForm farm={farm} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DeleteFarmForm({ farm, onDone }: { farm: FarmOption; onDone: () => void }) {
  const deleteFarm = useHerdStore((s) => s.deleteFarm);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const label = farmLabel(farm);
  const confirmed = confirmsFarmName(typed, label);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      await deleteFarm(farm.id);
      toast.success(`${label} excluída`);
      onDone();
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Excluir {label}?</DialogTitle>
        <DialogDescription>
          O rebanho, os manejos e o financeiro desta fazenda deixam de aparecer para todos. Quem é
          da equipe perde o acesso na hora e os convites pendentes são cancelados.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="delete-farm-name">Digite {label} para confirmar</Label>
          <Input
            id="delete-farm-name"
            autoFocus
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="min-h-11"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" variant="destructive" className="min-h-11" disabled={!confirmed || busy}>
            <Trash2 aria-hidden />
            Excluir fazenda
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
