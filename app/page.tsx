/**
 * Public landing page at "/".
 *
 * The only page an anonymous visitor sees (proxy.ts lets "/" through and
 * redirects signed-in users to /dashboard). One compact screen: header with
 * the wordmark and "Entrar", hero with the value prop and a single CTA to
 * /signup, four feature bullets mirroring the app's own nav icons, a marquee
 * of farms that use the platform (fictional placeholder names), footer.
 * Pure server component — no client JS; NeloreMark and the marquee animate
 * via CSS (`--animate-marquee` in globals.css).
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Beef, CalendarDays, CircleDollarSign, LayoutDashboard, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NeloreMark } from "@/components/ui/nelore-mark";

export const metadata: Metadata = {
  title: "MeuBov — Gestão de rebanho bovino de corte",
  description:
    "Controle pesagens, GMD, calendário sanitário e cotação da arroba do seu rebanho de corte. Feito para fazendas brasileiras. Crie sua conta.",
  openGraph: {
    title: "MeuBov — Gestão de rebanho bovino de corte",
    description:
      "Controle pesagens, GMD, calendário sanitário e cotação da arroba do seu rebanho de corte. Feito para fazendas brasileiras.",
    type: "website",
    locale: "pt_BR",
    siteName: "MeuBov",
  },
};

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: readonly Feature[] = [
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
    icon: CircleDollarSign,
    title: "Cotação da arroba",
    description: "Arroba do boi gordo atualizada e a margem na ponta do lápis.",
  },
];

/** Placeholder logos for the social-proof marquee (fictional farms, 280×80). */
const FARMS: readonly { name: string; logo: string }[] = [
  { name: "Fazenda Santa Helena", logo: "/farms/santa-helena.svg" },
  { name: "Agropecuária Boa Vista", logo: "/farms/boa-vista.svg" },
  { name: "Fazenda Três Lagoas", logo: "/farms/tres-lagoas.svg" },
  { name: "Rancho Ipê Amarelo", logo: "/farms/ipe-amarelo.svg" },
  { name: "Agro Vale do Araguaia", logo: "/farms/araguaia.svg" },
  { name: "Estância do Cerrado", logo: "/farms/cerrado.svg" },
  { name: "Fazenda Água Limpa", logo: "/farms/agua-limpa.svg" },
];

/** One half of the marquee track; the duplicate half is aria-hidden. */
function FarmLogoSet({ hidden }: { hidden?: boolean }) {
  return (
    <div aria-hidden={hidden || undefined} className="flex items-center gap-12 pr-12">
      {FARMS.map(({ name, logo }) => (
        <Image
          key={name}
          src={logo}
          alt={hidden ? "" : name}
          width={196}
          height={56}
          unoptimized
          className="h-14 w-auto shrink-0 object-contain opacity-60 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0"
        />
      ))}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <div>
          <p className="font-heading text-2xl font-semibold text-brand">MeuBov</p>
          <p className="hidden text-xs text-ink-soft sm:block">Gestão de rebanho de corte</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/login">Entrar</Link>
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-6 py-10">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-5">
            <h1 className="text-4xl font-semibold text-ink sm:text-5xl">
              Todo o seu rebanho de corte sob controle
            </h1>
            <p className="text-lg text-ink-soft">
              Pesagens, GMD, calendário sanitário e cotação da arroba — em um só
              lugar, feito para a fazenda brasileira.
            </p>
            <Button asChild size="lg">
              <Link href="/signup">Criar conta</Link>
            </Button>
          </div>
          <div className="mx-auto aspect-[4/3] w-full max-w-xs lg:max-w-md">
            <NeloreMark className="h-full w-full" />
          </div>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        <section aria-labelledby="farms-heading" className="flex flex-col gap-5">
          <h2
            id="farms-heading"
            className="text-center text-sm font-medium tracking-wide text-ink-soft"
          >
            Fazendas que confiam na plataforma
          </h2>
          <div
            className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
          >
            {/* Two identical halves + translateX(-50%) = seamless loop. */}
            <div className="flex w-max animate-marquee motion-reduce:animate-none hover:[animation-play-state:paused]">
              <FarmLogoSet />
              <FarmLogoSet hidden />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline px-6 py-4 text-center text-xs text-ink-soft">
        © 2026 MeuBov · Gestão de rebanho de corte
      </footer>
    </div>
  );
}
