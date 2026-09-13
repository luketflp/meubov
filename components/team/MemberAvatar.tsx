import { getInitials } from "@/lib/auth/user";
import { cn } from "@/lib/utils";

export function MemberAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand",
        className
      )}
    >
      {getInitials(name)}
    </span>
  );
}
