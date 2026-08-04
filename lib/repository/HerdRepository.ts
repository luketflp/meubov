/**
 * Access port to the herd data.
 *
 * Production uses ApiHerdRepository (lib/repository/ApiHerdRepository.ts),
 * which loads HerdData from the Elysia herd API at /api/herd; useHerdStore is
 * the single consumption point.
 */
import type { HerdData } from "@/lib/types";

export interface HerdRepository {
  load(): Promise<HerdData>;
}
