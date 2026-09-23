/**
 * The Declaração de rebanho on A4: who and where, the saldo by sex × age band
 * and by category, the movimentação since the chosen date and the signatures.
 */
import { formatDate } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/domain/format";
import type { ExportContext } from "@/lib/export/table";
import type { HerdDeclaration } from "@/lib/reports/declaration";
import {
  A4Sheet,
  PrintFields,
  PrintFooter,
  PrintHeader,
  PrintNote,
  PrintSection,
  PrintSignatures,
  PrintTable,
  type PrintFarm,
} from "@/components/print/PrintSheet";
import { BLANK } from "@/components/reports/params";
import { declarationTables } from "@/components/reports/tables";

export function DeclarationSheet({
  declaration,
  farm,
  responsible,
  context,
}: {
  declaration: HerdDeclaration;
  farm: PrintFarm;
  /** Produtor responsável: the farm's manager, else the user's name. */
  responsible: string;
  context: ExportContext;
}) {
  const { bands, categories, flow } = declarationTables(declaration);
  const base = formatDate(declaration.baseDate);
  const undated = declaration.undated;

  return (
    <A4Sheet>
      <PrintHeader farm={farm} title="Declaração de rebanho" subtitle={`Bovinos · data-base ${base}`} />
      <PrintFields
        fields={[
          ["Propriedade", farm.name],
          ["Município / UF", farm.municipality || BLANK],
          ["Inscrição estadual", farm.stateRegistration || BLANK],
          ["Produtor responsável", responsible || BLANK],
          ["Área total", farm.hectares > 0 ? `${formatNumber(farm.hectares, Number.isInteger(farm.hectares) ? 0 : 1)} ha` : BLANK],
          ["Espécie", "Bovinos"],
        ]}
      />
      <PrintSection title="Saldo por sexo e faixa etária" note="idade na data-base">
        <PrintTable table={bands.table} totals={bands.totals} />
      </PrintSection>
      <PrintSection title="Por categoria">
        <PrintTable table={categories.table} totals={categories.totals} />
      </PrintSection>
      <PrintSection
        title="Movimentação no período"
        note={`${formatDate(declaration.since)} a ${base}`}
      >
        <PrintTable table={flow.table} totals={flow.totals} />
      </PrintSection>
      <PrintNote>
        Idades calculadas pela data de nascimento cadastrada, na data-base. Saldo anterior é o
        rebanho no dia {formatDate(declaration.since)}; a movimentação conta o que aconteceu depois
        dele até a data-base. A tabela por categoria usa a categoria atual de cada animal.
        {undated > 0
          ? ` ${undated === 1 ? "1 animal sem data de nascimento entra" : `${undated} animais sem data de nascimento entram`} pela categoria (bezerros: 0 a 12 meses; novilhas: 13 a 24; bois: 25 a 36; vacas e touros: acima de 36).`
          : ""}
        {declaration.flow.adjustment !== 0
          ? " O ajuste corresponde a animais cadastrados sem registro de nascimento ou de entrada."
          : ""}
      </PrintNote>
      {/* One bottom block, so the signatures sit right above the footer. */}
      <div className="mt-auto flex flex-col gap-5">
        <PrintSignatures labels={["Local e data", responsible ? `${responsible} · produtor` : "Produtor responsável"]} />
        <PrintFooter context={context} />
      </div>
    </A4Sheet>
  );
}
