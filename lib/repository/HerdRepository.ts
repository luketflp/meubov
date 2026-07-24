/**
 * Access port to the herd data.
 *
 * To swap the mock for a real backend, implement HerdRepository and inject the
 * new instance into useHerdStore (the single consumption point):
 * - REST: `load()` calls `fetch("/api/herd")` and returns the JSON typed
 *   as HerdData (dates already in ISO "YYYY-MM-DD").
 * - Supabase: inject the client, query the tables (animals, treatments,
 *   lots, movements, breeds, protocols, farm) and assemble the HerdData,
 *   converting timestamps to "YYYY-MM-DD".
 */
import type { HerdData } from "@/lib/types";
import { generateInitialData } from "@/lib/data/seed";

export interface HerdRepository {
  load(): Promise<HerdData>;
}

/** Simulated mock latency, so the UI exercises loading states. */
const LATENCY_MS = 150;

/** Mock implementation: delivers the deterministic seed after ~150 ms. */
export class MockHerdRepository implements HerdRepository {
  async load(): Promise<HerdData> {
    await new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));
    return generateInitialData();
  }
}
