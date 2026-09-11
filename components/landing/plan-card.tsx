import { Check } from "lucide-react";
import type { Plan } from "@/lib/domain/plans";
import { annualFreeMonths, capLabel, formatPlanPrice } from "@/lib/domain/plans";
import { WHATSAPP_NUMBER, WHATSAPP_TEXTS, whatsappLink } from "@/lib/marketing/whatsapp";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CTA_CLASS = "mt-auto w-full min-h-11 md:min-h-9";

/** Second line under the price: what the tier costs over a year, or who it is for. */
function priceNote(plan: Plan): string {
  if (plan.id === "consultor") {
    return "Vets, consultores, cooperativas e rebanhos acima de 2.000 cabeças.";
  }
  if (plan.yearlyBrl === null) return "Sem cartão, sem prazo.";
  return `ou ${formatPlanPrice(plan.yearlyBrl)}/ano — ${annualFreeMonths(plan)} meses grátis`;
}

function PlanCta({ plan }: { plan: Plan }) {
  if (plan.id === "curral") {
    return (
      <AuthDialog initialMode="signup">
        <Button variant="outline" className={CTA_CLASS}>
          Começar grátis
        </Button>
      </AuthDialog>
    );
  }
  if (plan.id === "consultor") {
    const href = whatsappLink(WHATSAPP_NUMBER, WHATSAPP_TEXTS.consultor);
    if (href !== null) {
      return (
        <Button asChild variant="outline" className={CTA_CLASS}>
          <a href={href} target="_blank" rel="noopener noreferrer">
            Falar no WhatsApp
          </a>
        </Button>
      );
    }
    return (
      <AuthDialog initialMode="signup">
        <Button variant="outline" className={CTA_CLASS}>
          Falar com a gente
        </Button>
      </AuthDialog>
    );
  }
  return (
    <AuthDialog initialMode="signup" next={`/checkout?plan=${plan.id}&interval=month`}>
      <Button variant={plan.highlighted ? "default" : "outline"} className={CTA_CLASS}>
        {plan.id === "fazenda" ? "Assinar Fazenda" : "Assinar Pro"}
      </Button>
    </AuthDialog>
  );
}

export function PlanCard({ plan }: { plan: Plan }) {
  const quoteOnly = plan.monthlyBrl === null;
  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-panel p-6",
        plan.highlighted ? "border-brand ring-1 ring-brand" : "border-hairline"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-xl font-semibold text-ink">{plan.name}</h3>
        {plan.highlighted ? (
          <span className="inline-flex h-5 items-center rounded-md bg-brand-soft px-2 text-[11px] font-medium text-brand">
            Mais escolhido
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <p
          className={cn(
            "font-mono leading-9 font-semibold text-ink",
            quoteOnly ? "text-[22px]" : "text-[28px]"
          )}
        >
          {quoteOnly ? "Sob medida" : formatPlanPrice(plan.monthlyBrl ?? 0)}
          {!quoteOnly && plan.monthlyBrl !== 0 ? (
            <span className="text-sm font-normal text-ink-soft"> /mês</span>
          ) : null}
          {plan.monthlyBrl === 0 ? (
            <span className="text-sm font-normal text-ink-soft"> para sempre</span>
          ) : null}
        </p>
        <p className="text-xs text-ink-soft">{priceNote(plan)}</p>
      </div>
      <p className="border-t border-hairline pt-3 font-medium text-ink">{capLabel(plan)}</p>
      <ul className="flex flex-col gap-2">
        {plan.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2 text-sm text-ink">
            <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <PlanCta plan={plan} />
    </article>
  );
}
