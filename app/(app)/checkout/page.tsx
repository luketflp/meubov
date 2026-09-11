"use client";

/**
 * /checkout?plan=fazenda&interval=month — where a paid CTA on the homepage
 * lands after login. Until the assinaturas spec ships Stripe, the page shows
 * the chosen plan and closes the deal on WhatsApp (Pix or boleto by hand).
 * The card lives inside a Suspense boundary because it reads the search
 * params (Next prerenders the rest of the tree).
 */
import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, MessageCircle } from "lucide-react";
import {
  capLabel,
  formatPlanPrice,
  planById,
  priceFor,
  type BillingInterval,
} from "@/lib/domain/plans";
import { WHATSAPP_NUMBER, WHATSAPP_TEXTS, whatsappLink } from "@/lib/marketing/whatsapp";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";

function parseInterval(value: string | null): BillingInterval {
  return value === "year" ? "year" : "month";
}

function CheckoutCard() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = planById(params.get("plan") ?? "");
  const interval = parseInterval(params.get("interval"));
  // The free tier and unknown ids have nothing to buy: back to the app.
  const sellable = plan !== null && plan.id !== "curral";

  useEffect(() => {
    if (!sellable) router.replace("/dashboard");
  }, [sellable, router]);

  if (plan === null || !sellable) return null;

  const price = priceFor(plan, interval);
  const href = whatsappLink(WHATSAPP_NUMBER, WHATSAPP_TEXTS.checkout(plan.name, interval));
  const period = interval === "year" ? "/ano" : "/mês";

  return (
    <SectionCard title={`Assinar ${plan.name}`}>
      <div className="flex flex-col gap-4">
        <p className="font-mono text-[28px] leading-9 font-semibold text-ink">
          {price === null ? "Sob medida" : formatPlanPrice(price)}
          {price !== null ? (
            <span className="text-sm font-normal text-ink-soft"> {period}</span>
          ) : null}
        </p>
        <p className="font-medium text-ink">{capLabel(plan)}</p>
        <ul className="flex flex-col gap-2">
          {plan.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm text-ink">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-soft">
          A assinatura pelo cartão dentro do app chega em breve.
          {href !== null ? " Enquanto isso, fechamos pelo WhatsApp, com Pix ou boleto." : ""}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {href !== null ? (
            <Button asChild size="lg" className="min-h-11">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                Assinar pelo WhatsApp
              </a>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="lg" className="min-h-11">
            <Link href="/dashboard">Voltar ao painel</Link>
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8">
      <Suspense fallback={null}>
        <CheckoutCard />
      </Suspense>
    </div>
  );
}
