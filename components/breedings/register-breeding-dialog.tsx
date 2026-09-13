"use client";

/**
 * "Registrar cobertura" on the Reprodução screen. Same write as the dam's
 * ficha — a breeding on her reproduction record — but reached from the screen
 * instead of the mother's record, so the dam is picked here first.
 *
 * Two steps in one dialog: choose the matriz with {@link DamPicker}, then fill
 * {@link BreedingForm}. Every open starts back on the picker — the next
 * cobertura is rarely on the same cow.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import type { Animal } from "@/lib/types";
import { BreedingForm } from "@/components/animal/breeding-form";
import { DamPicker } from "@/components/animal/dam-picker";
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

export function RegisterBreedingDialog() {
  const [open, setOpen] = useState(false);
  const [dam, setDam] = useState<Animal | null>(null);

  function onOpenChange(next: boolean) {
    if (next) setDam(null);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="min-h-11">
          <Plus data-icon="inline-start" aria-hidden />
          Registrar cobertura
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar cobertura</DialogTitle>
          <DialogDescription>
            {dam === null
              ? "Escolha a matriz coberta. Só matrizes ativas aparecem aqui."
              : `Cobertura da matriz ${dam.earTag}. A previsão de parto sai 283 dias depois, quando o diagnóstico confirmar a prenhez.`}
          </DialogDescription>
        </DialogHeader>

        {dam === null ? (
          <div className="grid gap-3">
            <DamPicker onPick={setDam} />

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="min-h-11">
                  Cancelar
                </Button>
              </DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <BreedingForm
            key={dam.id}
            earTag={dam.earTag}
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
