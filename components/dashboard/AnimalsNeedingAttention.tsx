import Link from "next/link";
import { CircleCheck } from "lucide-react";
import type { AnimalWithDerived } from "@/lib/store/selectors";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/components/dashboard/helpers";

interface AnimalsNeedingAttentionProps {
  /** Unhealthy animals, already with the overdue ones first (selector). */
  items: AnimalWithDerived[];
  compact?: boolean;
}

/** List of animals that require action, with the whole row clickable. */
export function AnimalsNeedingAttention({
  items,
  compact = false,
}: AnimalsNeedingAttentionProps) {
  return (
    <SectionCard title="Animais em atenção">
      {items.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Tudo em dia"
          description="Nenhum animal precisa de atenção no momento."
        />
      ) : (
        <ul className={cn("-my-1 divide-y divide-hairline", compact && "-my-0.5")}>
          {items.map(({ animal, status, reason }) => (
            <li key={animal.earTag}>
              <Link
                href={`/herd/${animal.earTag}`}
                className={cn(
                  "flex min-h-11 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-1 py-2.5 transition-colors hover:bg-surface",
                  compact && "py-1.5"
                )}
              >
                <span className="font-mono text-sm font-medium text-ink">
                  {animal.earTag}
                </span>
                <span className="text-sm text-ink-soft">
                  {categoryLabel(animal.category)}
                </span>
                <StatusPill status={status} className="ml-auto" />
                {reason ? (
                  <span className="w-full text-xs text-ink-soft">{reason}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
