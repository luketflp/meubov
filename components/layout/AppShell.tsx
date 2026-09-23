"use client";

import { useEffect } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { PrintRoot } from "@/components/print/PrintRoot";
import { usePrintStore } from "@/lib/store/usePrintStore";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const loaded = useHerdStore((state) => state.loaded);
  const load = useHerdStore((state) => state.load);
  // While a list waits to print, the page under it stays off the paper.
  const printing = usePrintStore((state) => state.job !== null);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) {
    return <LoadingOverlay fullScreen message="Carregando dados do rebanho…" />;
  }

  return (
    <div className="min-h-dvh">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <main className={cn("pb-28 md:pb-10 md:pl-60 print:p-0", printing && "print:hidden")}>{children}</main>
      <div className="print:hidden">
        <MobileTabBar />
      </div>
      <PrintRoot />
    </div>
  );
}
