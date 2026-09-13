import { Badge } from "@/components/ui/badge";
import { roleLabel, type FarmRole, type MemberPreset } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";

/** Dono in outline, a preset in brand-soft, Personalizado on the paper surface. */
export function RoleBadge({ role, preset }: { role: FarmRole; preset: MemberPreset | null }) {
  const custom = role === "member" && (preset === null || preset === "personalizado");
  return (
    <Badge
      variant={role === "owner" ? "outline" : "secondary"}
      className={cn(custom && "border-hairline bg-surface text-ink")}
    >
      {roleLabel(role, preset)}
    </Badge>
  );
}
