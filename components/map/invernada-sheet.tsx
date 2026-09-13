"use client";

/**
 * The summary that opens when an invernada is tapped: its numbers, the lots on
 * it right now, and the two things you can do to its outline. The page leaves
 * both out for whoever may only read Lotes e Mapa, and their buttons go with them.
 *
 * It exists only while something is selected. That is the point of the redesign
 * — the old screen kept an empty "Selecione uma invernada" card on a farm that
 * had no invernadas to select, telling the farmer to use a list that was not
 * there.
 */
import Link from "next/link";
import { MapPin, Trash2, X } from "lucide-react";
import type { InvernadaWithSummary } from "@/lib/store/selectors";
import { ringAreaHectares } from "@/lib/domain/geo";
import { formatArroba, formatKg, formatNumber } from "@/lib/domain/format";
import { kgToArroba } from "@/lib/domain/weights";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { MapPanel, MapPanelActions } from "@/components/map/map-panel";
import { invernadaLabel } from "@/components/map/invernada-label";

export function InvernadaSheet({
  summary,
  busy,
  onRedraw,
  onClearBoundary,
  onClose,
}: {
  summary: InvernadaWithSummary;
  /** True while its outline is being erased. */
  busy?: boolean;
  /** Omitted for a reader; the "Redesenhar" button renders only with it. */
  onRedraw?: () => void;
  /** Omitted for a reader; the "Apagar contorno" button renders only with it. */
  onClearBoundary?: () => void;
  onClose: () => void;
}) {
  const { invernada, lots, headCount, totalWeightKg, auPerHa, classification } = summary;
  const lotNames = lots.map((lot) => lot.name).join(", ");

  return (
    <MapPanel aria-labelledby="invernada-sheet-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="invernada-sheet-title"
          className="font-heading text-base font-semibold text-ink"
        >
          {invernadaLabel(invernada)}
        </h2>
        <StatusPill status={classification} withDot />
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar resumo"
          className="ml-auto flex size-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <dl className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <dt className="text-ink-soft">Capim</dt>
          <dd className="text-ink">{invernada.grass}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <dt className="text-ink-soft">Área</dt>
          <dd className="font-mono text-ink">
            {formatNumber(invernada.hectares)} ha
            {invernada.boundary ? (
              <span className="text-xs text-ink-soft">
                {" "}
                · {formatNumber(ringAreaHectares(invernada.boundary), 1)} ha no mapa
              </span>
            ) : null}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-2 sm:col-span-2 sm:justify-start">
          <dt className="shrink-0 text-ink-soft">Lotes atuais</dt>
          <dd className="text-right text-ink sm:text-left">
            {lotNames === "" ? "Nenhum lote nesta invernada" : lotNames}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <dt className="text-ink-soft">Cabeças</dt>
          <dd className="font-mono text-ink">{formatNumber(headCount)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <dt className="text-ink-soft">Peso total</dt>
          <dd className="font-mono text-ink">
            {formatKg(totalWeightKg)} · {formatArroba(kgToArroba(totalWeightKg))}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2 sm:col-span-2 sm:justify-start">
          <dt className="text-ink-soft">Taxa de lotação</dt>
          <dd className="font-mono font-medium text-ink">
            {formatNumber(auPerHa, 2)} UA/ha
          </dd>
        </div>
      </dl>

      <MapPanelActions>
        {onRedraw ? (
          <Button
            type="button"
            variant="outline"
            onClick={onRedraw}
            disabled={busy}
            className="min-h-11"
          >
            <MapPin aria-hidden />
            Redesenhar
          </Button>
        ) : null}
        {onClearBoundary ? (
          <Button
            type="button"
            variant="outline"
            onClick={onClearBoundary}
            disabled={busy}
            className="min-h-11 text-ink-soft hover:text-overdue"
          >
            <Trash2 aria-hidden />
            {busy ? "Apagando…" : "Apagar contorno"}
          </Button>
        ) : null}
        <Button asChild variant="ghost" className="ml-auto min-h-11">
          <Link href="/lots">Ver lotes</Link>
        </Button>
      </MapPanelActions>
    </MapPanel>
  );
}
