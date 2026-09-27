/**
 * What the service worker shows for a page it never kept, without signal.
 * Outside the (app) group: it needs no session, and the proxy lets it through
 * signed out so the worker can keep a copy when it installs.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { BrandBar } from "@/components/errors/BrandBar";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Sem conexão · MeuBov" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas px-4 py-5 md:px-20 md:py-10">
      <BrandBar />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
        <WifiOff aria-hidden className="size-10 text-ink-soft" />
        <h1 className="max-w-sm font-heading text-2xl leading-tight font-semibold text-ink">
          Sem conexão. Abra Manejo para continuar um brete.
        </h1>
        <Button asChild className="h-12 px-4 text-sm sm:h-10">
          <Link href="/manejo">Ir para Manejo</Link>
        </Button>
      </div>
    </main>
  );
}
