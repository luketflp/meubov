"use client";

/**
 * "Iniciar inseminação" on the Reprodução screen. The inseminação is a manejo,
 * so this is the "Iniciar manejo" dialog opened straight in insemination mode:
 * pick the lote and the touro principal, then pass the cows at the brete.
 */
import { Syringe } from "lucide-react";
import { RegisterManejoDialog } from "@/components/manejo/register-manejo-dialog";
import { Button } from "@/components/ui/button";

/** Primary on the page header; `outline` where it sits inside an empty state. */
export function StartInseminationButton({
  variant = "default",
}: {
  variant?: "default" | "outline";
}) {
  return (
    <RegisterManejoDialog
      initialAction="insemination"
      trigger={
        <Button variant={variant} className="min-h-11">
          <Syringe data-icon="inline-start" aria-hidden />
          Iniciar inseminação
        </Button>
      }
    />
  );
}
