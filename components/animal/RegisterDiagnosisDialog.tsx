"use client";

/**
 * "Lançar diagnóstico" dialog on the female's ficha, where the cobertura is
 * picked inside the form. The form itself lives in {@link DiagnosisForm},
 * shared with the Reprodução screen — which opens it from a row with the
 * breeding already fixed.
 *
 * The fields start fresh on every open: the dialog content unmounts when it
 * closes, so the form's state is rebuilt with it.
 */
import { useState } from "react";
import { Stethoscope } from "lucide-react";
import type { ReproductionRecord } from "@/lib/types";
import { DiagnosisForm } from "@/components/animal/diagnosis-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface RegisterDiagnosisDialogProps {
  earTag: string;
  record: ReproductionRecord;
}

export function RegisterDiagnosisDialog({ earTag, record }: RegisterDiagnosisDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 md:min-h-0">
          <Stethoscope data-icon="inline-start" aria-hidden />
          Diagnóstico
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar diagnóstico</DialogTitle>
          <DialogDescription>
            Resultado do toque ou ultrassom da matriz {earTag}. Repetir o exame da
            mesma cobertura atualiza o resultado.
          </DialogDescription>
        </DialogHeader>

        <DiagnosisForm earTag={earTag} record={record} onRegistered={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
