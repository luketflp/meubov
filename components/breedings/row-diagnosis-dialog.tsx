"use client";

/**
 * "Lançar diagnóstico" from a row of the Coberturas screen, where the
 * cobertura is already known: {@link DiagnosisForm} gets it fixed, so the
 * picker the ficha's dialog shows gives way to a summary of that cobertura.
 * The write is the same as the ficha's.
 *
 * One trigger per layout of the list: a compact button in the table row, a
 * full-width one at the foot of the mobile card.
 *
 * The fields start fresh on every open: the dialog content unmounts when it
 * closes, so the form's state is rebuilt with it.
 */
import { useState } from "react";
import { Stethoscope } from "lucide-react";
import type { Animal, Breeding } from "@/lib/types";
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

interface RowDiagnosisDialogProps {
  dam: Animal;
  breeding: Breeding;
  /** "row" sits in a table cell; "card" spans the mobile card. */
  variant: "row" | "card";
}

export function RowDiagnosisDialog({ dam, breeding, variant }: RowDiagnosisDialogProps) {
  const [open, setOpen] = useState(false);
  // The breeding came out of the dam's record, so the record is always there;
  // the fallback only satisfies the optional type.
  const record = dam.reproduction ?? { breedings: [breeding], diagnoses: [], calvings: [] };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "row" ? (
          <Button variant="outline" size="sm" className="min-h-11 md:min-h-0">
            <Stethoscope data-icon="inline-start" aria-hidden />
            Diagnóstico
          </Button>
        ) : (
          <Button variant="outline" className="mt-3 min-h-11 w-full">
            Lançar diagnóstico
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar diagnóstico</DialogTitle>
          <DialogDescription>
            Resultado do toque ou ultrassom da matriz {dam.earTag}. Repetir o exame
            da mesma cobertura atualiza o resultado.
          </DialogDescription>
        </DialogHeader>

        <DiagnosisForm
          earTag={dam.earTag}
          record={record}
          breeding={breeding}
          onRegistered={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
