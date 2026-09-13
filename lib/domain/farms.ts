/**
 * Creating, listing and deleting farms: the rules the farm routes enforce and
 * the screens repeat, so no button is offered that the server would refuse.
 *
 * Node-safe and pure, shared by the use cases and the components.
 */
import type { FarmRole } from "@/lib/domain/permissions";
import type { Animal, FarmData, Invernada } from "@/lib/types";

/** Longest name or município a new farm accepts. */
export const FARM_FIELD_MAX = 80;

/** "Fazenda Boa Vista", or "Fazenda #12" for a farm that was never named. */
export function farmLabel(farm: { id: number; name: string }): string {
  return farm.name.trim() || `Fazenda #${farm.id}`;
}

export type NewFarmProblem =
  | "name_required"
  | "name_too_long"
  | "municipality_required"
  | "municipality_too_long";

export type NewFarmCheck =
  | { ok: true; name: string; municipality: string }
  | { ok: false; problem: NewFarmProblem };

/** Trims both fields and names the first one that cannot be saved. */
export function validateNewFarm(input: { name: string; municipality: string }): NewFarmCheck {
  const name = input.name.trim();
  const municipality = input.municipality.trim();
  if (name === "") return { ok: false, problem: "name_required" };
  if (name.length > FARM_FIELD_MAX) return { ok: false, problem: "name_too_long" };
  if (municipality === "") return { ok: false, problem: "municipality_required" };
  if (municipality.length > FARM_FIELD_MAX) return { ok: false, problem: "municipality_too_long" };
  return { ok: true, name, municipality };
}

export type DeleteVerdict = "ok" | "not_owner" | "last_farm";

/**
 * Only the Dono deletes, and never the last farm the account can open: nobody
 * is left with nothing, and the lazy first-farm creation never hands them an
 * empty farm behind their back.
 */
export function deleteVerdict(input: { role: FarmRole; liveFarmCount: number }): DeleteVerdict {
  if (input.role !== "owner") return "not_owner";
  if (input.liveFarmCount <= 1) return "last_farm";
  return "ok";
}

/** The delete confirmation: the farm's label typed again, case and outer spaces aside. */
export function confirmsFarmName(typed: string, label: string): boolean {
  const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
  return typed.trim() !== "" && normalize(typed) === normalize(label);
}

function counted(count: number, singular: string, plural: string): string | null {
  if (count === 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The hint under "Usar o cadastro da …": "Traz 8 raças, 3 categorias e 5
 * protocolos sanitários." Null when the open farm has nothing to copy, which
 * is what hides the switch.
 */
export function copySummary(counts: {
  breeds: number;
  categories: number;
  protocols: number;
}): string | null {
  const parts = [
    counted(counts.breeds, "raça", "raças"),
    counted(counts.categories, "categoria", "categorias"),
    counted(counts.protocols, "protocolo sanitário", "protocolos sanitários"),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
  return `Traz ${list}.`;
}

export type FirstStepId = "headquarters" | "invernada" | "animal";

export interface FirstStep {
  id: FirstStepId;
  done: boolean;
}

/**
 * The Primeiros passos of a farm, each done because the data says so — the
 * saved sede, a first invernada, a first animal — with no "onboarding done"
 * flag to go stale, the same idea as lib/domain/mapSetup.ts.
 */
export function firstSteps(
  farm: Pick<FarmData, "headquarters">,
  invernadas: readonly Invernada[],
  animals: readonly Animal[]
): FirstStep[] {
  return [
    { id: "headquarters", done: farm.headquarters !== undefined },
    { id: "invernada", done: invernadas.length > 0 },
    { id: "animal", done: animals.length > 0 },
  ];
}

/**
 * The card shows only while the farm has no animal at all, sold and dead
 * included, so a farm that already has a herd never sees it.
 */
export function showFirstSteps(animals: readonly Animal[]): boolean {
  return animals.length === 0;
}
