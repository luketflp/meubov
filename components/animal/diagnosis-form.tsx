"use client";

/**
 * The diagnóstico form itself: picks one breeding and records its pregnancy
 * result.
 *
 * The breeding list defaults to the most recent one still waiting for a result;
 * re-examining a breeding overwrites the previous diagnosis (the API keeps one
 * per breeding), which is what a 30-then-60-day check does in practice.
 *
 * It is shared by the female's ficha ({@link RegisterDiagnosisDialog}), where
 * the cobertura is picked in the form, and the Coberturas screen, which opens
 * it from a row with the `breeding` already fixed — there the picker gives way
 * to a summary of that cobertura.
 */
import { useState, type FormEvent } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import type { Breeding, DiagnosisResult, ReproductionRecord } from "@/lib/types";
import { todayISO, formatDate } from "@/lib/domain/dates";
import { breedingsAwaitingDiagnosis } from "@/lib/domain/reproduction";
import { BREEDING_TYPE_LABEL, DIAGNOSIS_RESULT_LABEL } from "@/lib/domain/labels";
import { BreedingPill } from "@/components/animal/reproduction-pills";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RESULT_LIST = Object.keys(DIAGNOSIS_RESULT_LABEL) as DiagnosisResult[];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Breedings newest first — the order the picker shows. */
function byDateDesc(breedings: Breeding[]): Breeding[] {
  return [...breedings].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Most recent breeding without a result, else the most recent one. */
function defaultBreedingId(record: ReproductionRecord): string {
  const awaiting = breedingsAwaitingDiagnosis(record);
  if (awaiting.length > 0) return awaiting[0].id;
  return byDateDesc(record.breedings)[0]?.id ?? "";
}

interface DiagnosisFields {
  breedingId: string;
  result: DiagnosisResult;
  date: string;
}

interface DiagnosisFormProps {
  earTag: string;
  record: ReproductionRecord;
  /** When given, the result is for this breeding and there is no picker. */
  breeding?: Breeding;
  /** Called after the diagnosis is stored; the caller closes its dialog. */
  onRegistered: () => void;
}

export function DiagnosisForm({ earTag, record, breeding, onRegistered }: DiagnosisFormProps) {
  const recordDiagnosis = useHerdStore((s) => s.recordDiagnosis);
  const { addToast } = useToast();

  const [fields, setFields] = useState<DiagnosisFields>(() => ({
    breedingId: breeding?.id ?? defaultBreedingId(record),
    result: "pregnant",
    date: todayISO(),
  }));
  const [error, setError] = useState<string | null>(null);

  const options = byDateDesc(record.breedings);
  const awaitingIds = new Set(breedingsAwaitingDiagnosis(record).map((b) => b.id));
  const selected = breeding ?? options.find((b) => b.id === fields.breedingId) ?? null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      setError("Selecione a cobertura diagnosticada.");
      return;
    }
    if (!ISO_DATE_PATTERN.test(fields.date)) {
      setError("Informe a data do diagnóstico.");
      return;
    }
    if (fields.date > todayISO()) {
      setError("O diagnóstico não pode ser no futuro.");
      return;
    }
    if (fields.date < selected.date) {
      setError("O diagnóstico não pode ser anterior à cobertura.");
      return;
    }
    await recordDiagnosis(earTag, {
      breedingId: selected.id,
      result: fields.result,
      date: fields.date,
    });
    addToast({
      messageType: "success",
      text: `Diagnóstico de ${earTag}: ${DIAGNOSIS_RESULT_LABEL[fields.result].toLowerCase()}`,
    });
    onRegistered();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {breeding ? (
        <div className="rounded-lg border border-hairline bg-surface px-3 py-2.5">
          <p className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
            Cobertura
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-ink">{formatDate(breeding.date)}</span>
            <BreedingPill type={breeding.type} />
            <span className="text-ink-soft">
              Touro <span className="font-mono">{breeding.bullEarTag}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="diagnosis-breeding">Cobertura</Label>
          <Select
            value={fields.breedingId === "" ? undefined : fields.breedingId}
            onValueChange={(breedingId) => setFields((f) => ({ ...f, breedingId }))}
          >
            <SelectTrigger id="diagnosis-breeding" className="min-h-11 w-full">
              <SelectValue placeholder="Selecione a cobertura" />
            </SelectTrigger>
            <SelectContent>
              {options.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {formatDate(item.date)} · {BREEDING_TYPE_LABEL[item.type]} ·{" "}
                  {item.bullEarTag}
                  {awaitingIds.has(item.id) ? " · sem DG" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="diagnosis-result">Resultado</Label>
          <Select
            value={fields.result}
            onValueChange={(result) =>
              setFields((f) => ({ ...f, result: result as DiagnosisResult }))
            }
          >
            <SelectTrigger id="diagnosis-result" className="min-h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESULT_LIST.map((result) => (
                <SelectItem key={result} value={result}>
                  {DIAGNOSIS_RESULT_LABEL[result]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="diagnosis-date">Data do exame</Label>
          <Input
            id="diagnosis-date"
            type="date"
            max={todayISO()}
            value={fields.date}
            onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))}
            className="min-h-11 font-mono"
          />
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
          Lançar
        </Button>
      </DialogFooter>
    </form>
  );
}
