"use client";

/**
 * Farm map route: satellite view with the lots as colored polygons.
 * The map component is client-only (Leaflet needs `window`), hence the
 * dynamic import with ssr disabled.
 */
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/layout/PageHeader";

const FarmMap = dynamic(
  () => import("@/components/map/farm-map").then((m) => m.FarmMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[55dvh] min-h-105 items-center justify-center rounded-lg border border-hairline bg-surface text-sm text-ink-soft">
        Carregando mapa…
      </div>
    ),
  }
);

export default function MapPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Mapa da fazenda"
        subtitle="Visão de satélite dos lotes, coloridos pela taxa de lotação"
      />
      <FarmMap />
    </div>
  );
}
