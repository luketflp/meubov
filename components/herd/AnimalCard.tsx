import Link from "next/link";
import type { AnimalWithDerived } from "@/lib/store/selectors";
import { StatusPill } from "@/components/ui/status-pill";
import {
  CATEGORY_LABELS,
  formatFullWeight,
} from "@/components/herd/filters";

interface AnimalCardProps {
  item: AnimalWithDerived;
  lotName: string;
}

/** Animal card of the mobile list: the whole card navigates to the record. */
export function AnimalCard({ item, lotName }: AnimalCardProps) {
  const { animal, status, currentWeightKg } = item;

  return (
    <li>
      <Link
        href={`/herd/${animal.earTag}`}
        aria-label={`Abrir ficha do animal ${animal.earTag}`}
        className="flex min-h-11 flex-col gap-1.5 rounded-xl border border-hairline bg-panel p-4 transition-colors active:bg-surface"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-lg leading-none font-semibold text-ink">
            {animal.earTag}
          </span>
          <StatusPill status={status} withDot />
        </div>
        <p className="text-sm text-ink-soft">
          {CATEGORY_LABELS[animal.category]} · {animal.breed} · {lotName}
        </p>
        <p className="font-mono text-sm text-ink">{formatFullWeight(currentWeightKg)}</p>
      </Link>
    </li>
  );
}
