"use client";

import { useCallback, useEffect, useState } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { PrintRoot } from "@/components/print/PrintRoot";
import { BrandBar } from "@/components/errors/BrandBar";
import { RetryButton } from "@/components/errors/ErrorActions";
import { ErrorScene } from "@/components/errors/ErrorScene";
import { LOAD_FAILURE, loadFailure, type LoadFailure } from "@/components/errors/load-failure";
import { usePrintStore } from "@/lib/store/usePrintStore";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const loaded = useHerdStore((state) => state.loaded);
  const load = useHerdStore((state) => state.load);
  // While a list waits to print, the page under it stays off the paper.
  const printing = usePrintStore((state) => state.job !== null);

  // A first load that fails (no signal, server down) says so instead of
  // spinning forever, and can be tried again from here.
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [retrying, setRetrying] = useState(false);
  const start = useCallback(
    () => load().catch(() => setFailure(loadFailure(navigator.onLine))),
    [load]
  );

  useEffect(() => {
    void start();
  }, [start]);

  if (!loaded && failure) {
    const copy = LOAD_FAILURE[failure];
    return (
      <main className="flex min-h-dvh flex-col bg-canvas px-4 py-5 md:px-20 md:py-10">
        <BrandBar />
        <div className="flex flex-1 items-center justify-center py-10">
          <ErrorScene
            {...copy}
            actions={
              <RetryButton
                pending={retrying}
                onRetry={() => {
                  setRetrying(true);
                  setFailure(null);
                  void start().finally(() => setRetrying(false));
                }}
              />
            }
          />
        </div>
      </main>
    );
  }

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
