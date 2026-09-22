"use client";

/**
 * The raça of the animal in the brete, and its correction on the spot: the
 * "Alterar raça" link opens a select of the farm's raças, and picking one saves
 * the animal at once — the chute pass itself (Concluir or Pular) is untouched,
 * and the weight typed so far stays. Saving an animal is Rebanho edit, so
 * without it the brete shows the raça only.
 */
import { useState } from "react";
import { Pencil } from "lucide-react";
import type { Animal } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { useToast } from "@/components/providers/Toasts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** "Nelore", or "sem raça" for an animal registered without one. */
export function breedLabel(animal: Animal): string {
  return animal.breed.trim() === "" ? "sem raça" : animal.breed;
}

/**
 * "Alterar raça" beside the brete's info line. Render it keyed by the ear tag,
 * so the select closes when the next animal enters the brete.
 */
export function ChuteBreed({ animal }: { animal: Animal }) {
  const breeds = useHerdStore((s) => s.breeds);
  const updateAnimal = useHerdStore((s) => s.updateAnimal);
  const canEditHerd = useCan("herd", "edit");
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!canEditHerd) return null;

  // A raça no longer registered (an imported one) stays selectable as it is.
  const options =
    animal.breed === "" || breeds.includes(animal.breed) ? breeds : [animal.breed, ...breeds];

  async function onPick(breed: string) {
    setSaving(true);
    try {
      await updateAnimal(animal.earTag, { breed });
      addToast({ messageType: "success", text: `Raça do ${animal.earTag}: ${breed}` });
    } catch {
      // The store already told the operator the save failed.
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={saving}
        className="min-h-11 text-brand md:min-h-0"
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden />
        Alterar raça
      </Button>
    );
  }

  return (
    <Select
      defaultOpen
      value={animal.breed === "" ? undefined : animal.breed}
      onValueChange={onPick}
      onOpenChange={(open) => {
        if (!open) setEditing(false);
      }}
    >
      <SelectTrigger
        aria-label={`Raça do animal ${animal.earTag}`}
        className="min-h-11 min-w-40 md:min-h-8"
      >
        <SelectValue placeholder="Selecione a raça" />
      </SelectTrigger>
      <SelectContent>
        {options.map((breed) => (
          <SelectItem key={breed} value={breed}>
            {breed}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
