import { TESTIMONIAL } from "@/components/landing/content";
import { Container } from "@/components/landing/section";
import { formatNumber } from "@/lib/domain/format";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** One real quote from a produtor; nothing renders until content.ts has one. */
export function Testimonial() {
  if (TESTIMONIAL === null) return null;
  const { quote, name, farm, city, heads } = TESTIMONIAL;
  return (
    <Container className="pt-2 pb-10 md:pb-16">
      <figure className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-6 md:px-10 md:py-8">
        <blockquote className="font-heading text-xl leading-7 font-semibold text-ink text-pretty md:text-2xl md:leading-[34px]">
          “{quote}”
        </blockquote>
        <figcaption className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-surface">
            {initials(name)}
          </span>
          <span className="flex flex-col">
            <span className="font-medium text-ink">{name}</span>
            <span className="text-xs text-ink-soft">
              {farm} · {city} · {formatNumber(heads)} cabeças
            </span>
          </span>
        </figcaption>
      </figure>
    </Container>
  );
}
