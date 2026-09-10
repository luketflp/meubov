"use client";

/**
 * The end of the walk: what the farm now has on the map, and the two ways out.
 *
 * It says the numbers back rather than "pronto!" — the point of the flow was
 * the outlines, so the outlines are what it reports, and a farm that skipped
 * some is told so instead of being congratulated for finishing.
 */
import Link from "next/link";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { ringAreaHectares } from "@/lib/domain/geo";
import { boundaryProgress, SETUP_ROUTE } from "@/lib/domain/mapSetup";
import { formatNumber } from "@/lib/domain/format";
import { Button } from "@/components/ui/button";
import {
  MapPanel,
  MapPanelActions,
  MapPanelHeader,
} from "@/components/map/map-panel";

export default function SetupDonePage() {
  const invernadas = useHerdStore((s) => s.invernadas);
  const { drawn, total } = boundaryProgress(invernadas);
  const missing = total - drawn;

  const mappedHectares = invernadas.reduce(
    (sum, invernada) =>
      invernada.boundary ? sum + ringAreaHectares(invernada.boundary) : sum,
    0
  );

  return (
    <MapPanel>
      <MapPanelHeader
        eyebrow="Mapa da fazenda"
        title={
          missing === 0
            ? "Fazenda mapeada"
            : missing === 1
              ? "Falta 1 invernada"
              : `Faltam ${missing} invernadas`
        }
        description={
          drawn === 0
            ? "Nenhum contorno salvo ainda. Você pode desenhar quando quiser."
            : `${drawn} ${drawn === 1 ? "invernada contornada" : "invernadas contornadas"} · ${formatNumber(mappedHectares, 1)} ha desenhados no mapa.`
        }
      />
      <MapPanelActions>
        <Button asChild className="min-h-11">
          <Link href="/map">Ver o mapa</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={`${SETUP_ROUTE}/invernada/nova`}>Contornar outra</Link>
        </Button>
      </MapPanelActions>
    </MapPanel>
  );
}
