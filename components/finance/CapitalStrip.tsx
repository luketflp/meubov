import Link from "next/link";
import { ChevronRight, HandCoins, PiggyBank, Tractor, Users, type LucideIcon } from "lucide-react";
import { nodeParam, type CapitalSummary, type PlanNode } from "@/lib/domain/planTree";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { periodSearch, type Period } from "@/lib/domain/period";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

const LABEL = "text-[11px] font-medium tracking-wide text-ink-soft uppercase";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Cell {
  label: string;
  value: number;
  sub: string;
  /** The nó the figure opens in Lançamentos. */
  node: PlanNode;
  icon: LucideIcon;
  tile: string;
}

interface CapitalStripProps {
  summary: CapitalSummary;
  period: Period;
  /** Resultado of the window: the retiradas read as a share of it while it is positive. */
  resultBrl: number;
}

/**
 * "Capital, dívidas e sócios": what moved outside the custo and the resultado,
 * each figure opening its nó in Lançamentos. Nothing while all four are zero.
 */
export function CapitalStrip({ summary, period, resultBrl }: CapitalStripProps) {
  const s = summary;
  if (s.invested === 0 && s.applications === 0 && s.debt === 0 && s.withdrawn === 0) return null;

  const search = periodSearch(period);
  const next = s.nextInstallment;
  const cells: Cell[] = [
    {
      label: "Investido no período",
      value: s.invested,
      sub: `imobilizado ${formatNumber(s.investedAssets)} · gado ${formatNumber(s.investedCattle)}`,
      node: { type: "group", group: "investment" },
      icon: Tractor,
      tile: "bg-scheduled-soft text-scheduled",
    },
    {
      label: "Aplicações",
      value: s.applications,
      sub: `rendeu ${formatCurrency(s.yieldInPeriod)} no período`,
      node: { type: "banks" },
      icon: PiggyBank,
      tile: "bg-healthy-soft text-healthy",
    },
    {
      label: "Saldo devedor",
      value: s.debt,
      sub: [
        s.debtAccounts > 0 ? plural(s.debtAccounts, "conta", "contas") : null,
        next ? `próxima parcela ${formatDate(next.dueDate).slice(0, 5)}` : "sem parcela a pagar",
      ]
        .filter(Boolean)
        .join(" · "),
      node: { type: "group", group: "financing" },
      icon: HandCoins,
      tile: "bg-fmd-soft text-fmd",
    },
    {
      label: "Retirado pelos sócios",
      value: s.withdrawn,
      sub:
        resultBrl > 0
          ? `${formatNumber((s.withdrawn / resultBrl) * 100)} % do resultado do período`
          : "no período",
      node: { type: "group", group: "partners" },
      icon: Users,
      tile: "bg-surface text-ink-soft",
    },
  ];

  return (
    <SectionCard
      title="Capital, dívidas e sócios"
      subtitle="fora do custo e do resultado · cada número abre a conta em Lançamentos"
      className="overflow-hidden"
      bodyClassName="p-0"
      action={
        <Link
          href={`/finance/lancamentos?${search}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline md:min-h-0"
        >
          Ver lançamentos
        </Link>
      }
    >
      {/* Hairline-gapped cells as the caixa strip draws them; the tile and the chevron only where there is room. */}
      <ul className="grid grid-cols-2 gap-px bg-hairline lg:grid-cols-4">
        {cells.map(({ label, value, sub, node, icon: Icon, tile }) => (
          <li key={label} className="flex min-w-0">
            <Link
              href={`/finance/lancamentos?${search}&conta=${nodeParam(node)}`}
              className="flex min-w-0 flex-1 items-start gap-3 bg-panel px-4 py-3.5 transition-colors hover:bg-surface"
            >
              <span
                aria-hidden
                className={cn("hidden size-8 shrink-0 items-center justify-center rounded-[9px] xl:flex", tile)}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block", LABEL)}>{label}</span>
                <span className="mt-0.5 block truncate font-mono text-lg font-medium text-ink">
                  {formatCurrency(value)}
                </span>
                <span className="block text-[11px] leading-4 text-ink-soft">{sub}</span>
              </span>
              <ChevronRight aria-hidden className="mt-2 hidden size-4 shrink-0 text-ink-soft xl:block" />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
