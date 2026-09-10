"use client";

/**
 * Everything under /map shares one Leaflet instance.
 *
 * Next keeps a layout mounted while the child route changes, so the map, its
 * tiles, the current viewport and any fence being traced survive every step of
 * the guided setup. That is the whole reason the flow is built as routes
 * instead of a modal: the steps are deep-linkable and the back button works,
 * and none of it costs a remount.
 *
 * Client Component on purpose — `ssr: false` (which the map needs, since
 * Leaflet touches `window`) is only valid inside one.
 */
import { MapFlowProvider } from "@/components/map/map-flow-provider";
import { MapShell } from "@/components/map/map-shell";

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <MapFlowProvider>
      <MapShell>{children}</MapShell>
    </MapFlowProvider>
  );
}
