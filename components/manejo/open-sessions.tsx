"use client";

/**
 * "Manejos em andamento" cards: one per open session, with the chute-line
 * progress and a "Continuar" action into the session screen. Renders nothing
 * when there is no open session, so it can sit on the dashboard too.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate } from "@/lib/domain/dates";
import { SectionCard } from "@/components/ui/section-card";
import { ManejoProgressBar } from "@/components/manejo/progress-bar";
import { ManejoTypePill } from "@/components/manejo/manejo-type-pill";
import { sessionKind, sessionProgress } from "@/components/manejo/helpers";

export function OpenManejoSessions() {
  const sessions = useHerdStore((s) => s.manejoSessions);
  const open = sessions.filter((m) => m.status === "open");

  if (open.length === 0) return null;

  return (
    <SectionCard title="Manejos em andamento">
      <ul className="grid gap-3 sm:grid-cols-2">
        {open.map((session) => (
          <li key={session.id}>
            <Link
              href={`/manejo/${session.id}`}
              className="block rounded-lg border border-hairline bg-surface p-4 transition-colors hover:border-brand"
            >
              <div className="flex items-center justify-between gap-2">
                <ManejoTypePill action={sessionKind(session)} />
                <span className="font-mono text-xs text-ink-soft">
                  {formatDate(session.date)}
                </span>
              </div>
              <p className="mt-2 truncate text-sm font-medium text-ink">{session.name}</p>
              <ManejoProgressBar progress={sessionProgress(session)} className="mt-2" />
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand">
                Continuar
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
