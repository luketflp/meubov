/**
 * Public landing page at "/".
 *
 * The only page an anonymous visitor sees (proxy.ts lets "/" through and
 * redirects signed-in users to /dashboard). A marketing page with one primary
 * action repeated down the page — "Criar conta grátis" — and WhatsApp as the
 * second door: hero, the farms that use the platform, three steps, six
 * features, a testimonial once there is a real one, the questions people ask
 * before signing up, a final call and the footer. The plans are written
 * (components/landing/pricing.tsx) but stay off the page until billing exists.
 * Server component; the AuthDialog islands are the only client code,
 * NeloreMark and the marquee animate via CSS.
 */
import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/landing-header";
import { Hero } from "@/components/landing/hero";
import { FarmsMarquee } from "@/components/landing/farms-marquee";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Features } from "@/components/landing/features";
import { Testimonial } from "@/components/landing/testimonial";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/landing-footer";

export const metadata: Metadata = {
  title: "MeuBov — Gestão de rebanho bovino de corte",
  description:
    "Controle pesagens, GMD, calendário sanitário e cotação da arroba do seu rebanho de corte. Feito para fazendas brasileiras. Grátis até 50 cabeças.",
  openGraph: {
    title: "MeuBov — Gestão de rebanho bovino de corte",
    description:
      "Controle pesagens, GMD, calendário sanitário e cotação da arroba do seu rebanho de corte. Feito para fazendas brasileiras. Grátis até 50 cabeças.",
    type: "website",
    locale: "pt_BR",
    siteName: "MeuBov",
  },
};

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <LandingHeader />
      <main className="flex flex-1 flex-col">
        <Hero />
        <FarmsMarquee />
        <HowItWorks />
        <Features />
        <Testimonial />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
