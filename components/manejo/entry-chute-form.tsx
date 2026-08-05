"use client";

/**
 * Entry (compra) chute form: the animals of a purchase do not exist in the
 * system yet, so instead of a queue the operator registers each one as it comes
 * off the truck — brinco, categoria, raça, sexo, nascimento and the weight read
 * on the scale. Each submit creates the animal in the session's destination lot
 * and marks its pass as done. Mirrors the field rules of
 * components/herd/RegisterAnimalDialog.tsx.
 */
import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { useHerdStore, type EntryAnimal } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import type { Category, ManejoSession, Sex } from "@/lib/types";
import { CATEGORY_LABEL, SEX_LABEL } from "@/lib/domain/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "@/components/ui/section-card";
import { impliedSex } from "@/components/herd/RegisterAnimalDialog";

const CATEGORY_LIST = Object.keys(CATEGORY_LABEL) as Category[];
const SEX_LIST = Object.keys(SEX_LABEL) as Sex[];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Raw state of the arrival form (weight as input text). */
interface EntryFields {
  earTag: string;
  category: Category | "";
  sex: Sex | "";
  breed: string;
  birthDate: string;
  weightKg: string;
}

type EntryErrors = Partial<Record<keyof EntryFields, string>>;

/**
 * Pure validation of one arrival. The herd's ear tags are checked here so the
 * operator sees the clash before the round trip; the server checks it again.
 */
export function validateEntryAnimal(
  fields: EntryFields,
  existingEarTags: string[],
  todayIso: string
): EntryErrors {
  const errors: EntryErrors = {};
  const earTag = fields.earTag.trim();
  if (earTag === "") {
    errors.earTag = "Informe o brinco do animal.";
  } else if (existingEarTags.includes(earTag)) {
    errors.earTag = "Já existe um animal com este brinco.";
  }
  if (fields.category === "") errors.category = "Selecione a categoria.";
  if (fields.sex === "") errors.sex = "Selecione o sexo.";
  if (fields.breed === "") errors.breed = "Selecione a raça.";
  if (!ISO_DATE_PATTERN.test(fields.birthDate)) {
    errors.birthDate = "Informe a data de nascimento.";
  } else if (fields.birthDate > todayIso) {
    errors.birthDate = "O nascimento não pode ser no futuro.";
  }
  if (fields.weightKg.trim() !== "") {
    const weight = Number(fields.weightKg);
    if (!Number.isFinite(weight) || weight <= 0) {
      errors.weightKg = "Informe um peso válido em kg.";
    }
  }
  return errors;
}

/** Keeps raça/categoria/sexo between arrivals — a truck brings alike animals. */
function nextFields(previous: EntryFields): EntryFields {
  return { ...previous, earTag: "", weightKg: "" };
}

function createInitialFields(): EntryFields {
  return { earTag: "", category: "", sex: "", breed: "", birthDate: "", weightKg: "" };
}

function ErrorMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-overdue">{message}</p>;
}

interface EntryChuteFormProps {
  session: ManejoSession;
  todayIso: string;
}

export function EntryChuteForm({ session, todayIso }: EntryChuteFormProps) {
  const animals = useHerdStore((s) => s.animals);
  const breeds = useHerdStore((s) => s.breeds);
  const registerEntryAnimal = useHerdStore((s) => s.registerEntryAnimal);
  const { addToast } = useToast();

  const [fields, setFields] = useState<EntryFields>(createInitialFields);
  const [errors, setErrors] = useState<EntryErrors>({});
  const [busy, setBusy] = useState(false);

  const lockedSex = impliedSex(fields.category);

  function onChangeCategory(category: Category) {
    const sex = impliedSex(category);
    setFields((f) => ({ ...f, category, sex: sex ?? f.sex }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const newErrors = validateEntryAnimal(
      fields,
      animals.map((a) => a.earTag),
      todayIso
    );
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const animal: EntryAnimal = {
      earTag: fields.earTag.trim(),
      category: fields.category as Category,
      sex: fields.sex as Sex,
      breed: fields.breed,
      birthDate: fields.birthDate,
      initialWeightKg:
        fields.weightKg.trim() === "" ? undefined : Number(fields.weightKg),
    };
    setBusy(true);
    try {
      if (!(await registerEntryAnimal(session.id, animal))) {
        setErrors({ earTag: "Já existe um animal com este brinco." });
        return;
      }
      addToast({ messageType: "success", text: `${animal.earTag} entrou no rebanho` });
      setFields(nextFields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="No brete agora">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="entry-ear-tag">Brinco</Label>
            <Input
              id="entry-ear-tag"
              value={fields.earTag}
              onChange={(e) => setFields((f) => ({ ...f, earTag: e.target.value }))}
              placeholder="Ex.: BR-0451"
              autoFocus
              aria-invalid={errors.earTag ? true : undefined}
              className="min-h-11 font-mono text-lg"
            />
            <ErrorMessage message={errors.earTag} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="entry-weight">Peso na balança (kg, opcional)</Label>
            <Input
              id="entry-weight"
              type="number"
              min={1}
              step="0.1"
              inputMode="decimal"
              value={fields.weightKg}
              onChange={(e) => setFields((f) => ({ ...f, weightKg: e.target.value }))}
              placeholder="kg"
              aria-invalid={errors.weightKg ? true : undefined}
              className="min-h-11 font-mono"
            />
            <ErrorMessage message={errors.weightKg} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="entry-category">Categoria</Label>
            <Select
              value={fields.category === "" ? undefined : fields.category}
              onValueChange={(v) => onChangeCategory(v as Category)}
            >
              <SelectTrigger
                id="entry-category"
                className="min-h-11 w-full"
                aria-invalid={errors.category ? true : undefined}
              >
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_LIST.map((category) => (
                  <SelectItem key={category} value={category}>
                    {CATEGORY_LABEL[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ErrorMessage message={errors.category} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="entry-sex">Sexo</Label>
            <Select
              value={fields.sex === "" ? undefined : fields.sex}
              onValueChange={(v) => setFields((f) => ({ ...f, sex: v as Sex }))}
              disabled={lockedSex !== null}
            >
              <SelectTrigger
                id="entry-sex"
                className="min-h-11 w-full"
                aria-invalid={errors.sex ? true : undefined}
              >
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
            <ErrorMessage message={errors.sex} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="entry-breed">Raça</Label>
            <Select
              value={fields.breed === "" ? undefined : fields.breed}
              onValueChange={(breed) => setFields((f) => ({ ...f, breed }))}
            >
              <SelectTrigger
                id="entry-breed"
                className="min-h-11 w-full"
                aria-invalid={errors.breed ? true : undefined}
              >
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
            <ErrorMessage message={errors.breed} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="entry-birth">Nascimento</Label>
            <Input
              id="entry-birth"
              type="date"
              value={fields.birthDate}
              onChange={(e) => setFields((f) => ({ ...f, birthDate: e.target.value }))}
              aria-invalid={errors.birthDate ? true : undefined}
              className="min-h-11 font-mono"
            />
            <ErrorMessage message={errors.birthDate} />
          </div>
        </div>

        <Button type="submit" disabled={busy} className="min-h-12 w-full sm:w-auto sm:px-8">
          <CheckCircle2 aria-hidden />
          Registrar e próximo
        </Button>
      </form>
    </SectionCard>
  );
}
