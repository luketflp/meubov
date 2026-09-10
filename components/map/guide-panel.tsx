"use client";

/**
 * The invitation on the operational map: what the farm is still missing, and
 * the one button that starts fixing it.
 *
 * It appears because the data says so — no sede saved, or invernadas with no
 * outline — so it leaves on its own when the last fence is traced and comes
 * back by itself when a new invernada is registered. "Agora não" hides it for
 * this visit only.
 */
import Link from "next/link";
import { Compass, Fence, MapPin } from "lucide-react";
import type { MapSetupStep } from "@/lib/domain/mapSetup";
import { stepHref } from "@/lib/domain/mapSetup";
import { Button } from "@/components/ui/button";
import { MapPanel, MapPanelActions, MapPanelHeader } from "@/components/map/map-panel";

/** Copy per step: the same three facts — where you are, why, what to press. */
function guideCopy(
  step: MapSetupStep,
  remaining: number
): { icon: typeof Compass; title: string; description: string; cta: string } {
  switch (step.kind) {
    case "headquarters":
      return {
        icon: Compass,
        title: "Vamos encontrar sua fazenda",
        description:
          "O mapa ainda não sabe onde ela fica, por isso abriu num ponto qualquer. Comece marcando a sede.",
        cta: "Encontrar minha fazenda",
      };
    case "first-invernada":
      return {
        icon: Fence,
        title: "Contorne sua primeira invernada",
        description:
          "Nenhuma invernada cadastrada ainda. Percorra a cerca no mapa e cadastre a área ao terminar.",
        cta: "Contornar invernada",
      };
    case "invernada":
      return {
        icon: MapPin,
        title:
          remaining === 1
            ? "Falta 1 invernada sem contorno"
            : `Faltam ${remaining} invernadas sem contorno`,
        description:
          "Sem o contorno, a invernada não aparece no mapa e fica de fora da cor de lotação.",
        cta: "Continuar de onde parei",
      };
  }
}

export function GuidePanel({
  step,
  remaining,
  drawn,
  total,
  onDismiss,
}: {
  step: MapSetupStep;
  /** Invernadas still to trace, skips excluded. */
  remaining: number;
  drawn: number;
  total: number;
  onDismiss: () => void;
}) {
  const { icon: Icon, title, description, cta } = guideCopy(step, remaining);

  return (
    <MapPanel aria-labelledby="map-guide-title">
      <div className="flex gap-3">
        <span
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div id="map-guide-title">
            <MapPanelHeader title={title} description={description} />
          </div>

          {total > 0 ? (
            <p className="mt-3 font-mono text-xs text-ink-soft">
              {drawn} de {total} invernadas contornadas
            </p>
          ) : null}

          <MapPanelActions>
            <Button asChild className="min-h-11">
              <Link href={stepHref(step)}>{cta}</Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onDismiss}
              className="min-h-11 text-ink-soft"
            >
              Agora não
            </Button>
          </MapPanelActions>
        </div>
      </div>
    </MapPanel>
  );
}

/** The collapsed guide: one tap to bring the flow back after "Agora não". */
export function GuidePill({ step, remaining }: { step: MapSetupStep; remaining: number }) {
  const label =
    step.kind === "headquarters"
      ? "Marcar a sede"
      : step.kind === "first-invernada"
        ? "Contornar invernada"
        : remaining === 1
          ? "Falta 1 contorno"
          : `Faltam ${remaining} contornos`;

  return (
    <div className="pointer-events-auto mt-auto">
      <Button asChild variant="outline" className="min-h-11 bg-panel/95 shadow-md backdrop-blur-sm">
        <Link href={stepHref(step)}>
          <Compass aria-hidden />
          {label}
        </Link>
      </Button>
    </div>
  );
}
