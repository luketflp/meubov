"use client";

import Link from "next/link";
import { Stethoscope, Syringe } from "lucide-react";
import type { Treatment } from "@/lib/types";
import { ULTRASOUND_HREF, ultrasoundBreteHref } from "@/components/breedings/ultrasound-parts";
import { RegisterManejoDialog } from "@/components/manejo/register-manejo-dialog";
import { Button } from "@/components/ui/button";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";

/**
 * The way from an inseminação or ultrassom reminder to the brete that records
 * it: the inseminação dialog with the agendamento's lotes picked, or the
 * ultrassom of its lote. Nothing for the other types.
 */
export function ReproShortcut({ treatments }: { treatments: Treatment[] }) {
  const animals = useHerdStore((state) => state.animals);
  const canStartInsemination = useCan("manejo", "edit");
  const [first] = treatments;
  if (first?.type !== "insemination" && first?.type !== "ultrasound") return null;

  const earTags = new Set(treatments.map((t) => t.animalEarTag));
  const lotIds = [
    ...new Set(animals.filter((a) => a.active && earTags.has(a.earTag)).map((a) => a.lotId)),
  ];

  if (first.type === "insemination") {
    if (!canStartInsemination) return null;
    return (
      <RegisterManejoDialog
        initialAction="insemination"
        initialLotIds={lotIds}
        trigger={
          <Button variant="outline" size="sm" className="min-h-11 md:min-h-0">
            <Syringe data-icon="inline-start" aria-hidden />
            Iniciar inseminação
          </Button>
        }
      />
    );
  }
  // The brete works one lote at a time; several lotes open the list instead.
  const oneLot = lotIds.length === 1;
  return (
    <Button asChild variant="outline" size="sm" className="min-h-11 md:min-h-0">
      <Link href={oneLot ? ultrasoundBreteHref(lotIds[0]) : ULTRASOUND_HREF}>
        <Stethoscope data-icon="inline-start" aria-hidden />
        {oneLot ? "Iniciar ultrassom" : "Abrir ultrassom"}
      </Link>
    </Button>
  );
}
