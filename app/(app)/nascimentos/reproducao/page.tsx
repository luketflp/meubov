"use client";

/**
 * Reprodução screen: every breeding on the farm with its pregnancy diagnosis
 * and the calving it forecasts, plus the two writes the dam's ficha already
 * has — a new cobertura (after picking the dam) and the diagnosis of a pending
 * one, straight from its row.
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BreedingsList } from "@/components/breedings/breedings-list";
import { RegisterBreedingDialog } from "@/components/breedings/register-breeding-dialog";

function BackLink() {
  return (
    <Link
      href="/nascimentos"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Nascimentos
    </Link>
  );
}

export default function ReproducaoPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <BackLink />
      <PageHeader
        title="Reprodução"
        subtitle="Coberturas das matrizes, o diagnóstico de prenhez e a previsão de parto"
        actions={<RegisterBreedingDialog />}
      />
      <BreedingsList />
    </div>
  );
}
