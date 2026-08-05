/**
 * Eden Treaty client for the herd API (browser only).
 *
 * The import of HerdApi is type-only, so no Elysia/server code enters the
 * client bundle. Same-origin requests carry the Better Auth session cookie.
 *
 * parseDate: false — the domain speaks "YYYY-MM-DD" strings; without it Eden
 * revives every date-looking string in responses into a Date object.
 *
 * The headers function runs per request, so the x-farm-id of the selected farm
 * (see lib/api/activeFarm.ts) applies to every call without touching call
 * sites; when unset, the server picks the user's default farm.
 */
import { treaty } from "@elysiajs/eden";
import type { HerdApi } from "@/lib/api/app";
import { getActiveFarmId } from "@/lib/api/activeFarm";

export const api = treaty<HerdApi>(
  typeof window === "undefined" ? "http://localhost:3000" : window.location.origin,
  {
    parseDate: false,
    headers: () => {
      const farmId = getActiveFarmId();
      if (farmId !== null) return { "x-farm-id": String(farmId) };
    },
  }
).api.herd;
