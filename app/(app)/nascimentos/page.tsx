"use client";

/**
 * Nascimentos screen: the births of the farm and the shortest path to record a
 * new one. The same write as the parto on the dam's ficha — the calf enters the
 * herd with the calving — but reachable without first finding the mother. A
 * whole maternidade caderno comes in through "Importar nascimentos".
 */
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { BirthsList } from "@/components/births/births-list";
import { ImportBirthsDialog } from "@/components/births/import-births-dialog";
import { RegisterBirthDialog } from "@/components/births/register-birth-dialog";
import { useCan } from "@/lib/store/usePermissions";

export default function NascimentosPage() {
  const canEdit = useCan("reproduction", "edit");

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Nascimentos"
        subtitle="Bezerros nascidos na fazenda e o registro de novos partos"
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={
          canEdit ? (
            <>
              <ImportBirthsDialog />
              <RegisterBirthDialog />
            </>
          ) : undefined
        }
      />
      <BirthsList />
    </div>
  );
}
