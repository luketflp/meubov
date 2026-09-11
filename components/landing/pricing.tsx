import { Check, ShieldCheck, type LucideIcon } from "lucide-react";
import { PLANS } from "@/lib/domain/plans";
import { PlanCard } from "@/components/landing/plan-card";
import { Section, SectionHead } from "@/components/landing/section";

const NOTES: readonly { icon: LucideIcon; text: string }[] = [
  { icon: ShieldCheck, text: "30 dias de garantia: não viu valor, devolvemos" },
  { icon: Check, text: "Cartão no mensal · Pix, boleto ou cartão no anual" },
  {
    icon: Check,
    text: "Passou do limite? Você continua vendo tudo, só sobe de plano para cadastrar mais",
  },
];

export function Pricing() {
  return (
    <Section id="planos" className="flex flex-col gap-8">
      <SectionHead
        eyebrow="Planos"
        title="Preço na tabela, não no orçamento"
        lead="Cabeça é animal ativo: vendido e morto não contam. Sem taxa de implantação. Cancele quando quiser."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
      <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-[13px] leading-[18px] text-ink-soft">
        {NOTES.map(({ icon: Icon, text }) => (
          <li key={text} className="inline-flex items-center gap-1.5">
            <Icon className="size-4 shrink-0 text-brand" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
    </Section>
  );
}
