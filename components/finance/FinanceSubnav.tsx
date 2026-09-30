import Link from "next/link";
import { periodSearch, type Period } from "@/lib/domain/period";
import { cn } from "@/lib/utils";

export type FinanceSection = "painel" | "extrato" | "contas";

/** The Financeiro pages; later cycles add Orçamento, Estoque, Patrimônio. */
const SECTIONS: readonly { key: FinanceSection; label: string; href: string }[] = [
  { key: "painel", label: "Painel", href: "/finance" },
  { key: "extrato", label: "Extrato", href: "/finance/extrato" },
  { key: "contas", label: "Contas bancárias", href: "/finance/contas" },
];

/**
 * Sub-navigation under the PageHeader of every Financeiro page: a tab row on
 * desktop, a row of pills that scrolls sideways on the phone. The window
 * (?de&ate) goes along. `current` comes from the page rather than
 * usePathname, which can mismatch on hydration behind the proxy.
 */
export function FinanceSubnav({ current, period }: { current: FinanceSection; period: Period }) {
  return (
    <nav aria-label="Seções do Financeiro" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <div className="flex w-max gap-2 md:w-auto md:gap-6 md:border-b md:border-hairline">
        {SECTIONS.map((section) => {
          const active = section.key === current;
          return (
            <Link
              key={section.key}
              href={`${section.href}?${periodSearch(period)}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap transition-colors",
                "md:-mb-px md:h-10 md:min-h-0 md:rounded-none md:border-0 md:border-b-2 md:px-0",
                active
                  ? "border-brand bg-brand-soft font-medium text-ink md:border-brand md:bg-transparent"
                  : "border-hairline bg-panel text-ink-soft hover:text-ink md:border-transparent md:bg-transparent"
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
