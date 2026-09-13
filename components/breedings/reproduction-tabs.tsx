/**
 * The three sections of the Reprodução screen — Coberturas, Touros and
 * Ultrassom — as links on the URL's `tab`, with the Calendário page's tab
 * anatomy. Coberturas is the bare path, so the old links still land on it.
 */
import Link from "next/link";
import { cn } from "@/lib/utils";

export type ReproductionTab = "coberturas" | "touros" | "ultrassom";

const BASE_PATH = "/nascimentos/reproducao";

const TABS: { tab: ReproductionTab; label: string; href: string }[] = [
  { tab: "coberturas", label: "Coberturas", href: BASE_PATH },
  { tab: "touros", label: "Touros", href: `${BASE_PATH}?tab=touros` },
  { tab: "ultrassom", label: "Ultrassom", href: `${BASE_PATH}?tab=ultrassom` },
];

/** The section a `tab` query value names; anything else is Coberturas. */
export function reproductionTab(value: string | string[] | undefined): ReproductionTab {
  return value === "touros" || value === "ultrassom" ? value : "coberturas";
}

export function ReproductionTabs({ active }: { active: ReproductionTab }) {
  return (
    <nav aria-label="Seções da reprodução" className="flex gap-1 border-b border-hairline">
      {TABS.map(({ tab, label, href }) => (
        <Link
          key={tab}
          href={href}
          scroll={false}
          aria-current={active === tab ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center border-b-2 px-3 py-2 text-sm font-medium transition-colors md:min-h-0",
            active === tab
              ? "border-brand text-brand"
              : "border-transparent text-ink-soft hover:text-ink"
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
