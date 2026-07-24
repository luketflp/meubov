import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Heading level for the card title. Defaults to `"h2"`; pass `"h1"` when the
   * card holds the page's primary heading (e.g. the login/signup screens, which
   * have no other heading above them).
   */
  titleAs?: "h1" | "h2";
}

export function SectionCard({
  title,
  action,
  children,
  className,
  titleAs: Heading = "h2",
}: SectionCardProps) {
  return (
    <section className={cn("rounded-lg border border-hairline bg-panel", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <Heading className="font-heading text-base font-semibold text-ink">{title}</Heading>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
