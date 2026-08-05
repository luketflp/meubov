/**
 * HerdRepository backed by the herd API (Eden Treaty over /api/herd).
 *
 * A 401 means the session expired between the server-side gate and hydration;
 * the browser is sent back to the landing page to sign in again. A 403 means
 * the stored active-farm id is no longer accessible (membership revoked or
 * superuser removed from the allowlist); clearing it and reloading lands the
 * user back on their default farm instead of every request failing.
 */
import { toast } from "sonner";
import type { HerdData } from "@/lib/types";
import type { HerdRepository } from "@/lib/repository/HerdRepository";
import { api } from "@/lib/api/client";
import { clearActiveFarmId, getActiveFarmId } from "@/lib/api/activeFarm";

export class ApiHerdRepository implements HerdRepository {
  async load(): Promise<HerdData> {
    const { data, error } = await api.get();
    if (error) {
      if (error.status === 401 && typeof window !== "undefined") {
        window.location.assign("/");
      } else if (error.status === 403 && getActiveFarmId() !== null) {
        clearActiveFarmId();
        window.location.reload();
      } else {
        toast.error("Não foi possível carregar os dados do rebanho.");
      }
      throw new Error(`Failed to load herd data (status ${error.status})`);
    }
    return data as HerdData;
  }
}
