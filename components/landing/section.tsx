/**
 * The three shapes every homepage section shares, so each section file is
 * only its copy: the centered container, the band (optionally on the surface
 * tone) and the eyebrow/heading/lead stack. WhatsAppButton renders nothing
 * without a configured number.
 */
import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { WHATSAPP_NUMBER, whatsappLink } from "@/lib/marketing/whatsapp";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-5xl px-6", className)}>{children}</div>;
}

interface SectionProps {
  id?: string;
  /** Paint the band on the surface tone with hairlines above and below. */
  band?: boolean;
  className?: string;
  children: ReactNode;
}

export function Section({ id, band = false, className, children }: SectionProps) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-6", band && "border-y border-hairline bg-surface")}
    >
      <Container className={cn("py-10 md:py-16", className)}>{children}</Container>
    </section>
  );
}

interface SectionHeadProps {
  eyebrow: string;
  title: string;
  lead?: string;
  align?: "center" | "start";
}

export function SectionHead({ eyebrow, title, lead, align = "center" }: SectionHeadProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5",
        align === "center" ? "items-center text-center" : "items-start"
      )}
    >
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-brand">{eyebrow}</p>
      <h2 className="max-w-3xl font-heading text-[28px] leading-[34px] font-semibold text-ink text-pretty md:text-3xl md:leading-10">
        {title}
      </h2>
      {lead ? <p className="max-w-2xl text-base text-ink-soft text-pretty">{lead}</p> : null}
    </div>
  );
}

interface WhatsAppButtonProps {
  text: string;
  label?: string;
  className?: string;
}

/** Outline "Falar no WhatsApp" link, or nothing when no number is configured. */
export function WhatsAppButton({
  text,
  label = "Falar no WhatsApp",
  className,
}: WhatsAppButtonProps) {
  const href = whatsappLink(WHATSAPP_NUMBER, text);
  if (href === null) return null;
  return (
    <Button asChild variant="outline" size="lg" className={cn("min-h-11", className)}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <MessageCircle aria-hidden />
        {label}
      </a>
    </Button>
  );
}
