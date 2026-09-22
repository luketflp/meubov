"use client";

/**
 * Reprodução screen, in three tabs on the URL's `tab`: Coberturas, every
 * breeding on the farm with its diagnosis and the calving it forecasts; Touros,
 * the semen bulls with their stock of doses; and Ultrassom, the coberturas
 * waiting for the diagnosis. The header keeps the two ways in: a single
 * cobertura (after picking the dam) and an inseminação of a whole lote at the
 * brete.
 */
import { use } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { BreedingsList } from "@/components/breedings/breedings-list";
import { RegisterBreedingDialog } from "@/components/breedings/register-breeding-dialog";
import { ReproductionTabs, reproductionTab } from "@/components/breedings/reproduction-tabs";
import { StartInseminationButton } from "@/components/breedings/start-insemination-button";
import { UltrasoundList } from "@/components/breedings/ultrasound-list";
import { SemenBullsList } from "@/components/semen/semen-bulls-list";
import { useCan } from "@/lib/store/usePermissions";

interface ReproducaoPageProps {
  searchParams: Promise<{ tab?: string | string[]; brete?: string | string[] }>;
}

export default function ReproducaoPage({ searchParams }: ReproducaoPageProps) {
  const params = use(searchParams);
  const activeTab = reproductionTab(params.tab);
  // The lote whose ultrassom brete is open, on the Ultrassom tab.
  const brete = typeof params.brete === "string" ? params.brete : null;
  const canEdit = useCan("reproduction", "edit");
  // The inseminação is a manejo: starting one is a Manejo write.
  const canStartInsemination = useCan("manejo", "edit");

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Reprodução"
        subtitle="Coberturas das matrizes, o sêmen em estoque e o diagnóstico de prenhez"
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={
          canEdit || canStartInsemination ? (
            <>
              {canEdit ? <RegisterBreedingDialog variant="outline" /> : null}
              {canStartInsemination ? <StartInseminationButton /> : null}
            </>
          ) : undefined
        }
      />
      <ReproductionTabs active={activeTab} />
      {activeTab === "touros" ? (
        <SemenBullsList />
      ) : activeTab === "ultrassom" ? (
        <UltrasoundList brete={brete} />
      ) : (
        <BreedingsList />
      )}
    </div>
  );
}
