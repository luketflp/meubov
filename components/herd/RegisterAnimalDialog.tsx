"use client";

/**
 * "Cadastrar animal" dialog: trigger button + form to register a new animal
 * in the herd (ear tag, category, sex, breed, birth, lot and optional initial
 * weight). Sex is locked when the category implies it (novilha/vaca female,
 * boi/touro male). Validation is a local pure function (validateAnimal).
 */
import { useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useHerdStore, type NewAnimal } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import type { Category, Sex } from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { CATEGORY_LABEL, SEX_LABEL } from "@/lib/domain/labels";
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

const CATEGORY_LIST = Object.keys(CATEGORY_LABEL) as Category[];
const SEX_LIST = Object.keys(SEX_LABEL) as Sex[];

/** Sex implied by the category, or null when both are possible (bezerro). */
export function impliedSex(category: Category | ""): Sex | null {
  if (category === "heifer" || category === "cow") return "female";
  if (category === "steer" || category === "bull") return "male";
  return null;
}

/** Raw form state (weight as input text). */
export interface AnimalFields {
  earTag: string;
  category: Category | "";
  /** Custom category id when the picked option is user-defined. */
  customCategoryId: string;
  sex: Sex | "";
  breed: string;
  birthDate: string;
  lotId: string;
  initialWeightKg: string;
}

export type AnimalErrors = Partial<
  Record<"earTag" | "category" | "sex" | "breed" | "birthDate" | "lotId" | "initialWeightKg", string>
>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Pure form validation; returns pt-BR messages per field. */
export function validateAnimal(
  fields: AnimalFields,
  existingEarTags: string[],
  todayIso: string
): AnimalErrors {
  const errors: AnimalErrors = {};
  const earTag = fields.earTag.trim();
  if (earTag === "") {
    errors.earTag = "Informe o brinco do animal.";
  } else if (existingEarTags.includes(earTag)) {
    errors.earTag = "Já existe um animal com este brinco.";
  }
  if (fields.category === "") {
    errors.category = "Selecione a categoria.";
  }
  if (fields.sex === "") {
    errors.sex = "Selecione o sexo.";
  }
  if (fields.breed === "") {
    errors.breed = "Selecione a raça.";
  }
  if (!ISO_DATE_PATTERN.test(fields.birthDate)) {
    errors.birthDate = "Informe a data de nascimento.";
  } else if (fields.birthDate > todayIso) {
    errors.birthDate = "O nascimento não pode ser no futuro.";
  }
  if (fields.lotId === "") {
    errors.lotId = "Selecione o lote.";
  }
  if (fields.initialWeightKg.trim() !== "") {
    const weight = Number(fields.initialWeightKg);
    if (!Number.isFinite(weight) || weight <= 0) {
      errors.initialWeightKg = "Informe um peso válido em kg.";
    }
  }
  return errors;
}

function createInitialFields(): AnimalFields {
  return {
    earTag: "",
    category: "",
    customCategoryId: "",
    sex: "",
    breed: "",
    birthDate: "",
    lotId: "",
    initialWeightKg: "",
  };
}

function ErrorMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-overdue">{message}</p>;
}

export function RegisterAnimalDialog() {
  const animals = useHerdStore((s) => s.animals);
  const breeds = useHerdStore((s) => s.breeds);
  const lots = useHerdStore((s) => s.lots);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);
  const customCategories = useHerdStore((s) => s.customCategories);
  const addAnimal = useHerdStore((s) => s.addAnimal);
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<AnimalFields>(createInitialFields);
  const [errors, setErrors] = useState<AnimalErrors>({});

  const sexLocked = impliedSex(fields.category) !== null;
  const availableLots = useMemo(
    () => currentlyPlacedLots(lots, lotPlacements),
    [lots, lotPlacements]
  );
  const invernadaNameByLot = useMemo(() => {
    const byId = new Map(invernadas.map((item) => [item.id, item]));
    return new Map(
      availableLots.map((lot) => {
        const placement = currentPlacementForLot(lot.id, lotPlacements);
        const invernada = placement ? byId.get(placement.invernadaId) : undefined;
        return [lot.id, invernada ? invernada.code : "Sem invernada"] as const;
      })
    );
  }, [availableLots, invernadas, lotPlacements]);

  function onOpenChange(next: boolean) {
    if (next) {
      setFields(createInitialFields());
      setErrors({});
    }
    setOpen(next);
  }

  /** Handles both canonical ("base:x") and custom ("custom:id") options. */
  function onChangeCategory(value: string) {
    if (value.startsWith("custom:")) {
      const id = value.slice("custom:".length);
      const custom = customCategories.find((c) => c.id === id);
      if (!custom) return;
      setFields((f) => ({
        ...f,
        category: custom.baseCategory,
        customCategoryId: id,
        sex: impliedSex(custom.baseCategory) ?? f.sex,
      }));
      return;
    }
    const category = value.slice("base:".length) as Category;
    setFields((f) => ({
      ...f,
      category,
      customCategoryId: "",
      sex: impliedSex(category) ?? f.sex,
    }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const earTags = animals.map((a) => a.earTag);
    const newErrors = validateAnimal(fields, earTags, todayISO());
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    const { category, sex } = fields;
    if (category === "" || sex === "") return;
    const weight = fields.initialWeightKg.trim();
    const animal: NewAnimal = {
      earTag: fields.earTag.trim(),
      category,
      customCategoryId:
        fields.customCategoryId === "" ? undefined : fields.customCategoryId,
      sex,
      breed: fields.breed,
      birthDate: fields.birthDate,
      lotId: fields.lotId,
      initialWeightKg: weight === "" ? undefined : Number(weight),
    };
    if (!(await addAnimal(animal))) {
      setErrors({ earTag: "Já existe um animal com este brinco." });
      return;
    }
    addToast({ messageType: "success", text: `Animal ${animal.earTag} cadastrado` });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="min-h-11">
          <Plus aria-hidden />
          Cadastrar animal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar animal</DialogTitle>
          <DialogDescription>
            Registre um novo animal do rebanho com brinco, categoria e lote.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="animal-eartag">Brinco</Label>
              <Input
                id="animal-eartag"
                value={fields.earTag}
                onChange={(e) => setFields((f) => ({ ...f, earTag: e.target.value }))}
                placeholder="Ex.: BR-1042"
                aria-invalid={errors.earTag ? true : undefined}
                className="min-h-11 font-mono"
              />
              <ErrorMessage message={errors.earTag} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="animal-birth">Nascimento</Label>
              <Input
                id="animal-birth"
                type="date"
                max={todayISO()}
                value={fields.birthDate}
                onChange={(e) => setFields((f) => ({ ...f, birthDate: e.target.value }))}
                aria-invalid={errors.birthDate ? true : undefined}
                className="min-h-11 font-mono"
              />
              <ErrorMessage message={errors.birthDate} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="animal-category">Categoria</Label>
              <Select
                value={
                  fields.customCategoryId !== ""
                    ? `custom:${fields.customCategoryId}`
                    : fields.category === ""
                      ? undefined
                      : `base:${fields.category}`
                }
                onValueChange={onChangeCategory}
              >
                <SelectTrigger
                  id="animal-category"
                  className="min-h-11 w-full"
                  aria-invalid={errors.category ? true : undefined}
                >
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_LIST.map((category) => (
                    <SelectItem key={category} value={`base:${category}`}>
                      {CATEGORY_LABEL[category]}
                    </SelectItem>
                  ))}
                  {customCategories.map((c) => (
                    <SelectItem key={c.id} value={`custom:${c.id}`}>
                      {c.name} ({CATEGORY_LABEL[c.baseCategory]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ErrorMessage message={errors.category} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="animal-sex">Sexo</Label>
              <Select
                value={fields.sex === "" ? undefined : fields.sex}
                onValueChange={(sex) => setFields((f) => ({ ...f, sex: sex as Sex }))}
                disabled={sexLocked}
              >
                <SelectTrigger
                  id="animal-sex"
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
              {sexLocked ? (
                <p className="text-xs text-ink-soft">Definido pela categoria.</p>
              ) : null}
              <ErrorMessage message={errors.sex} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="animal-breed">Raça</Label>
              <Select
                value={fields.breed === "" ? undefined : fields.breed}
                onValueChange={(breed) => setFields((f) => ({ ...f, breed }))}
              >
                <SelectTrigger
                  id="animal-breed"
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
              <Label htmlFor="animal-lot">Lote</Label>
              <Select
                value={fields.lotId === "" ? undefined : fields.lotId}
                onValueChange={(lotId) => setFields((f) => ({ ...f, lotId }))}
              >
                <SelectTrigger
                  id="animal-lot"
                  className="min-h-11 w-full"
                  aria-invalid={errors.lotId ? true : undefined}
                >
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
              <ErrorMessage message={errors.lotId} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="animal-weight">Peso inicial (kg, opcional)</Label>
              <Input
                id="animal-weight"
                type="number"
                min={1}
                step="0.1"
                inputMode="decimal"
                value={fields.initialWeightKg}
                onChange={(e) => setFields((f) => ({ ...f, initialWeightKg: e.target.value }))}
                aria-invalid={errors.initialWeightKg ? true : undefined}
                className="min-h-11 font-mono"
              />
              <p className="text-xs text-ink-soft">Registrado como a primeira pesagem.</p>
              <ErrorMessage message={errors.initialWeightKg} />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" className="min-h-11">
              Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
