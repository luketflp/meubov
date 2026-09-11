import { Syringe, TrendingUp, Upload, type LucideIcon } from "lucide-react";
import { Section, SectionHead } from "@/components/landing/section";

const STEPS: readonly { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Upload,
    title: "Importe sua planilha",
    description:
      "Traga o rebanho que você já controla no Excel — ou cadastre pelo brinco. Categoria, raça, lote e última pesagem entram de uma vez.",
  },
  {
    icon: Syringe,
    title: "Passe o gado no brete",
    description:
      "Vacina, vermífugo, pesagem, troca de lote, venda. Um animal por vez, no celular, com desfazer. A sessão fica salva se o sinal cair.",
  },
  {
    icon: TrendingUp,
    title: "Veja o GMD e a arroba na ponta do lápis",
    description:
      "Ganho médio diário, lotação em UA/ha e o valor do rebanho pela cotação do dia. O que precisa de atenção aparece antes de virar prejuízo.",
  },
];

export function HowItWorks() {
  return (
    <Section id="como-funciona" className="flex flex-col gap-10">
      <SectionHead
        eyebrow="Como funciona"
        title="Do Excel ao brete em três passos"
        lead="Nada de implantação de semanas. O rebanho entra hoje e o manejo de amanhã já sai no celular."
      />
      <ol className="grid gap-7 md:grid-cols-3 md:gap-10">
        {STEPS.map(({ icon: Icon, title, description }, i) => (
          <li key={title} className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="font-mono text-xs text-ink-soft">Passo {i + 1}</span>
            </div>
            <h3 className="font-heading text-xl font-semibold text-ink">{title}</h3>
            <p className="text-sm leading-[22px] text-ink-soft">{description}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
