"use client";

/**
 * Manejo screen: batch curral operations. Pending activities panel
 * (overdue and upcoming treatments grouped per batch), batch registration
 * of sanitary actions and weighings, and the history of executed manejos.
 */
import { PageHeader } from "@/components/layout/PageHeader";
import { ActivityPanel } from "@/components/manejo/activity-panel";
import { ManejoHistory } from "@/components/manejo/manejo-history";
import { OpenManejoSessions } from "@/components/manejo/open-sessions";
import { RegisterManejoDialog } from "@/components/manejo/register-manejo-dialog";

export default function ManejoPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Manejo"
        subtitle="Vacinas, vermifugações, pesagens e atividades pendentes do curral"
        actions={<RegisterManejoDialog />}
      />
      <OpenManejoSessions />
      <ActivityPanel />
      <ManejoHistory />
    </div>
  );
}
