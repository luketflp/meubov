"use client";

/**
 * "Registrar nascimento" on the Nascimentos screen. Same write as the dam's
 * ficha — a calving plus the calf entering the herd — but reached from the
 * screen instead of the mother's record, so the dam is picked here first.
 *
 * Two steps in one dialog: choose the matriz, then fill {@link CalvingForm}.
 * The picker lists only active females; the calving API refuses anything else,
 * and a female that already left the herd is no longer calving on this farm.
 */
import { useMemo, useState } from "react";
import { Baby, Search } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { activeAnimals } from "@/lib/store/selectors";
import type { Animal } from "@/lib/types";
import { formatAge } from "@/lib/domain/dates";
import { animalCategoryName } from "@/lib/domain/labels";
import { CalvingForm } from "@/components/animal/calving-form";
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

export function RegisterBirthDialog() {
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const customCategories = useHerdStore((s) => s.customCategories);

  const [open, setOpen] = useState(false);
  const [dam, setDam] = useState<Animal | null>(null);
  const [search, setSearch] = useState("");

  const lotNameById = useMemo(
    () => new Map(lots.map((lot) => [lot.id, lot.name])),
    [lots]
  );
  const dams = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeAnimals(animals)
      .filter(
        (animal) =>
          animal.sex === "female" &&
          (term === "" || animal.earTag.toLowerCase().includes(term))
      )
      .sort((a, b) => a.earTag.localeCompare(b.earTag));
  }, [animals, search]);

  function onOpenChange(next: boolean) {
    if (next) {
      setDam(null);
      setSearch("");
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="min-h-11">
          <Baby data-icon="inline-start" aria-hidden />
          Registrar nascimento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar nascimento</DialogTitle>
          <DialogDescription>
            {dam === null
              ? "Escolha a matriz que pariu. Só matrizes ativas aparecem aqui."
              : `Parto da matriz ${dam.earTag}. O bezerro entra no rebanho já cadastrado, com nascimento na data do parto.`}
          </DialogDescription>
        </DialogHeader>

        {dam === null ? (
          <div className="grid gap-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar brinco"
                aria-label="Buscar matriz por brinco"
                className="min-h-11 pl-9 font-mono md:min-h-9"
              />
            </div>

            {dams.length === 0 ? (
              <p className="px-1 py-2 text-xs text-ink-soft">
                Nenhuma matriz ativa com esse brinco.
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto rounded-lg border border-hairline">
                {dams.map((animal) => (
                  <li key={animal.id} className="border-b border-hairline last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setDam(animal)}
                      className="flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-brand-soft/50"
                    >
                      <span className="font-mono font-medium text-ink">
                        {animal.earTag}
                      </span>
                      <span className="truncate text-xs text-ink-soft">
                        {animalCategoryName(animal, customCategories)} ·{" "}
                        {formatAge(animal.birthDate)}
                      </span>
                      <span className="ml-auto shrink-0 truncate text-xs text-ink-soft">
                        {lotNameById.get(animal.lotId) ?? "Sem lote"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="min-h-11">
                  Cancelar
                </Button>
              </DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <CalvingForm
            key={dam.id}
            dam={dam}
            onRegistered={() => setOpen(false)}
            leadingAction={
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setDam(null)}
              >
                Trocar matriz
              </Button>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
