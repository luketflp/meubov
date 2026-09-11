import { ArrowRight } from "lucide-react";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { Button } from "@/components/ui/button";
import { NeloreMark } from "@/components/ui/nelore-mark";
import { Container, WhatsAppButton } from "@/components/landing/section";
import { WHATSAPP_TEXTS } from "@/lib/marketing/whatsapp";

export function Hero() {
  return (
    <Container className="py-8 md:py-14">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
        <div className="flex flex-col items-start gap-5">
          <h1 className="text-4xl leading-10 font-semibold text-ink text-pretty sm:text-5xl sm:leading-[52px]">
            Todo o seu rebanho de corte sob controle
          </h1>
          <p className="text-lg text-ink-soft text-pretty">
            Pesagens, GMD, calendário sanitário e cotação da arroba — em um só lugar, feito para
            a fazenda brasileira.
          </p>
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <AuthDialog initialMode="signup">
              <Button size="lg" className="min-h-11">
                <ArrowRight aria-hidden />
                Começar grátis
              </Button>
            </AuthDialog>
            <WhatsAppButton text={WHATSAPP_TEXTS.hero} />
          </div>
          <p className="text-[13px] leading-[18px] text-ink-soft">
            Grátis até 50 cabeças · sem cartão · importe sua planilha em minutos
          </p>
        </div>
        <div className="mx-auto aspect-[4/3] w-full max-w-xs lg:max-w-md">
          {/* Draws once (~2.7s) and freezes on the finished illustration. */}
          <NeloreMark className="h-full w-full" durationMs={4000} loop={false} />
        </div>
      </div>
    </Container>
  );
}
