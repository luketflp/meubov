"use client";

/**
 * Moving through the guided setup.
 *
 * The next step is recomputed from the store at the moment of the call, never
 * captured when the page rendered: a step ends by writing to the store (a sede
 * saved, an outline attached), and the whole point is to ask what is missing
 * *after* that write landed.
 */
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { MAP_ROUTE, SETUP_ROUTE, nextStep, stepHref } from "@/lib/domain/mapSetup";
import { useMapFlow } from "@/components/map/map-flow-provider";

export function useSetupNavigation() {
  const router = useRouter();
  const { skipped } = useMapFlow();

  /** Goes to whatever is still missing, or to the closing screen. */
  const goToNextStep = useCallback(() => {
    const { farm, invernadas } = useHerdStore.getState();
    const step = nextStep(farm, invernadas, skipped);
    router.push(step ? stepHref(step) : `${SETUP_ROUTE}/done`);
  }, [router, skipped]);

  /** Leaves the flow for the operational map. */
  const leaveSetup = useCallback(() => {
    router.push(MAP_ROUTE);
  }, [router]);

  return { goToNextStep, leaveSetup };
}
