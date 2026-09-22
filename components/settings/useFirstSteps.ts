"use client";

/**
 * The open farm's Primeiros passos, or null when neither the card in
 * Configurações nor the Painel banner should show: the farm already has an
 * animal, or the viewer can edit neither Lotes nor Rebanho.
 */
import { firstSteps, showFirstSteps, type FirstStep } from "@/lib/domain/farms";
import { can } from "@/lib/domain/permissions";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useActivePermissions } from "@/lib/store/usePermissions";

export function useFirstSteps(): FirstStep[] | null {
  const invernadas = useHerdStore((s) => s.invernadas);
  const animals = useHerdStore((s) => s.animals);
  const permissions = useActivePermissions();

  if (!showFirstSteps(animals)) return null;
  if (!can(permissions, "lots", "edit") && !can(permissions, "herd", "edit")) return null;
  return firstSteps(invernadas, animals);
}
