import Image from "next/image";
import { FARMS } from "@/components/landing/content";

/** Repeat the list until the marquee track has at least 8 logos per half. */
const FILLED_FARMS: readonly { name: string; logo: string }[] = Array.from(
  { length: Math.ceil(8 / FARMS.length) },
  () => FARMS
).flat();

/** One half of the marquee track; the duplicate half is aria-hidden. */
function FarmLogoSet({ hidden }: { hidden?: boolean }) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className="flex items-center gap-12 pr-12 md:gap-24 md:pr-24"
    >
      {FILLED_FARMS.map(({ name, logo }, i) => (
        <Image
          key={`${name}-${i}`}
          src={logo}
          alt={hidden || i > 0 ? "" : name}
          width={278}
          height={264}
          unoptimized
          className="h-14 w-auto shrink-0 object-contain opacity-60 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0 md:h-[5.5rem]"
        />
      ))}
    </div>
  );
}

export function FarmsMarquee() {
  return (
    <section aria-labelledby="farms-heading" className="flex flex-col gap-5 pt-2 pb-12">
      <h2
        id="farms-heading"
        className="text-center text-sm font-medium tracking-wide text-ink-soft"
      >
        Fazendas que confiam na plataforma
      </h2>
      <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        {/* Two identical halves + translateX(-50%) = seamless loop. */}
        <div className="flex w-max animate-marquee motion-reduce:animate-none hover:[animation-play-state:paused]">
          <FarmLogoSet />
          <FarmLogoSet hidden />
        </div>
      </div>
    </section>
  );
}
