/**
 * HerdRepository backed by the herd API (Eden Treaty over /api/herd).
 *
 * A 401 means the session expired between the server-side gate and hydration;
 * the browser is sent back to the landing page to sign in again.
 */
import { toast } from "sonner";
import type { HerdData } from "@/lib/types";
import type { HerdRepository } from "@/lib/repository/HerdRepository";
import { api } from "@/lib/api/client";

export class ApiHerdRepository implements HerdRepository {
  async load(): Promise<HerdData> {
    const { data, error } = await api.get();
    if (error) {
      if (error.status === 401 && typeof window !== "undefined") {
        window.location.assign("/");
      } else {
        toast.error("Não foi possível carregar os dados do rebanho.");
      }
      throw new Error(`Failed to load herd data (status ${error.status})`);
    }
    return data as HerdData;
  }
}
