"use client";

import { useParams } from "next/navigation";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { ConciliarPage } from "@/components/finance/contas/ConciliarPage";

export default function ConciliarRoute() {
  const params = useParams<{ id: string; importId: string }>();
  return (
    <RequireAccess area="finance" level="view">
      <ConciliarPage key={params.importId} accountId={params.id} importId={params.importId} />
    </RequireAccess>
  );
}
