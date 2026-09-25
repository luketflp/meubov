"use client";

import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { ExtratoPage } from "@/components/finance/extrato/ExtratoPage";

// The filters live in the URL query, which useSearchParams reads inside a Suspense boundary.
export default function ExtratoRoute() {
  return (
    <RequireAccess area="finance" level="view">
      <Suspense fallback={null}>
        <ExtratoPage />
      </Suspense>
    </RequireAccess>
  );
}
