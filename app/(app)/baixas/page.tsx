"use client";

/**
 * Baixas screen: the animals that left the herd by morte, perda or another
 * reason, reached from the Painel's "Evolução do rebanho". The sales are in
 * the manejo history, where each venda keeps its value.
 */
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BaixasList } from "@/components/baixas/baixas-list";
import { BaixasExport } from "@/components/baixas/baixas-export";

// The Motivo filter lives in the URL query, which useSearchParams reads inside a Suspense boundary.
export default function BaixasPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Baixas"
        subtitle="Mortes, perdas e outras saídas do rebanho que não foram venda"
        actions={
          <Suspense fallback={null}>
            <BaixasExport />
          </Suspense>
        }
      />
      <Suspense fallback={null}>
        <BaixasList />
      </Suspense>
    </div>
  );
}
