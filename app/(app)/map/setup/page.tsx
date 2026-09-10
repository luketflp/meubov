"use client";

/**
 * Entry point of the guided setup: sends the farmer to whatever is actually
 * missing.
 *
 * It renders nothing of its own on purpose. "Continuar" from the guide, a
 * bookmark, a link in a message — all land here, and all should end up on the
 * first real step rather than on a screen whose only content is another button.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { SETUP_ROUTE, nextStep, stepHref } from "@/lib/domain/mapSetup";
import { useMapFlow } from "@/components/map/map-flow-provider";

export default function MapSetupPage() {
  const router = useRouter();
  const farm = useHerdStore((s) => s.farm);
  const invernadas = useHerdStore((s) => s.invernadas);
  const { skipped } = useMapFlow();

  useEffect(() => {
    const step = nextStep(farm, invernadas, skipped);
    // `replace`, not `push`: this route is a signpost, and the back button
    // should return to the map the farmer came from, not bounce off it again.
    router.replace(step ? stepHref(step) : `${SETUP_ROUTE}/done`);
  }, [farm, invernadas, router, skipped]);

  return null;
}
