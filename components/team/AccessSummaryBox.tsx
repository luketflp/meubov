import { AREA_LABEL, accessGroups, joinPt, type Permissions } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";

/**
 * Edita / Só vê / Sem acesso, one line each. `bare` drops the box when it sits
 * inside another surface (the convite dialog).
 */
export function AccessSummaryBox({
  permissions,
  bare = false,
}: {
  permissions: Permissions;
  bare?: boolean;
}) {
  const groups = accessGroups(permissions);
  const lines = [
    ["Edita", groups.edit],
    ["Só vê", groups.view],
    ["Sem acesso", groups.none],
  ] as const;
  return (
    <dl
      className={cn(
        "grid gap-1.5 text-[13px]",
        !bare && "rounded-lg border border-hairline bg-surface p-3"
      )}
    >
      {lines
        .filter(([, areas]) => areas.length > 0)
        .map(([label, areas]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-20 shrink-0 text-ink-soft">{label}</dt>
            <dd className="text-ink">{joinPt(areas.map((area) => AREA_LABEL[area]))}</dd>
          </div>
        ))}
    </dl>
  );
}
