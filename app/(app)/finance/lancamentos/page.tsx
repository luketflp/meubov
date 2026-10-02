"use client";

import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { LancamentosPage } from "@/components/finance/lancamentos/LancamentosPage";

// The nó, the window and the filters live in the URL query, which useSearchParams reads inside a Suspense boundary.
export default function LancamentosRoute() {
  return (
    <RequireAccess area="finance" level="view">
      <Suspense fallback={null}>
        <LancamentosPage />
      </Suspense>
    </RequireAccess>
  );
}
