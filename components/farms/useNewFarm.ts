"use client";

/**
 * Everything the Nova fazenda dialog needs inside the app: the open farm's
 * setup to offer, and a submit that creates the farm, opens its Configurações
 * (where Primeiros passos wait) and says so. /convites wires the dialog by hand instead — no herd store runs there.
 */
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { copySummary, farmLabel } from "@/lib/domain/farms";
import { useHerdStore, type NewFarmInput } from "@/lib/store/useHerdStore";
import { NEW_FARM_DESCRIPTION, type CopySource } from "@/components/farms/NewFarmDialog";

export function useNewFarm(): {
  source: CopySource | null;
  description: string;
  onSubmit: (input: NewFarmInput) => Promise<void>;
} {
  const router = useRouter();
  const farms = useHerdStore((s) => s.farms);
  const activeFarmId = useHerdStore((s) => s.activeFarmId);
  const breeds = useHerdStore((s) => s.breeds.length);
  const categories = useHerdStore((s) => s.customCategories.length);
  const protocols = useHerdStore((s) => s.protocols.length);
  const createFarm = useHerdStore((s) => s.createFarm);

  const active = farms.find((farm) => farm.id === activeFarmId);
  const summary = copySummary({ breeds, categories, protocols });
  // A superuser viewing a farm they don't belong to has joinedAt null: there is
  // no membership to copy from, so the copy switch must not be offered.
  const source =
    active && active.joinedAt !== null && summary
      ? { label: farmLabel(active), summary, defaultOn: active.role === "owner" }
      : null;

  async function onSubmit(input: NewFarmInput) {
    await createFarm(input);
    toast.success(`${input.name.trim()} criada`);
    router.push("/settings");
  }

  return { source, description: NEW_FARM_DESCRIPTION, onSubmit };
}
