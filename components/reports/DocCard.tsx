/**
 * A document of Relatórios: what it holds, who it is for, a fact from the
 * farm's data (never a stored "última geração") and the way in.
 */
import Link from "next/link";
import { ArrowRight, Send, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DocTone = "brand" | "scheduled" | "attention" | "healthy";

const TONE: Record<DocTone, string> = {
  brand: "bg-brand-soft text-brand",
  scheduled: "bg-scheduled-soft text-scheduled",
  attention: "bg-attention-soft text-attention",
  healthy: "bg-healthy-soft text-healthy",
};

export interface DocCardProps {
  href: string;
  icon: LucideIcon;
  tone: DocTone;
  title: string;
  text: string;
  /** Who the document is for. */
  audience: string;
  /** A fact derived from the data: "Última venda: 18/09/2026 · 24 cabeças". */
  fact: string;
  /** Shows the "valores em R$" tag. */
  money?: boolean;
}

export function DocCard({ href, icon: Icon, tone, title, text, audience, fact, money }: DocCardProps) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-hairline bg-panel p-4 md:p-[18px]">
      <div className="flex items-start gap-3">
        <span
          className={cn("flex size-9 shrink-0 items-center justify-center rounded-[9px] md:size-10", TONE[tone])}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-base font-semibold text-ink md:text-lg">{title}</h3>
            {money ? (
              <Badge variant="secondary" className="font-normal">
                valores em R$
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] leading-[19px] text-ink">{text}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-soft">
            <Send className="size-3.5 shrink-0" aria-hidden />
            {audience}
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-hairline pt-3">
        <span className="min-w-0 text-xs text-ink-soft">{fact}</span>
        <Button asChild variant="outline" className="min-h-11 md:min-h-8">
          <Link href={href} aria-label={`Gerar ${title}`}>
            <ArrowRight aria-hidden />
            Gerar
          </Link>
        </Button>
      </div>
    </article>
  );
}
