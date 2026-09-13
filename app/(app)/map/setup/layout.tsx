"use client";

/**
 * Gate for the guided setup (/map/setup/*). Every step here writes (the sede,
 * an outline), so whoever may only read Lotes e Mapa is sent back to the map
 * instead of landing on a panel whose buttons the server would refuse.
 *
 * It renders nothing until the redirect lands, so no step page mounts and the
 * entry page never fires its own redirect first. It sits inside the map's
 * layout, so the shared Leaflet instance survives the trip. The AppShell only
 * renders once the farm list is loaded, so the levels read here are the real
 * ones, not the floors.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MAP_ROUTE } from "@/lib/domain/mapSetup";
import { useCan } from "@/lib/store/usePermissions";

export default function MapSetupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const canEditLots = useCan("lots", "edit");

  useEffect(() => {
    if (!canEditLots) router.replace(MAP_ROUTE);
  }, [canEditLots, router]);

  return canEditLots ? <>{children}</> : null;
}
