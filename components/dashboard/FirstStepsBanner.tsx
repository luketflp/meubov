"use client";

/**
 * The Painel's pointer to Primeiros passos, which live in Configurações: how
 * many steps are done, what is still missing, and the way there. It follows the
 * card's rules, so both go away with the first animal.
 */
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { missingStepsSentence } from "@/lib/domain/farms";
import { Button } from "@/components/ui/button";
import { useFirstSteps } from "@/components/settings/useFirstSteps";

export function FirstStepsBanner() {
  const steps = useFirstSteps();
  if (steps === null) return null;

  const done = steps.filter((step) => step.done).length;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-panel p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-brand-soft"
        >
          <ListChecks className="size-[18px] text-brand" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            Primeiros passos ({done} de {steps.length})
          </p>
          <p className="mt-0.5 text-xs text-pretty text-ink-soft">{missingStepsSentence(steps)}</p>
        </div>
      </div>
      <Button asChild className="min-h-11 w-full sm:min-h-9 sm:w-auto">
        <Link href="/settings">Continuar em Configurações</Link>
      </Button>
    </section>
  );
}
