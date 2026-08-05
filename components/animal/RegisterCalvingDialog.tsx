"use client";

/**
 * "Registrar parto" dialog (females). Records the calving AND registers the
 * calf in the herd in one go — a birth that left no animal behind would quietly
 * shrink the herd count.
 *
 * Breed and lot start on the dam's and can be overridden; the optional birth
 * weight becomes the calf's first weighing, dated the calving.
 */
import { useMemo, useState, type FormEvent } from "react";
import { Baby } from "lucide-react";
import { useHerdStore, type NewCalving } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import type { Animal, Sex } from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { SEX_LABEL } from "@/lib/domain/labels";
import {
  currentPlacementForLot,
  currentlyPlacedLots,
} from "@/lib/store/selectors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

const SEX_LIST = Object.keys(SEX_LABEL) as Sex[];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface CalvingFields {
  date: string;
  calfEarTag: string;
  calfSex: Sex | "";
  calfBreed: string;
  calfLotId: string;
  calfWeightKg: string;
}

function createInitialFields(dam: Animal): CalvingFields {
  return {
    date: todayISO(),
    calfEarTag: "",
    calfSex: "",
    calfBreed: dam.breed,
    calfLotId: dam.lotId,
    calfWeightKg: "",
  };
}

interface RegisterCalvingDialogProps {
  dam: Animal;
}

export function RegisterCalvingDialog({ dam }: RegisterCalvingDialogProps) {
  const animals = useHerdStore((s) => s.animals);
  const breeds = useHerdStore((s) => s.breeds);
  const lots = useHerdStore((s) => s.lots);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const recordCalving = useHerdStore((s) => s.recordCalving);
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<CalvingFields>(() => createInitialFields(dam));
  const [error, setError] = useState<string | null>(null);
  const availableLots = useMemo(
    () => currentlyPlacedLots(lots, lotPlacements),
    [lots, lotPlacements]
  );
  const invernadaNameByLot = useMemo(() => {
    const byId = new Map(invernadas.map((item) => [item.id, item]));
    return new Map(
      availableLots.map((lot) => {
        const placement = currentPlacementForLot(lot.id, lotPlacements);
        return [
          lot.id,
          placement ? byId.get(placement.invernadaId)?.code ?? "—" : "Sem invernada",
        ] as const;
      })
    );
  }, [availableLots, invernadas, lotPlacements]);

  function onOpenChange(next: boolean) {
    if (next) {
      setFields(createInitialFields(dam));
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ISO_DATE_PATTERN.test(fields.date)) {
      setError("Informe a data do parto.");
      return;
    }
    if (fields.date > todayISO()) {
      setError("O parto não pode ser no futuro.");
      return;
    }
    const calfEarTag = fields.calfEarTag.trim();
    if (calfEarTag === "") {
      setError("Informe o brinco do bezerro.");
      return;
    }
    if (animals.some((a) => a.earTag === calfEarTag)) {
      setError("Já existe um animal com este brinco.");
      return;
    }
    if (fields.calfSex === "") {
      setError("Selecione o sexo do bezerro.");
      return;
    }
    const weight = fields.calfWeightKg.trim();
    const calfWeightKg = weight === "" ? undefined : Number(weight);
    if (calfWeightKg !== undefined && (!Number.isFinite(calfWeightKg) || calfWeightKg <= 0)) {
      setError("Informe um peso ao nascer válido em kg.");
      return;
    }

    const calving: NewCalving = {
      date: fields.date,
      calfEarTag,
      calfSex: fields.calfSex,
      calfBreed: fields.calfBreed === "" ? undefined : fields.calfBreed,
      calfLotId: fields.calfLotId === "" ? undefined : fields.calfLotId,
      calfWeightKg,
    };
    if (!(await recordCalving(dam.earTag, calving))) {
      setError("Já existe um animal com este brinco.");
      return;
    }
    addToast({
      messageType: "success",
      text: `Parto de ${dam.earTag} registrado · bezerro ${calfEarTag} no rebanho`,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 md:min-h-0">
          <Baby data-icon="inline-start" aria-hidden />
          Parto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar parto</DialogTitle>
          <DialogDescription>
            Parto da matriz {dam.earTag}. O bezerro entra no rebanho já cadastrado,
            com nascimento na data do parto.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="calving-date">Data do parto</Label>
              <Input
                id="calving-date"
                type="date"
                max={todayISO()}
                value={fields.date}
                onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))}
                className="min-h-11 font-mono"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="calving-eartag">Brinco do bezerro</Label>
              <Input
                id="calving-eartag"
                value={fields.calfEarTag}
                onChange={(e) => setFields((f) => ({ ...f, calfEarTag: e.target.value }))}
                placeholder="Ex.: BR-2001"
                className="min-h-11 font-mono"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="calving-sex">Sexo</Label>
              <Select
                value={fields.calfSex === "" ? undefined : fields.calfSex}
                onValueChange={(sex) => setFields((f) => ({ ...f, calfSex: sex as Sex }))}
              >
                <SelectTrigger id="calving-sex" className="min-h-11 w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {SEX_LIST.map((sex) => (
                    <SelectItem key={sex} value={sex}>
                      {SEX_LABEL[sex]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="calving-breed">Raça</Label>
              <Select
                value={fields.calfBreed === "" ? undefined : fields.calfBreed}
                onValueChange={(calfBreed) => setFields((f) => ({ ...f, calfBreed }))}
              >
                <SelectTrigger id="calving-breed" className="min-h-11 w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {breeds.map((breed) => (
                    <SelectItem key={breed} value={breed}>
                      {breed}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-ink-soft">Começa na raça da mãe.</p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="calving-lot">Lote</Label>
              <Select
                value={fields.calfLotId === "" ? undefined : fields.calfLotId}
                onValueChange={(calfLotId) => setFields((f) => ({ ...f, calfLotId }))}
              >
                <SelectTrigger id="calving-lot" className="min-h-11 w-full">
                  <SelectValue placeholder="Selecione o lote" />
                </SelectTrigger>
                <SelectContent>
                  {availableLots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.name} · Inv. {invernadaNameByLot.get(lot.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-ink-soft">Começa no lote da mãe.</p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="calving-weight">Peso ao nascer (kg, opcional)</Label>
              <Input
                id="calving-weight"
                type="number"
                min={1}
                step="0.1"
                inputMode="decimal"
                value={fields.calfWeightKg}
                onChange={(e) =>
                  setFields((f) => ({ ...f, calfWeightKg: e.target.value }))
                }
                className="min-h-11 font-mono"
              />
              <p className="text-xs text-ink-soft">Vira a primeira pesagem do bezerro.</p>
            </div>
          </div>

          {error ? <p className="text-xs text-overdue">{error}</p> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" className="min-h-11">
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
