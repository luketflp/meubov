import {
  Beef,
  CalendarDays,
  CircleDollarSign,
  LayoutDashboard,
  Map,
  Syringe,
  type LucideIcon,
} from "lucide-react";
import { Section, SectionHead } from "@/components/landing/section";

const FEATURES: readonly { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: LayoutDashboard,
    title: "Painel do rebanho",
    description: "GMD, lotação e indicadores do rebanho em um só painel.",
  },
  {
    icon: Beef,
    title: "Ficha por animal",
    description: "Pesagens, histórico e reprodução de cada cabeça, pelo brinco.",
  },
  {
    icon: CalendarDays,
    title: "Calendário sanitário",
    description: "Vacinas, vermífugos e campanha de aftosa sem atraso.",
  },
  {
    icon: Syringe,
    title: "Manejo no brete",
    description: "Sessões de curral que ficam salvas, com cada passagem desfazível.",
  },
  {
    icon: Map,
    title: "Lotes e mapa",
    description: "Cada lote na sua invernada, com a lotação em UA/ha desenhada no mapa.",
  },
  {
    icon: CircleDollarSign,
    title: "Cotação da arroba",
    description: "Arroba do boi gordo atualizada e a margem na ponta do lápis.",
  },
];

export function Features() {
  return (
    <Section band className="flex flex-col gap-10">
      <SectionHead
        eyebrow="O que vem junto"
        title="Tudo que a fazenda de corte usa, sem módulo pago à parte"
        lead="Cada plano abre todas as telas. O que muda é o tamanho do rebanho e quantas pessoas entram."
      />
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-8">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <li key={title} className="flex flex-col gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Icon className="size-5" aria-hidden />
            </span>
            <p className="font-medium text-ink">{title}</p>
            <p className="text-sm text-ink-soft">{description}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
