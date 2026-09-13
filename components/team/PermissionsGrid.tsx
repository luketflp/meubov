"use client";

/**
 * One row per area with a Nada | Ver | Editar control in the PeriodPicker's
 * segmented shell. Levels below the floor and above the actor's own are
 * disabled; the brand dot marks an area that differs from `base`.
 */
import {
  AREAS,
  AREA_DESCRIPTION,
  AREA_LABEL,
  FLOORS,
  LEVELS,
  LEVEL_LABEL,
  atLeast,
  type Permissions,
} from "@/lib/domain/permissions";
import { ceilingNote } from "@/components/team/helpers";
import { cn } from "@/lib/utils";

interface PermissionsGridProps {
  value: Permissions;
  onChange: (next: Permissions) => void;
  /** The actor's own levels: nothing above them can be picked. */
  ceiling: Permissions;
  /** The preset the dots compare against; null draws none. */
  base: Permissions | null;
}

export function PermissionsGrid({ value, onChange, ceiling, base }: PermissionsGridProps) {
  return (
    <div className="divide-y divide-hairline rounded-lg border border-hairline">
      {AREAS.map((area) => {
        const note = ceilingNote(area, ceiling[area]);
        return (
          <div
            key={area}
            className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                {AREA_LABEL[area]}
                {base !== null && base[area] !== value[area] ? (
                  <span className="size-1.5 rounded-full bg-brand" aria-label="Diferente do papel" />
                ) : null}
              </p>
              <p className="text-xs text-ink-soft">{AREA_DESCRIPTION[area]}</p>
              {note ? <p className="mt-1 text-xs text-attention">{note}</p> : null}
            </div>
            <div
              role="radiogroup"
              aria-label={`Nível em ${AREA_LABEL[area]}`}
              className="flex w-full shrink-0 items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5 sm:w-auto"
            >
              {LEVELS.map((level) => {
                const selected = value[area] === level;
                const allowed = atLeast(level, FLOORS[area]) && atLeast(ceiling[area], level);
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!allowed}
                    onClick={() => onChange({ ...value, [area]: level })}
                    className={cn(
                      "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-[13px] transition-colors sm:min-h-7 sm:min-w-14 sm:flex-none",
                      selected
                        ? "bg-panel font-medium shadow-[0_0_0_1px_var(--color-hairline)]"
                        : "text-ink-soft hover:text-ink",
                      selected && (level === "edit" ? "text-brand" : "text-ink"),
                      !allowed && !selected && "opacity-35"
                    )}
                  >
                    {LEVEL_LABEL[level]}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
