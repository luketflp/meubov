"use client";

/**
 * Primeiros passos: what a farm with no animal still needs, at the top of the
 * Painel. Each step is done because the data says so, and the card is gone with
 * the first animal — a farm that already has a herd never sees it.
 */
import Link from "next/link";
import { ArrowRight, Check, MapIcon, Plus, type LucideIcon } from "lucide-react";
import { firstSteps, showFirstSteps, type FirstStepId } from "@/lib/domain/farms";
import { stepHref } from "@/lib/domain/mapSetup";
import { can } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";

interface StepCopy {
  title: string;
  hint: string;
  action: string;
  href: string;
  icon: LucideIcon;
  /** The area whose Editar the action needs. */
  area: "lots" | "herd";
  primary?: boolean;
}

const STEPS: Record<FirstStepId, StepCopy> = {
  headquarters: {
    title: "Marque a sede no mapa",
    hint: "O mapa passa a abrir direto na fazenda.",
    action: "Abrir o mapa",
    href: stepHref({ kind: "headquarters" }),
    icon: MapIcon,
    area: "lots",
  },
  invernada: {
    title: "Cadastre as invernadas",
    hint: "Desenhe cada cerca e dê um código ao pasto.",
    action: "Cadastrar invernada",
    href: stepHref({ kind: "first-invernada" }),
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

export function FirstStepsCard() {
  const farm = useHerdStore((s) => s.farm);
  const invernadas = useHerdStore((s) => s.invernadas);
  const animals = useHerdStore((s) => s.animals);
  const permissions = useActivePermissions();

  if (!showFirstSteps(animals)) return null;
  if (!can(permissions, "lots", "edit") && !can(permissions, "herd", "edit")) return null;

  const steps = firstSteps(farm, invernadas, animals);
  const done = steps.filter((step) => step.done).length;

  return (
    <SectionCard title={`Primeiros passos (${done} de ${steps.length})`}>
      <ol className="grid gap-5 md:grid-cols-3 md:gap-6">
        {steps.map((step, index) => {
          const copy = STEPS[step.id];
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
                ) : can(permissions, copy.area, "edit") ? (
                  <Button
                    asChild
                    variant={copy.primary ? "default" : "outline"}
                    className="min-h-11 w-full md:min-h-0 md:w-auto"
                  >
                    <Link href={copy.href}>
                      <copy.icon aria-hidden />
                      {copy.action}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
