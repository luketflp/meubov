"use client";

/**
 * The cobertura form itself: date, type and the bull.
 *
 * Natural mating picks a bull from the herd; timed AI (IATF) picks one of the
 * semen bulls on Touros, and that cobertura takes a dose of its stock. "Outro"
 * keeps free text for a semen that is not in stock, and takes nothing. When the
 * herd has no bull registered, natural mating falls back to free text too, and
 * so does IATF when the farm has no semen bull.
 *
 * It is shared by the female's ficha ({@link RegisterBreedingDialog}) and the
 * Reprodução screen, which differ only in how the dam gets chosen and in the
 * footer's left button.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { useHerdStore, type NewBreeding } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import type { BreedingType, SemenBull } from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { BREEDING_TYPE_LABEL } from "@/lib/domain/labels";
import { dosesLabel } from "@/components/semen/helpers";
import { useSemenStock } from "@/components/semen/use-semen-stock";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BREEDING_TYPE_LIST = Object.keys(BREEDING_TYPE_LABEL) as BreedingType[];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The semen bull select's "Outro (digitar código)": a code typed by hand. */
const OTHER_SEMEN = "other";

interface BreedingFields {
  date: string;
  type: BreedingType;
  bullEarTag: string;
  /** The semen bull picked for an IATF, {@link OTHER_SEMEN} for a typed code, "" before a pick. */
  semenBullId: string;
}

function createInitialFields(): BreedingFields {
  return { date: todayISO(), type: "naturalMating", bullEarTag: "", semenBullId: "" };
}

/** " · NEL-4471 · 19 doses" after the bull's name; "sem doses" once the stock is gone. */
function semenBullDetail(bull: SemenBull, left: number): string {
  const doses = left <= 0 ? "sem doses" : dosesLabel(left);
  return [bull.code, doses]
    .filter((part) => part !== undefined && part !== "")
    .map((part) => ` · ${part}`)
    .join("");
}

interface BreedingFormProps {
  earTag: string;
  /** Called after the breeding is stored; the caller closes its dialog. */
  onRegistered: () => void;
  /** Footer button shown to the left of "Cancelar" (back, …). */
  leadingAction?: ReactNode;
}

export function BreedingForm({ earTag, onRegistered, leadingAction }: BreedingFormProps) {
  const animals = useHerdStore((s) => s.animals);
  const { bulls: semenBulls, dosesLeft } = useSemenStock();
  const recordBreeding = useHerdStore((s) => s.recordBreeding);
  const { addToast } = useToast();

  const [fields, setFields] = useState<BreedingFields>(createInitialFields);
  const [error, setError] = useState<string | null>(null);

  const bulls = animals.filter((a) => a.active && a.category === "bull");
  const pickFromHerd = fields.type === "naturalMating" && bulls.length > 0;
  const pickSemen = fields.type === "timedAI" && semenBulls.length > 0;
  /** The bull goes in as text: no bull to pick from, or "Outro" picked. */
  const typeBull = !pickFromHerd && (!pickSemen || fields.semenBullId === OTHER_SEMEN);

  /** Switching type clears the bull: a semen code is not a herd ear tag. */
  function onChangeType(type: BreedingType) {
    setFields((f) => ({ ...f, type, bullEarTag: "", semenBullId: "" }));
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
    if (pickSemen && fields.semenBullId === "") {
      setError("Selecione o touro.");
      return;
    }
    const semenBull = typeBull
      ? undefined
      : semenBulls.find((bull) => bull.id === fields.semenBullId);
    const bullEarTag = semenBull?.name ?? fields.bullEarTag.trim();
    if (bullEarTag === "") {
      setError(
        pickFromHerd ? "Selecione o touro." : "Informe o touro ou o código do sêmen."
      );
      return;
    }
    const breeding: NewBreeding = {
      date: fields.date,
      type: fields.type,
      // With a semen bull the server stores its code here; the name holds the place until then.
      bullEarTag,
      ...(semenBull ? { semenBullId: semenBull.id } : {}),
    };
    // False when the bull's last dose went meanwhile: the store told the farmer,
    // and the dialog stays open to pick another one.
    if (!(await recordBreeding(earTag, breeding))) return;
    addToast({ messageType: "success", text: `Cobertura de ${earTag} registrada` });
    onRegistered();
  }

  return (
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
            {pickSemen ? (
              <Select
                value={fields.semenBullId === "" ? undefined : fields.semenBullId}
                onValueChange={(semenBullId) =>
                  setFields((f) => ({ ...f, semenBullId, bullEarTag: "" }))
                }
              >
                <SelectTrigger id="breeding-bull" className="min-h-11 w-full">
                  <SelectValue placeholder="Selecione o touro" />
                </SelectTrigger>
                <SelectContent>
                  {semenBulls.map((bull) => {
                    const left = dosesLeft(bull.id);
                    return (
                      <SelectItem key={bull.id} value={bull.id} disabled={left <= 0}>
                        {bull.name}
                        <span className="text-ink-soft">{semenBullDetail(bull, left)}</span>
                      </SelectItem>
                    );
                  })}
                  <SelectSeparator />
                  <SelectItem value={OTHER_SEMEN}>Outro (digitar código)</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            {typeBull ? (
              <>
                <Input
                  id={pickSemen ? "breeding-bull-code" : "breeding-bull"}
                  aria-label={pickSemen ? "Código do sêmen" : undefined}
                  value={fields.bullEarTag}
                  onChange={(e) => setFields((f) => ({ ...f, bullEarTag: e.target.value }))}
                  placeholder="Ex.: NEL-4471 ou código do sêmen"
                  className="min-h-11 font-mono"
                />
                <p className="text-xs text-ink-soft">
                  {fields.type === "timedAI"
                    ? "Touro do sêmen usado, mesmo que não seja do rebanho."
                    : "Nenhum touro cadastrado no rebanho — informe a identificação."}
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-soft">Usa 1 dose do estoque do touro.</p>
            )}
          </>
        )}
      </div>

      {error ? <p className="text-xs text-overdue">{error}</p> : null}

      <DialogFooter>
        {leadingAction}
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
  );
}
