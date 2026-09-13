/**
 * Where a semen bull lives in the app and how a cobertura names it. The Touros
 * tab, the bull's page, the Coberturas list and the dam's ficha all read these,
 * so a bull reads and links the same everywhere.
 */
import type { Breeding, SemenBull } from "@/lib/types";

/** The Touros tab of Reprodução. */
export const TOUROS_TAB = "/reproducao?tab=touros";

/** Page of one semen bull. */
export function semenBullHref(bullId: string): string {
  return `/reproducao/touros/${bullId}`;
}

/** How a cobertura names its bull. */
export interface BullDisplay {
  /** The registered bull's name; otherwise the herd bull's ear tag or the semen code typed. */
  label: string;
  /** The registered bull's page; null when the cobertura names no registered bull. */
  href: string | null;
}

/**
 * The bull of a cobertura: a dose of a registered semen bull reads by the
 * bull's name and links to its page, since the stored `bullEarTag` is only the
 * code; any other bull keeps the tag it was recorded with.
 */
export function bullDisplay(
  breeding: Pick<Breeding, "bullEarTag" | "semenBullId">,
  semenBulls: SemenBull[]
): BullDisplay {
  const bull =
    breeding.semenBullId === undefined
      ? undefined
      : semenBulls.find((item) => item.id === breeding.semenBullId);
  return bull
    ? { label: bull.name, href: semenBullHref(bull.id) }
    : { label: breeding.bullEarTag, href: null };
}
