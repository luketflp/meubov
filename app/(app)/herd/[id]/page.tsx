"use client";

/**
 * Animal record (/herd/[id]): identification, weight evolution,
 * timeline, health history and reproduction (females).
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, SearchX } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { todayISO } from "@/lib/domain/dates";
import { animalById, withStatus, animalTreatments } from "@/lib/store/selectors";
import { EmptyState } from "@/components/ui/empty-state";
import { AnimalHeader } from "@/components/animal/AnimalHeader";
import { EditAnimalDialog } from "@/components/animal/EditAnimalDialog";
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
  const params = useParams<{ id: string }>();

  const animals = useHerdStore((s) => s.animals);
  const treatments = useHerdStore((s) => s.treatments);
  const lots = useHerdStore((s) => s.lots);
  const invernadas = useHerdStore((s) => s.invernadas);
  const lotPlacements = useHerdStore((s) => s.lotPlacements);

  const animal = animalById(animals, params.id);

  if (!animal) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8">
        <BackLink />
        <div className="rounded-lg border border-hairline bg-panel pb-8">
          <EmptyState
            icon={SearchX}
            title="Animal não encontrado"
            description="Este cadastro não existe neste rebanho. Volte à lista e tente novamente."
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

  const derived = withStatus([animal], treatments, todayISO())[0];
  const forAnimal = animalTreatments(treatments, animal.earTag);
  const lot = lots.find((l) => l.id === animal.lotId) ?? null;
  const placement = lotPlacements.find(
    (item) => item.lotId === animal.lotId && item.endedOn === undefined
  );
  const invernada = placement
    ? invernadas.find((item) => item.id === placement.invernadaId) ?? null
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8">
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        <EditAnimalDialog animal={animal} />
      </div>

      <AnimalHeader
        derived={derived}
        lotName={lot?.name ?? null}
        invernadaName={
          invernada
            ? `${invernada.code}${invernada.name ? ` · ${invernada.name}` : ""}`
            : null
        }
      />

      <WeightEvolution animal={animal} adg={derived.adg} />

      <div className="grid items-start gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <Timeline animal={animal} treatments={forAnimal} />
        </div>
        <div className="space-y-4 xl:col-span-3">
          <HealthHistory treatments={forAnimal} />
          {/* Every female gets the section: without history it is the entry point. */}
          {animal.sex === "female" ? <AnimalReproduction animal={animal} /> : null}
        </div>
      </div>
    </div>
  );
}
