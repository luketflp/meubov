"use client";

/**
 * Animal record (/herd/[earTag]): identification, weight evolution,
 * timeline, health history and reproduction (females).
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, SearchX } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { TODAY_ISO } from "@/lib/domain/dates";
import { animalByEarTag, withStatus, animalTreatments } from "@/lib/store/selectors";
import { EmptyState } from "@/components/ui/empty-state";
import { AnimalHeader } from "@/components/animal/AnimalHeader";
import { WeightEvolution } from "@/components/animal/WeightEvolution";
import { Timeline } from "@/components/animal/Timeline";
import { HealthHistory } from "@/components/animal/HealthHistory";
import { AnimalReproduction } from "@/components/animal/AnimalReproduction";

function BackLink() {
  return (
    <Link
      href="/herd"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Rebanho
    </Link>
  );
}

export default function AnimalRecordPage() {
  const params = useParams<{ earTag: string }>();
  const earTag = decodeURIComponent(params.earTag);

  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const lots = useHerdStore((s) => s.lots);

  const animal = animalByEarTag(animals, earTag);

  if (!animal) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8">
        <BackLink />
        <div className="rounded-lg border border-hairline bg-panel pb-8">
          <EmptyState
            icon={SearchX}
            title={`Brinco ${earTag} não encontrado`}
            description="Nenhum animal do rebanho usa este brinco. Verifique o número ou volte à lista."
          />
          <div className="flex justify-center">
            <Link
              href="/herd"
              className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-panel transition-colors hover:bg-brand/90"
            >
              Voltar ao rebanho
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const derived = withStatus([animal], treatments, TODAY_ISO)[0];
  const forAnimal = animalTreatments(treatments, animal.earTag);
  const lot = lots.find((l) => l.id === animal.lotId) ?? null;
  const reproductionRecord =
    animal.sex === "female" && animal.reproduction ? animal.reproduction : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8">
      <BackLink />

      <AnimalHeader derived={derived} lotName={lot?.name ?? null} />

      <WeightEvolution animal={animal} adg={derived.adg} />

      <div className="grid items-start gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <Timeline animal={animal} treatments={forAnimal} />
        </div>
        <div className="space-y-4 xl:col-span-3">
          <HealthHistory treatments={forAnimal} />
          {reproductionRecord ? <AnimalReproduction record={reproductionRecord} /> : null}
        </div>
      </div>
    </div>
  );
}
