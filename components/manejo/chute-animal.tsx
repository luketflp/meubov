"use client";

/**
 * The animal in the brete, open for correction on the spot: "Editar animal"
 * opens the same dialog as the animal's page — brinco, categoria, raça,
 * nascimento, lote, pesagens and the baixa. A save keeps the operator on the
 * session with the weight typed so far; a baixa goes through the session, so
 * the animal also leaves the queue as a pulado and the next one comes in.
 * Editing an animal is Rebanho edit, so without it the brete offers no button.
 */
import { Pencil } from "lucide-react";
import type { Animal } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { EditAnimalDialog } from "@/components/animal/EditAnimalDialog";
import { Button } from "@/components/ui/button";

/** "Nelore", or "sem raça" for an animal registered without one. */
export function breedLabel(animal: Animal): string {
  return animal.breed.trim() === "" ? "sem raça" : animal.breed;
}

interface ChuteEditAnimalProps {
  sessionId: string;
  animal: Animal;
  /** After a save, with the ear tag the animal now has (a rename keeps it in the brete). */
  onSaved: (earTag: string) => void;
  /** After a baixa took the animal out of the queue. */
  onBaixa: () => void;
}

/** "Editar animal" beside the brete's info line. */
export function ChuteEditAnimal({ sessionId, animal, onSaved, onBaixa }: ChuteEditAnimalProps) {
  const baixaManejoAnimal = useHerdStore((s) => s.baixaManejoAnimal);
  const canEditHerd = useCan("herd", "edit");
  if (!canEditHerd) return null;

  return (
    <EditAnimalDialog
      animal={animal}
      onSaved={onSaved}
      onBaixa={async (input) => {
        const done = await baixaManejoAnimal(sessionId, animal.earTag, input);
        if (done) onBaixa();
        return done;
      }}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 text-brand md:min-h-0"
        >
          <Pencil aria-hidden />
          Editar animal
        </Button>
      }
    />
  );
}
