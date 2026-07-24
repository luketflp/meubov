"use client";

import { useEffect } from "react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

export function AppShell({ children }: { children: React.ReactNode }) {
  const loaded = useHerdStore((state) => state.loaded);
  const load = useHerdStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) {
    return <LoadingOverlay fullScreen message="Carregando dados do rebanho…" />;
  }

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <main className="pb-28 md:pb-10 md:pl-60">{children}</main>
      <MobileTabBar />
    </div>
  );
}
