/**
 * Pure selectors for the Baixas screen: the animals that left the herd for a
 * reason other than a sale (the sales live in the manejo history).
 */
import type { Animal, InactiveReason } from "@/lib/types";

/** The Motivo filter; "mortes" joins mortes and perdas, as the Painel counts them. */
export type BaixaFilter = "todas" | "mortes" | "outras";

export const BAIXA_FILTER_ALL: BaixaFilter = "todas";

export const BAIXA_FILTER_LABEL: Record<BaixaFilter, string> = {
  todas: "Todos os motivos",
  mortes: "Mortes e perdas",
  outras: "Outras saídas",
};

const REASONS: Record<BaixaFilter, readonly InactiveReason[]> = {
  todas: ["death", "loss", "other"],
  mortes: ["death", "loss"],
  outras: ["other"],
};

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/** Reads the `motivo` query value; anything unknown shows every baixa. */
export function parseBaixaFilter(value: string | null): BaixaFilter {
  return value === "mortes" || value === "outras" ? value : BAIXA_FILTER_ALL;
}

/**
 * The inactive animals whose reason matches the filter, newest exit first. An
 * exit with no date (an old baixa) goes last; ties read by ear tag.
 */
export function recentBaixas(animals: Animal[], filter: BaixaFilter): Animal[] {
  const reasons = REASONS[filter];
  return animals
    .filter(
      (animal) =>
        !animal.active &&
        animal.inactiveReason !== undefined &&
        reasons.includes(animal.inactiveReason)
    )
    .sort((a, b) => {
      const dateA = a.inactiveDate ?? "";
      const dateB = b.inactiveDate ?? "";
      if (dateA !== dateB) return dateA < dateB ? 1 : -1;
      return collator.compare(a.earTag, b.earTag);
    });
}
