"use client";

import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { OrcamentoPage } from "@/components/finance/orcamento/OrcamentoPage";

// The safra and the window the sub-navigation carries live in the URL query, which useSearchParams reads inside a Suspense boundary.
export default function OrcamentoRoute() {
  return (
    <RequireAccess area="finance" level="view">
      <Suspense fallback={null}>
        <OrcamentoPage />
      </Suspense>
    </RequireAccess>
  );
}
