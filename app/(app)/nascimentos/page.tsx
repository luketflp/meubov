"use client";

/**
 * Nascimentos screen: the births of the farm and the shortest path to record a
 * new one. The same write as the parto on the dam's ficha — the calf enters the
 * herd with the calving — but reachable without first finding the mother. A
 * whole maternidade caderno comes in through "Importar nascimentos".
 */
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReadOnlyPill } from "@/components/layout/ReadOnlyPill";
import { BirthsList } from "@/components/births/births-list";
import { ImportBirthsDialog } from "@/components/births/import-births-dialog";
import { RegisterBirthDialog } from "@/components/births/register-birth-dialog";
import { DEFAULT_BIRTH_SORT, sortBirths, type BirthSort } from "@/components/births/sort-births";
import { ExportMenu } from "@/components/export/ExportMenu";
import { birthsExportTable } from "@/lib/export/datasets/births";
import { recentBirths } from "@/lib/store/selectors";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useCan } from "@/lib/store/usePermissions";

export default function NascimentosPage() {
  const canEdit = useCan("reproduction", "edit");
  const animals = useHerdStore((s) => s.animals);
  const lots = useHerdStore((s) => s.lots);
  const [sort, setSort] = useState<BirthSort>(DEFAULT_BIRTH_SORT);

  const count = recentBirths(animals).length;
  const exportMenu = (
    <ExportMenu
      title="Nascimentos"
      current={{
        label: "Nascimentos",
        detail: count === 1 ? "1 nascimento" : `${count} nascimentos`,
        build: () => {
          const lotNames = new Map(lots.map((lot) => [lot.id, lot.name]));
          return [birthsExportTable(sortBirths(recentBirths(animals), sort, lotNames), lotNames)];
        },
      }}
      hint="Mesmas colunas e ordem da tabela."
    />
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Nascimentos"
        subtitle="Bezerros nascidos na fazenda e o registro de novos partos"
        badges={canEdit ? undefined : <ReadOnlyPill />}
        actions={
          <>
            {exportMenu}
            {canEdit ? (
              <>
                <ImportBirthsDialog />
                <RegisterBirthDialog />
              </>
            ) : null}
          </>
        }
      />
      <BirthsList sort={sort} onSortChange={setSort} />
    </div>
  );
}
