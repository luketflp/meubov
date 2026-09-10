"use client";

/**
 * "Registrar nascimento" on the Nascimentos screen. Same write as the dam's
 * ficha — a calving plus the calf entering the herd — but reached from the
 * screen instead of the mother's record, so the dam is picked here first.
 *
 * Two steps in one dialog: choose the matriz with {@link DamPicker}, then fill
 * {@link CalvingForm}.
 */
import { useState } from "react";
import { Baby } from "lucide-react";
import type { Animal } from "@/lib/types";
import { CalvingForm } from "@/components/animal/calving-form";
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

export function RegisterBirthDialog() {
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
