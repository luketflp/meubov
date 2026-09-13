/**
 * What the signed-in user may do on the active farm, for components: hide a
 * write they may not make, mark a page they may only read. The server enforces
 * the same levels; these hooks keep the UI from offering what it would refuse.
 */
import { can, type Area, type Level, type Permissions } from "@/lib/domain/permissions";
import { selectActivePermissions } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";

export function useActivePermissions(): Permissions {
  const farms = useHerdStore((state) => state.farms);
  const activeFarmId = useHerdStore((state) => state.activeFarmId);
  return selectActivePermissions(farms, activeFarmId);
}

export function useCan(area: Area, level: Level): boolean {
  return can(useActivePermissions(), area, level);
}
