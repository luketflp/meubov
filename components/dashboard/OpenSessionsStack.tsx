"use client";

/**
 * The manejos still open, one card each, a tap away from the chute screen; on
 * a wide screen each is a strip across the Painel. Renders nothing when every
 * session is closed.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate } from "@/lib/domain/dates";
import { ManejoProgressBar } from "@/components/manejo/progress-bar";
import { manejoDetailHref, sessionProgress } from "@/components/manejo/helpers";
import { cn } from "@/lib/utils";

export function OpenSessionsStack({ className }: { className?: string }) {
  const sessions = useHerdStore((s) => s.manejoSessions);
  const open = sessions.filter((session) => session.status === "open");
  if (open.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {open.map((session) => (
        <Link
          key={session.id}
          href={manejoDetailHref(session.id)}
          className="block rounded-lg border border-brand bg-panel p-4 transition-colors hover:bg-surface lg:flex lg:items-center lg:gap-6 lg:py-3.5"
        >
          <div className="min-w-0 lg:w-72 lg:shrink-0">
            <div className="flex items-center justify-between gap-2 lg:justify-start">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="size-2 rounded-full bg-brand ring-4 ring-brand-soft" />
                <span className="text-[11px] font-semibold tracking-wider text-brand uppercase">
                  Manejo em andamento
                </span>
              </span>
              <span className="font-mono text-xs text-ink-soft">{formatDate(session.date)}</span>
            </div>
            <p className="mt-2 mb-2.5 truncate text-sm font-medium text-ink lg:mt-1 lg:mb-0">
              {session.name}
            </p>
          </div>
          <ManejoProgressBar progress={sessionProgress(session)} className="min-w-0 lg:flex-1" />
          <span className="mt-2.5 inline-flex items-center gap-1 text-sm font-medium text-brand lg:mt-0 lg:shrink-0">
            Continuar no brete
            <ArrowRight className="size-4" aria-hidden />
          </span>
        </Link>
      ))}
    </div>
  );
}
