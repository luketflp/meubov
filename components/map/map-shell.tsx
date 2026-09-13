"use client";

/**
 * The map screen's frame: the satellite surface, the chrome that is always
 * true (address search, overflow menu), and a slot where the current route
 * puts its panel.
 *
 * Rendered from the map's layout, which Next keeps mounted across every child
 * route, so walking the setup steps never remounts Leaflet, never refetches a
 * tile and never drops a trace in progress.
 *
 * Layering: the map is the page. The overlay above it is inert
 * (`pointer-events-none`) so pans, pinches and taps reach the tiles, and each
 * panel turns pointer events back on for itself. `isolate` traps Leaflet's
 * z-index 200-1000 panes inside this wrapper — without it they paint over
 * every dialog and toast in the app.
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";
import { roundCoordinate, type Ring } from "@/lib/domain/geo";
import { undrawnInvernadas } from "@/lib/domain/mapSetup";
import { CoordinatesDialog } from "@/components/map/coordinates-dialog";
import { MapMenu } from "@/components/map/map-menu";
import { PlaceSearch } from "@/components/map/place-search";
import { SaveBoundaryDialog } from "@/components/map/save-boundary-dialog";
import { useMapFlow } from "@/components/map/map-flow-provider";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { useToast } from "@/components/providers/Toasts";

const MapCanvas = dynamic(
  () => import("@/components/map/map-canvas").then((m) => m.MapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-surface text-sm text-ink-soft">
        Carregando mapa…
      </div>
    ),
  }
);

export function MapShell({ children }: { children: React.ReactNode }) {
  const farm = useHerdStore((s) => s.farm);
  const invernadas = useHerdStore((s) => s.invernadas);
  const saveHeadquarters = useHerdStore((s) => s.saveHeadquarters);
  const canEditLots = useCan("lots", "edit");
  const { mapRef, searchInputRef, goToPlace } = useMapFlow();
  const { addToast } = useToast();

  const [savingHeadquarters, setSavingHeadquarters] = useState(false);
  const [typingCoordinates, setTypingCoordinates] = useState(false);
  /** A ring typed from coordinates, waiting to be assigned to an invernada. */
  const [pendingRing, setPendingRing] = useState<Ring | null>(null);

  /** Saves the current viewport as the sede, so the map reopens right here. */
  async function onSaveHeadquarters() {
    const map = mapRef.current;
    if (!map) return;
    const { lat, lng } = map.getCenter();
    setSavingHeadquarters(true);
    try {
      // Same precision the outlines are stored at; the extra digits Leaflet
      // hands out are far below what any of this can mean.
      await saveHeadquarters({
        lat: roundCoordinate(lat),
        lng: roundCoordinate(lng),
        zoom: Math.round(map.getZoom()),
      });
      addToast({
        messageType: "success",
        text: "Sede salva. O mapa vai abrir nesta vista.",
      });
    } catch {
      // Store already surfaced the failure.
    } finally {
      setSavingHeadquarters(false);
    }
  }

  return (
    <div className="relative isolate h-[calc(100dvh-7rem)] w-full overflow-hidden md:h-[calc(100dvh-2.5rem)]">
      <MapCanvas />

      <div className="pointer-events-none absolute inset-0 z-[1200] flex flex-col gap-3 p-3">
        <div className="flex items-start gap-2">
          {/* Finding the farm by address beats panning satellite tiles by hand. */}
          <div className="pointer-events-auto w-full max-w-sm rounded-lg bg-panel/95 shadow-md backdrop-blur-sm">
            <PlaceSearch onSelect={goToPlace} inputRef={searchInputRef} />
          </div>
          {/* Both menu items write (a typed outline, the sede): a reader gets the pill. */}
          {canEditLots ? (
            <div className="pointer-events-auto ml-auto">
              <MapMenu
                hasHeadquarters={farm.headquarters !== undefined}
                savingHeadquarters={savingHeadquarters}
                onSaveHeadquarters={onSaveHeadquarters}
                onTypeCoordinates={() => setTypingCoordinates(true)}
              />
            </div>
          ) : (
            <div className="ml-auto shrink-0 self-center rounded-md shadow-md">
              <ReadOnlyPill />
            </div>
          )}
        </div>

        {children}
      </div>

      {/* Typed points join the same save flow a trace uses. */}
      <CoordinatesDialog
        open={typingCoordinates}
        onOpenChange={setTypingCoordinates}
        onParsed={(ring) => {
          setTypingCoordinates(false);
          setPendingRing(ring);
        }}
      />

      {/* Mounted per entry, so each one opens on a clean form. */}
      {pendingRing ? (
        <SaveBoundaryDialog
          ring={pendingRing}
          targetInvernadas={undrawnInvernadas(invernadas)}
          onSaved={() => setPendingRing(null)}
          onCancel={() => setPendingRing(null)}
        />
      ) : null}
    </div>
  );
}
