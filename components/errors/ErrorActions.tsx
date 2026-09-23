"use client";

/**
 * The buttons the error screens share: back to the Painel, back one page, and
 * try again. Big enough for a thumb on the phone, regular on the desktop.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LayoutDashboard, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const SIZE = "h-12 px-4 text-sm sm:h-10";

export function DashboardButton({ primary = false }: { primary?: boolean }) {
  return (
    <Button asChild variant={primary ? "default" : "outline"} className={SIZE}>
      <Link href="/dashboard">
        <LayoutDashboard aria-hidden />
        Ir para o Painel
      </Link>
    </Button>
  );
}

export function BackButton() {
  const router = useRouter();
  return (
    <Button type="button" variant="outline" className={SIZE} onClick={() => router.back()}>
      <ArrowLeft aria-hidden />
      Voltar
    </Button>
  );
}

export function RetryButton({ onRetry, pending = false }: { onRetry: () => void; pending?: boolean }) {
  return (
    <Button type="button" className={SIZE} onClick={onRetry} disabled={pending}>
      <RotateCw aria-hidden className={pending ? "animate-spin" : undefined} />
      Tentar de novo
    </Button>
  );
}
