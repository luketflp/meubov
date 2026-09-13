"use client";

/**
 * "Registrar cobertura" dialog on the female's ficha, where the dam is already
 * known. The form itself lives in {@link BreedingForm}, shared with the
 * Reprodução screen — which opens the same form after picking a dam.
 *
 * The fields start fresh on every open: the dialog content unmounts when it
 * closes, so the form's state is rebuilt with it.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { BreedingForm } from "@/components/animal/breeding-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface RegisterBreedingDialogProps {
  earTag: string;
}

export function RegisterBreedingDialog({ earTag }: RegisterBreedingDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 md:min-h-0">
          <Plus data-icon="inline-start" aria-hidden />
          Cobertura
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar cobertura</DialogTitle>
          <DialogDescription>
            Cobertura da matriz {earTag}. A previsão de parto sai 283 dias depois,
            quando o diagnóstico confirmar a prenhez.
          </DialogDescription>
        </DialogHeader>

        <BreedingForm earTag={earTag} onRegistered={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
