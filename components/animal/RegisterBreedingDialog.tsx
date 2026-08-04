"use client";

/**
 * "Registrar cobertura" dialog (females): date, type and the bull.
 *
 * Natural mating picks a bull from the herd; timed AI (IATF) takes free text,
 * because the semen usually comes from a sire that is not on the farm. When the
 * herd has no bull registered, natural mating falls back to free text too.
 */
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useHerdStore, type NewBreeding } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import type { BreedingType } from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { BREEDING_TYPE_LABEL } from "@/lib/domain/labels";
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

const BREEDING_TYPE_LIST = Object.keys(BREEDING_TYPE_LABEL) as BreedingType[];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface BreedingFields {
  date: string;
  type: BreedingType;
  bullEarTag: string;
}

function createInitialFields(): BreedingFields {
  return { date: todayISO(), type: "naturalMating", bullEarTag: "" };
}

interface RegisterBreedingDialogProps {
  earTag: string;
}

export function RegisterBreedingDialog({ earTag }: RegisterBreedingDialogProps) {
  const animals = useHerdStore((s) => s.animals);
  const recordBreeding = useHerdStore((s) => s.recordBreeding);
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<BreedingFields>(createInitialFields);
  const [error, setError] = useState<string | null>(null);

  const bulls = animals.filter((a) => a.active && a.category === "bull");
  const pickFromHerd = fields.type === "naturalMating" && bulls.length > 0;

  function onOpenChange(next: boolean) {
    if (next) {
      setFields(createInitialFields());
      setError(null);
    }
    setOpen(next);
  }

  /** Switching type clears the bull: a semen code is not a herd ear tag. */
  function onChangeType(type: BreedingType) {
    setFields((f) => ({ ...f, type, bullEarTag: "" }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ISO_DATE_PATTERN.test(fields.date)) {
      setError("Informe a data da cobertura.");
      return;
    }
    if (fields.date > todayISO()) {
      setError("A cobertura não pode ser no futuro.");
      return;
    }
    const bullEarTag = fields.bullEarTag.trim();
    if (bullEarTag === "") {
      setError(
        pickFromHerd ? "Selecione o touro." : "Informe o touro ou o código do sêmen."
      );
      return;
    }
    const breeding: NewBreeding = {
      date: fields.date,
      type: fields.type,
      bullEarTag,
    };
    await recordBreeding(earTag, breeding);
    addToast({ messageType: "success", text: `Cobertura de ${earTag} registrada` });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 md:min-h-0">
          <Plus data-icon="inline-start" aria-hidden />
          Cobertura
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar cobertura</DialogTitle>
          <DialogDescription>
            Cobertura da matriz {earTag}. A previsão de parto sai 283 dias depois,
            quando o diagnóstico confirmar a prenhez.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="breeding-date">Data</Label>
              <Input
                id="breeding-date"
                type="date"
                max={todayISO()}
                value={fields.date}
                onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))}
                className="min-h-11 font-mono"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="breeding-type">Tipo</Label>
              <Select
                value={fields.type}
                onValueChange={(type) => onChangeType(type as BreedingType)}
              >
                <SelectTrigger id="breeding-type" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BREEDING_TYPE_LIST.map((type) => (
                    <SelectItem key={type} value={type}>
                      {BREEDING_TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="breeding-bull">Touro</Label>
            {pickFromHerd ? (
              <Select
                value={fields.bullEarTag === "" ? undefined : fields.bullEarTag}
                onValueChange={(bullEarTag) => setFields((f) => ({ ...f, bullEarTag }))}
              >
                <SelectTrigger id="breeding-bull" className="min-h-11 w-full">
                  <SelectValue placeholder="Selecione o touro" />
                </SelectTrigger>
                <SelectContent>
                  {bulls.map((bull) => (
                    <SelectItem key={bull.earTag} value={bull.earTag}>
                      {bull.earTag} · {bull.breed}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Input
                  id="breeding-bull"
                  value={fields.bullEarTag}
                  onChange={(e) =>
                    setFields((f) => ({ ...f, bullEarTag: e.target.value }))
                  }
                  placeholder="Ex.: NEL-4471 ou código do sêmen"
                  className="min-h-11 font-mono"
                />
                <p className="text-xs text-ink-soft">
                  {fields.type === "timedAI"
                    ? "Touro do sêmen usado, mesmo que não seja do rebanho."
                    : "Nenhum touro cadastrado no rebanho — informe a identificação."}
                </p>
              </>
            )}
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
