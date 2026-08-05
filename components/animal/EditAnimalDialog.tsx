"use client";

/**
 * "Editar animal" dialog: category (canonical or custom, filtered by the
 * animal's sex), breed, birth date and lot — plus the danger zone that
 * deactivates the animal with a reason (a sale goes through a manejo de venda).
 */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import type { Animal, Category, InactiveReason } from "@/lib/types";
import { todayISO } from "@/lib/domain/dates";
import { CATEGORY_LABEL, INACTIVE_REASON_LABEL } from "@/lib/domain/labels";
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
import { Textarea } from "@/components/ui/textarea";

/** Base categories compatible with each sex. */
const BASE_BY_SEX: Record<Animal["sex"], Category[]> = {
  female: ["calf", "heifer", "cow"],
  male: ["calf", "steer", "bull"],
};

/** Deactivation reasons offered here (a sale happens in a manejo de venda). */
const BAIXA_REASONS: readonly Exclude<InactiveReason, "sale">[] = [
  "death",
  "loss",
  "other",
];

/** Encodes the category select: canonical base or custom category. */
const baseValue = (category: Category): string => `base:${category}`;
const customValue = (id: string): string => `custom:${id}`;

export function EditAnimalDialog({ animal }: { animal: Animal }) {
  const breeds = useHerdStore((s) => s.breeds);
  const lots = useHerdStore((s) => s.lots);
  const customCategories = useHerdStore((s) => s.customCategories);
  const updateAnimal = useHerdStore((s) => s.updateAnimal);
  const deactivateAnimal = useHerdStore((s) => s.deactivateAnimal);
  const { addToast } = useToast();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [categoryValue, setCategoryValue] = useState("");
  const [breed, setBreed] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [lotId, setLotId] = useState("");
  const [reason, setReason] = useState<Exclude<InactiveReason, "sale"> | "">("");
  const [baixaDate, setBaixaDate] = useState(todayISO);
  const [baixaNotes, setBaixaNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const compatibleBases = BASE_BY_SEX[animal.sex];
  const compatibleCustom = customCategories.filter((c) =>
    compatibleBases.includes(c.baseCategory)
  );

  function onOpenChange(next: boolean) {
    if (next) {
      setCategoryValue(
        animal.customCategoryId
          ? customValue(animal.customCategoryId)
          : baseValue(animal.category)
      );
      setBreed(animal.breed);
      setBirthDate(animal.birthDate);
      setLotId(animal.lotId);
      setReason("");
      setBaixaDate(todayISO());
      setBaixaNotes("");
      setError(null);
    }
    setOpen(next);
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (birthDate === "" || birthDate > todayISO()) {
      setError("Informe uma data de nascimento válida (não futura).");
      return;
    }
    const patch =
      categoryValue.startsWith("custom:")
        ? { customCategoryId: categoryValue.slice("custom:".length) }
        : {
            category: categoryValue.slice("base:".length) as Category,
            customCategoryId: null,
          };
    await updateAnimal(animal.earTag, { ...patch, breed, birthDate, lotId });
    addToast({ messageType: "success", text: `Animal ${animal.earTag} atualizado` });
    setOpen(false);
  }

  async function onDeactivate() {
    if (reason === "") {
      setError("Selecione o motivo da baixa.");
      return;
    }
    // A baixa is history: it can be backdated (the animal was found days
    // later), never postdated.
    if (baixaDate === "" || baixaDate > todayISO()) {
      setError("Informe a data da baixa (não pode ser no futuro).");
      return;
    }
    if (baixaDate < animal.birthDate) {
      setError("A baixa não pode ser anterior ao nascimento do animal.");
      return;
    }
    await deactivateAnimal(animal.earTag, {
      reason,
      date: baixaDate,
      notes: baixaNotes,
    });
    addToast({ messageType: "success", text: `Animal ${animal.earTag} baixado` });
    setOpen(false);
    router.push("/herd");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11 md:min-h-9">
          <Pencil data-icon="inline-start" aria-hidden />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar animal {animal.earTag}</DialogTitle>
          <DialogDescription>
            Categoria, raça, nascimento e lote. Vendas são registradas em um
            manejo de venda.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSave} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-category">Categoria</Label>
            <Select value={categoryValue} onValueChange={setCategoryValue}>
              <SelectTrigger id="edit-category" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {compatibleBases.map((category) => (
                  <SelectItem key={category} value={baseValue(category)}>
                    {CATEGORY_LABEL[category]}
                  </SelectItem>
                ))}
                {compatibleCustom.map((c) => (
                  <SelectItem key={c.id} value={customValue(c.id)}>
                    {c.name} ({CATEGORY_LABEL[c.baseCategory]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-breed">Raça</Label>
              <Select value={breed} onValueChange={setBreed}>
                <SelectTrigger id="edit-breed" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {breeds.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="edit-birth">Nascimento</Label>
              <Input
                id="edit-birth"
                type="date"
                value={birthDate}
                max={todayISO()}
                onChange={(e) => setBirthDate(e.target.value)}
                className="min-h-11 font-mono"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-lot">Lote</Label>
            <Select value={lotId} onValueChange={setLotId}>
              <SelectTrigger id="edit-lot" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lots.map((lot) => (
                  <SelectItem key={lot.id} value={lot.id}>
                    {lot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? <p className="text-xs text-overdue">{error}</p> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" className="min-h-11">
              Salvar
            </Button>
          </DialogFooter>
        </form>

        <div className="mt-2 border-t border-hairline pt-4">
          <p className="text-sm font-medium text-ink">Dar baixa</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Remove o animal do rebanho ativo. Ficam registrados o motivo, a data
            e a observação; o histórico do animal não é apagado.
          </p>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-reason">Motivo</Label>
                <Select
                  value={reason === "" ? undefined : reason}
                  onValueChange={(v) => setReason(v as Exclude<InactiveReason, "sale">)}
                >
                  <SelectTrigger id="edit-reason" className="min-h-11 w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {BAIXA_REASONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {INACTIVE_REASON_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="edit-baixa-date">Data</Label>
                <Input
                  id="edit-baixa-date"
                  type="date"
                  value={baixaDate}
                  onChange={(e) => setBaixaDate(e.target.value)}
                  className="min-h-11 font-mono"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="edit-baixa-notes">Observação (opcional)</Label>
              <Textarea
                id="edit-baixa-notes"
                value={baixaNotes}
                onChange={(e) => setBaixaNotes(e.target.value)}
                placeholder="Ex.: encontrada morta no pasto, suspeita de picada de cobra"
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 text-overdue hover:text-overdue"
                onClick={onDeactivate}
              >
                Dar baixa
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
