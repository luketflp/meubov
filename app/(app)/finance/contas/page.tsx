"use client";

import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { ContasPage } from "@/components/finance/contas/ContasPage";

// The window lives in the URL query, which useSearchParams reads inside a Suspense boundary.
export default function ContasRoute() {
  return (
    <RequireAccess area="finance" level="view">
      <Suspense fallback={null}>
        <ContasPage />
      </Suspense>
    </RequireAccess>
  );
}
