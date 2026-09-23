"use client";

/**
 * Manejo screen: batch curral operations. Pending activities panel
 * (overdue and upcoming treatments grouped per batch), batch registration
 * of sanitary actions and weighings, and the history of executed manejos.
 */
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { useCan } from "@/lib/store/usePermissions";
import { ActivityPanel } from "@/components/manejo/activity-panel";
import { ManejoHistory } from "@/components/manejo/manejo-history";
import { ManejoHistoryExport } from "@/components/manejo/manejo-history-export";
import { OpenManejoSessions } from "@/components/manejo/open-sessions";
import { RegisterManejoDialog } from "@/components/manejo/register-manejo-dialog";

export default function ManejoPage() {
  const canEdit = useCan("manejo", "edit");
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Manejo"
        subtitle="Vacinas, vermifugações, pesagens e atividades pendentes do curral"
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={
          <>
            {/* The export follows the history's filter, read from the URL inside a Suspense boundary. */}
            <Suspense fallback={null}>
              <ManejoHistoryExport />
            </Suspense>
            {canEdit ? <RegisterManejoDialog /> : null}
          </>
        }
      />
      <OpenManejoSessions />
      <ActivityPanel />
      {/* The history's filter lives in the URL query, read inside a Suspense boundary. */}
      <Suspense fallback={null}>
        <ManejoHistory />
      </Suspense>
    </div>
  );
}
