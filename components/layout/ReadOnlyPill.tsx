import { Eye } from "lucide-react";

/** Beside a page title when the user may read the area but not change it. */
export function ReadOnlyPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink-soft">
      <Eye className="size-3.5" aria-hidden />
      Somente leitura
    </span>
  );
}
