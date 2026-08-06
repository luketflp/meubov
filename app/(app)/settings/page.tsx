"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { FarmDataForm } from "@/components/settings/FarmDataForm";
import { HerdCategories } from "@/components/settings/HerdCategories";
import { RegisteredBreeds } from "@/components/settings/RegisteredBreeds";
import { InvernadasSettings } from "@/components/settings/LotsPaddocks";
import { HealthProtocols } from "@/components/settings/HealthProtocols";

export default function SettingsPage() {
  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Configurações"
          subtitle="Dados da fazenda, categorias, raças, invernadas e protocolos sanitários"
        />
        <FarmDataForm />
        <HerdCategories />
        <RegisteredBreeds />
        <InvernadasSettings />
        <HealthProtocols />
        <p className="text-xs text-ink-soft">
          Os protocolos geram a agenda do Calendário Sanitário.
        </p>
      </div>
    </div>
  );
}
