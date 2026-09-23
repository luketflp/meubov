/**
 * The Romaneio de venda on A4: the sale's parties, its animals with weights,
 * arrobas and values, the batch figures and the signatures.
 */
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import type { ExportContext } from "@/lib/export/table";
import type { Romaneio } from "@/lib/reports/romaneio";
import {
  A4Sheet,
  PrintFields,
  PrintFigures,
  PrintFooter,
  PrintHeader,
  PrintNote,
  PrintSignatures,
  PrintTable,
  type PrintFarm,
} from "@/components/print/PrintSheet";
import { BLANK } from "@/components/reports/params";
import { romaneioTable } from "@/components/reports/tables";

/** How the sale was priced, in words. */
function priceLabel(romaneio: Romaneio): string {
  if (romaneio.pricePerArroba !== null) return `${formatCurrency(romaneio.pricePerArroba)} por @`;
  const closed = romaneio.session.totalAmountBrl;
  return closed !== undefined ? `Lote fechado · ${formatCurrency(closed)}` : "—";
}

export function RomaneioSheet({
  romaneio,
  farm,
  seller,
  context,
}: {
  romaneio: Romaneio;
  farm: PrintFarm;
  /** Vendedor: the farm, with its manager when known. */
  seller: string;
  context: ExportContext;
}) {
  const { session, totals } = romaneio;
  const { table, totals: totalsRow } = romaneioTable(romaneio);

  return (
    <A4Sheet>
      <PrintHeader
        farm={farm}
        title="Romaneio de venda"
        subtitle={`${session.name} · ${formatDate(session.date)}`}
      />
      <PrintFields
        fields={[
          ["Vendedor", seller],
          ["Comprador", romaneio.counterparty ?? BLANK],
          ["GTA nº", BLANK],
          ["Preço", priceLabel(romaneio)],
          ["Rendimento de carcaça", `${formatNumber(romaneio.yieldPct, Number.isInteger(romaneio.yieldPct) ? 0 : 1)}%`],
          ["Lote de origem", romaneio.originLot ?? "—"],
        ]}
      />
      {romaneio.rows.length > 0 ? (
        <PrintTable table={table} totals={totalsRow} />
      ) : (
        <PrintNote>Nenhum animal vendido neste manejo ainda.</PrintNote>
      )}
      <PrintFigures
        figures={[
          { label: "Cabeças", value: formatNumber(totals.heads) },
          { label: "Peso médio", value: totals.avgKg === null ? "—" : `${formatNumber(totals.avgKg, 1)} kg` },
          { label: "Arrobas", value: totals.avgKg === null ? "—" : formatNumber(totals.arrobas, 2) },
          { label: "Total", value: totals.valueBrl === null ? "—" : formatCurrency(totals.valueBrl) },
        ]}
      />
      {session.status === "open" ? (
        <PrintNote>Manejo em aberto: o romaneio lista os animais já passados no brete.</PrintNote>
      ) : null}
      {/* One bottom block, so the signatures sit right above the footer. */}
      <div className="mt-auto flex flex-col gap-5">
        <PrintSignatures labels={["Vendedor", "Comprador"]} />
        <PrintFooter context={context} />
      </div>
    </A4Sheet>
  );
}
