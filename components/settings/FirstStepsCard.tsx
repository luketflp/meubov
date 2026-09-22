"use client";

/**
 * Primeiros passos: what a farm with no animal still needs, at the top of
 * Configurações. Each step is done because the data says so, and the card is
 * gone with the first animal — a farm that already has a herd never sees it.
 * Step 1 stays on this page: it scrolls to the Invernadas card below. The
 * sede and the outlines wait for the map's own guided setup.
 */
import Link from "next/link";
import { ArrowRight, Check, Plus, type LucideIcon } from "lucide-react";
import type { FirstStepId } from "@/lib/domain/farms";
import { can } from "@/lib/domain/permissions";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { INVERNADAS_SECTION_ID, NEW_INVERNADA_CODE_ID } from "./LotsPaddocks";
import { useFirstSteps } from "./useFirstSteps";

interface StepCopy {
  title: string;
  hint: string;
  action: string;
  /** Where the action goes; null for a step done on this page. */
  href: string | null;
  icon: LucideIcon;
  /** The area whose Editar the action needs. */
  area: "lots" | "herd";
  primary?: boolean;
}

const STEPS: Record<FirstStepId, StepCopy> = {
  invernada: {
    title: "Cadastre as invernadas",
    hint: "Dê um código a cada pasto. O contorno no mapa pode vir depois.",
    action: "Cadastrar invernada",
    href: null,
    icon: Plus,
    area: "lots",
  },
  animal: {
    title: "Cadastre os animais",
    hint: "Um a um, vários de um padrão ou pela planilha.",
    action: "Ir para o Rebanho",
    href: "/herd",
    icon: ArrowRight,
    area: "herd",
    primary: true,
  },
};

/** Brings the Invernadas card into view and puts the cursor in the new invernada's Código. */
function goToNewInvernada() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(INVERNADAS_SECTION_ID)
    ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  document.getElementById(NEW_INVERNADA_CODE_ID)?.focus({ preventScroll: true });
}

export function FirstStepsCard() {
  const steps = useFirstSteps();
  const permissions = useActivePermissions();

  if (steps === null) return null;

  const done = steps.filter((step) => step.done).length;

  return (
    <SectionCard title={`Primeiros passos (${done} de ${steps.length})`}>
      <ol className="grid gap-5 md:grid-cols-2 md:gap-6">
        {steps.map((step, index) => {
          const copy = STEPS[step.id];
          const buttonClass = "min-h-11 w-full md:min-h-0 md:w-auto";
          const variant = copy.primary ? "default" : "outline";
          return (
            <li key={step.id} className="flex min-w-0 flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                {step.done ? (
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-healthy-soft"
                  >
                    <Check className="size-3.5 text-healthy" />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-panel font-mono text-xs text-ink-soft"
                  >
                    {index + 1}
                  </span>
                )}
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium", step.done ? "text-ink-soft" : "text-ink")}>
                    {copy.title}
                  </p>
                  <p className="mt-0.5 text-xs text-pretty text-ink-soft">{copy.hint}</p>
                </div>
              </div>
              <div className="pl-[34px]">
                {step.done ? (
                  <span className="text-[13px] font-medium text-healthy">Feito</span>
                ) : !can(permissions, copy.area, "edit") ? null : copy.href === null ? (
                  <Button
                    type="button"
                    variant={variant}
                    className={buttonClass}
                    onClick={goToNewInvernada}
                  >
                    <copy.icon aria-hidden />
                    {copy.action}
                  </Button>
                ) : (
                  <Button asChild variant={variant} className={buttonClass}>
                    <Link href={copy.href}>
                      <copy.icon aria-hidden />
                      {copy.action}
                    </Link>
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
