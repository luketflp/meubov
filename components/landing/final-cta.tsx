import { ArrowRight } from "lucide-react";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { Button } from "@/components/ui/button";
import { Container, WhatsAppButton } from "@/components/landing/section";
import { WHATSAPP_TEXTS } from "@/lib/marketing/whatsapp";

export function FinalCta() {
  return (
    <Container className="flex flex-col items-center gap-5 py-12 text-center md:py-20">
      <h2 className="max-w-2xl font-heading text-[28px] leading-[34px] font-semibold text-ink text-pretty md:text-3xl md:leading-10">
        Comece com o rebanho que você tem hoje
      </h2>
      <p className="max-w-lg text-base text-ink-soft text-pretty">
        Até 50 cabeças é grátis, para sempre. Quando o rebanho crescer, o plano cresce junto.
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
        <AuthDialog initialMode="signup">
          <Button size="lg" className="min-h-11">
            <ArrowRight aria-hidden />
            Criar conta grátis
          </Button>
        </AuthDialog>
        <WhatsAppButton text={WHATSAPP_TEXTS.hero} />
      </div>
    </Container>
  );
}
