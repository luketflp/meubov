"use client";

/**
 * Romaneio de venda (/relatorios/romaneio?manejo=<id>): the animals of one
 * sale manejo with weights, arrobas and values, for the frigorífico or the
 * buyer. The sale comes from the link (a sale's detail screen) or the picker;
 * without one, the newest sale. Needs Financeiro view.
 */
import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReceiptText } from "lucide-react";
import type { ManejoSession } from "@/lib/types";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency } from "@/lib/domain/format";
import { saleRomaneio, saleSessions } from "@/lib/reports/romaneio";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { usePrintFarm, useExportContext } from "@/components/export/useExportContext";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RomaneioSheet } from "@/components/reports/RomaneioSheet";
import { ParamField, ReportScreen } from "@/components/reports/ReportScreen";
import { headsLabel, romaneioTable, withTotalsRow } from "@/components/reports/tables";
import { useDownload } from "@/components/reports/useDownload";
import { useReportData } from "@/components/reports/useReportData";

// The sale lives in the URL query, which useSearchParams reads inside a Suspense boundary.
export default function RomaneioPage() {
  return (
    <RequireAccess area="finance" level="view">
      <Suspense fallback={null}>
        <RomaneioScreen />
      </Suspense>
    </RequireAccess>
  );
}

/** "18/09/2026 · Venda boi gordo · 24 cabeças", "(em aberto)" while open. */
function saleLabel(session: ManejoSession): string {
  const heads = session.animals.filter((line) => line.outcome === "done").length;
  const open = session.status === "open" ? " (em aberto)" : "";
  return `${formatDate(session.date)} · ${session.name} · ${headsLabel(heads)}${open}`;
}

function RomaneioScreen() {
  const data = useReportData();
  const farm = usePrintFarm();
  const exportContext = useExportContext();
  const { download, busy } = useDownload();
  const router = useRouter();
  const searchParams = useSearchParams();

  const sales = useMemo(() => saleSessions(data.manejoSessions), [data.manejoSessions]);
  const wanted = searchParams.get("manejo");
  const selected = sales.find((session) => session.id === wanted) ?? sales[0] ?? null;
  const romaneio = useMemo(
    () => (selected ? saleRomaneio(data, selected.id) : null),
    [data, selected]
  );

  const pick = (id: string) =>
    router.replace(`/relatorios/romaneio?manejo=${encodeURIComponent(id)}`, { scroll: false });

  if (!selected || !romaneio) {
    return (
      <ReportScreen
        title="Romaneio de venda"
        subtitle="Nenhuma venda registrada"
        ready={false}
        params={
          <p className="text-sm text-ink-soft">
            O romaneio sai de um manejo de venda. Registre uma venda no Manejo para gerá-lo.
          </p>
        }
      >
        <div className="rounded-lg border border-hairline bg-panel print:hidden">
          <EmptyState
            icon={ReceiptText}
            title="Nenhuma venda registrada"
            description="Quando houver um manejo de venda, o romaneio aparece aqui pronto para imprimir."
          />
        </div>
      </ReportScreen>
    );
  }

  const context = exportContext();
  const manager = data.farm.manager.trim();
  const seller = manager ? `${farm.name} · ${manager}` : farm.name;
  const { totals } = romaneio;

  const downloadSheet = () =>
    void download(
      "romaneio",
      "Romaneio de venda",
      [withTotalsRow(romaneioTable(romaneio))],
      "xlsx",
      [`Venda: ${selected.name} · ${formatDate(selected.date)}`]
    );

  return (
    <ReportScreen
      title="Romaneio de venda"
      subtitle={[
        headsLabel(totals.heads),
        totals.valueBrl === null ? "" : formatCurrency(totals.valueBrl),
        formatDate(selected.date),
      ]
        .filter(Boolean)
        .join(" · ")}
      onDownload={downloadSheet}
      downloading={busy !== null}
      params={
        <ParamField
          label="Venda"
          htmlFor="romaneio-venda"
          hint="Os manejos de venda da fazenda, do mais recente ao mais antigo."
        >
          <Select value={selected.id} onValueChange={pick}>
            <SelectTrigger id="romaneio-venda" className="min-h-11 w-full md:min-h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sales.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {saleLabel(session)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ParamField>
      }
    >
      <RomaneioSheet romaneio={romaneio} farm={farm} seller={seller} context={context} />
    </ReportScreen>
  );
}
