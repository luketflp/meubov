"use client";

/**
 * Nascimentos screen: the births of the farm and the shortest path to record a
 * new one. The same write as the parto on the dam's ficha — the calf enters the
 * herd with the calving — but reachable without first finding the mother. A
 * whole maternidade caderno comes in through "Importar nascimentos".
 */
import { PageHeader } from "@/components/layout/PageHeader";
import { BirthsList } from "@/components/births/births-list";
import { ImportBirthsDialog } from "@/components/births/import-births-dialog";
import { RegisterBirthDialog } from "@/components/births/register-birth-dialog";

export default function NascimentosPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Nascimentos"
        subtitle="Bezerros nascidos na fazenda e o registro de novos partos"
        actions={
          <>
            <ImportBirthsDialog />
            <RegisterBirthDialog />
          </>
        }
      />
      <BirthsList />
    </div>
  );
}
