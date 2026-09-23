"use client";

/**
 * What every export needs to say about itself: the farm (for the print header
 * and the "Sobre" sheet), who generated it and when.
 */
import { useCallback } from "react";
import { authClient } from "@/lib/auth/client";
import { formatDate, toISO } from "@/lib/domain/dates";
import type { ExportContext } from "@/lib/export/table";
import { useHerdStore } from "@/lib/store/useHerdStore";
import type { PrintFarm } from "@/components/print/PrintSheet";

/** "22/09/2026 14:32" for now. */
function stamp(now: Date): string {
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(toISO(now))} ${time}`;
}

export function usePrintFarm(): PrintFarm {
  const farm = useHerdStore((s) => s.farm);
  const invernadas = useHerdStore((s) => s.invernadas);
  return {
    name: farm.name,
    municipality: farm.municipality,
    stateRegistration: farm.stateRegistration,
    hectares: invernadas.reduce((sum, inv) => sum + inv.hectares, 0),
  };
}

/** Builds the context at the moment of the export, so the stamp is the click's. */
export function useExportContext(): (filters?: string[]) => ExportContext {
  const farm = useHerdStore((s) => s.farm);
  const { data: session } = authClient.useSession();
  const userName = session?.user.name;
  return useCallback(
    (filters: string[] = []) => ({
      farmName: farm.name,
      place: farm.municipality,
      generatedAt: stamp(new Date()),
      userName: userName || undefined,
      filters,
    }),
    [farm.name, farm.municipality, userName]
  );
}
