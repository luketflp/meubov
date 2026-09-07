"use client";

/**
 * "Registrar parto" dialog on the dam's ficha, where the mother is already
 * known. The form itself lives in {@link CalvingForm}, shared with the
 * Nascimentos screen — which opens the same form after picking a dam.
 */
import { useState } from "react";
import { Baby } from "lucide-react";
import type { Animal } from "@/lib/types";
import { CalvingForm } from "@/components/animal/calving-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface RegisterCalvingDialogProps {
  dam: Animal;
}

export function RegisterCalvingDialog({ dam }: RegisterCalvingDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 md:min-h-0">
          <Baby data-icon="inline-start" aria-hidden />
          Parto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar parto</DialogTitle>
          <DialogDescription>
            Parto da matriz {dam.earTag}. O bezerro entra no rebanho já cadastrado,
            com nascimento na data do parto.
          </DialogDescription>
        </DialogHeader>

        <CalvingForm
          dam={dam}
          onRegistered={() => setOpen(false)}
          leadingAction={
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Cancelar
              </Button>
            </DialogClose>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
