/**
 * Where a semen bull lives in the app and how a cobertura names it. The Touros
 * tab, the bull's page, the Coberturas list and the dam's ficha all read these,
 * so a bull reads and links the same everywhere. Also the one wording of a
 * count of doses, and the notice when the touros picked cannot cover the cows.
 */
import type { Breeding, SemenBull } from "@/lib/types";
import { formatNumber } from "@/lib/domain/format";

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

/** "dose" or "doses", agreeing with the count. */
export function dosesNoun(doses: number): string {
  return doses === 1 ? "dose" : "doses";
}

/** "1 dose", "1.200 doses". */
export function dosesLabel(doses: number): string {
  return `${formatNumber(doses)} ${dosesNoun(doses)}`;
}

/**
 * "Tufão da Serra tem 19 doses para 32 vacas. Escolha mais um touro ou pule as
 * últimas no brete." while the touros picked for an inseminação have fewer
 * doses together than cows; more than one bull reads "Os touros escolhidos
 * têm…". Null while the doses cover the cows, or with no touro picked.
 */
export function shortDosesMessage(names: string[], left: number, cows: number): string | null {
  if (names.length === 0 || cows <= left) return null;
  const who = names.length === 1 ? `${names[0]} tem` : "Os touros escolhidos têm";
  const cowsNoun = cows === 1 ? "vaca" : "vacas";
  return `${who} ${dosesLabel(left)} para ${formatNumber(cows)} ${cowsNoun}. Escolha mais um touro ou pule as últimas no brete.`;
}
