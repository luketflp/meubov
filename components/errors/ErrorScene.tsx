/**
 * The error screens' one layout: an ink scene with the brand Nelore, a short
 * label, a title in the farmer's words, what to do next and the actions.
 * The scenes are static SVGs in public/illustrations, drawn by
 * cli/illustrations/build.mjs.
 *
 * `hero` puts the text beside a large scene (the 404 outside the app);
 * `centered` stacks a smaller scene over centred text (inside the app, phone).
 */
import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export type ErrorSceneName = "pasto-404" | "catavento-erro" | "sem-sinal" | "porteira-fechada";

interface ErrorSceneProps {
  scene: ErrorSceneName;
  /** "Erro 404", "Sem conexão". */
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  /** A reference the farmer can read to support, such as the error digest. */
  code?: string;
  variant?: "hero" | "centered";
  className?: string;
}

export function ErrorScene({
  scene,
  eyebrow,
  title,
  description,
  actions,
  code,
  variant = "centered",
  className,
}: ErrorSceneProps) {
  const hero = variant === "hero";
  return (
    <section
      className={cn(
        "flex flex-col items-center gap-6",
        hero && "md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-center md:gap-12",
        className
      )}
    >
      <Image
        src={`/illustrations/${scene}.svg`}
        alt=""
        width={480}
        height={300}
        unoptimized
        priority
        className={cn("h-auto w-full", hero ? "max-w-xl md:order-2 md:max-w-none" : "max-w-md")}
      />
      <div
        className={cn(
          "flex max-w-md flex-col gap-3 text-center",
          hero && "md:order-1 md:max-w-lg md:text-left"
        )}
      >
        <p className="text-xs font-semibold tracking-[0.06em] text-ink-soft uppercase">{eyebrow}</p>
        <h1
          className={cn(
            "font-heading leading-tight font-semibold text-ink",
            hero ? "text-3xl md:text-[44px]" : "text-2xl md:text-3xl"
          )}
        >
          {title}
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-soft md:text-base">{description}</p>
        {actions ? (
          <div
            className={cn(
              "mt-2 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-center",
              hero && "md:justify-start"
            )}
          >
            {actions}
          </div>
        ) : null}
        {code ? <p className="mt-1 font-mono text-xs text-ink-soft">{code}</p> : null}
      </div>
    </section>
  );
}
