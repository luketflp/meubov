/**
 * Access port to the herd data.
 *
 * Production uses ApiHerdRepository (lib/repository/ApiHerdRepository.ts),
 * which loads HerdData from the Elysia herd API at /api/herd; useHerdStore is
 * the single consumption point.
 */
import type { HerdData } from "@/lib/types";

export interface HerdRepository {
  /**
   * `quiet` skips the error toast: the first load shows a screen of its own
   * when it fails, so the toast would only repeat it.
   */
  load(options?: { quiet?: boolean }): Promise<HerdData>;
}
