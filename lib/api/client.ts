/**
 * Eden Treaty client for the herd API (browser only).
 *
 * The import of HerdApi is type-only, so no Elysia/server code enters the
 * client bundle. Same-origin requests carry the Better Auth session cookie.
 *
 * parseDate: false — the domain speaks "YYYY-MM-DD" strings; without it Eden
 * revives every date-looking string in responses into a Date object.
 */
import { treaty } from "@elysiajs/eden";
import type { HerdApi } from "@/lib/api/app";

export const api = treaty<HerdApi>(
  typeof window === "undefined" ? "http://localhost:3000" : window.location.origin,
  { parseDate: false }
).api.herd;
