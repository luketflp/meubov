"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { activeAnimals } from "@/lib/store/selectors";
import { formatNumber } from "@/lib/domain/format";
import { useTemporaryMessage } from "./useTemporaryMessage";

/** Chips of the registered breeds with usage count and add/remove. */
export function RegisteredBreeds() {
  const breeds = useHerdStore((s) => s.breeds);
  const animals = useHerdStore((s) => s.animals);
  const addBreed = useHerdStore((s) => s.addBreed);
  const removeBreed = useHerdStore((s) => s.removeBreed);
  const [name, setName] = useState("");
  const [error, showError] = useTemporaryMessage(3000);

  const active = activeAnimals(animals);
  const usageCount = (breed: string) => active.filter((a) => a.breed === breed).length;

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim();
    if (clean === "") return;
    addBreed(clean);
    setName("");
  }

  function onRemove(breed: string) {
    if (!removeBreed(breed)) {
      showError("Raça em uso — não é possível remover");
    }
  }

  return (
    <SectionCard title="Raças cadastradas">
      <div className="flex flex-wrap gap-2">
        {breeds.map((breed) => (
          <Badge
            key={breed}
            variant="secondary"
            className="h-auto min-h-11 gap-1.5 rounded-md px-3 text-sm md:min-h-6 md:px-2.5 md:text-xs"
          >
            {breed}
            <span className="font-mono text-ink-soft">{formatNumber(usageCount(breed))}</span>
            <button
              type="button"
              onClick={() => onRemove(breed)}
              aria-label={`Remover raça ${breed}`}
              className="-mr-1.5 inline-flex min-h-11 min-w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-overdue md:min-h-5 md:min-w-5"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </Badge>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-overdue">{error}</p> : null}
      <form onSubmit={onAdd} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nova raça"
          aria-label="Nome da nova raça"
          className="sm:max-w-56"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={name.trim() === ""}
          className="min-h-11 md:min-h-0"
        >
          Adicionar
        </Button>
      </form>
    </SectionCard>
  );
}
