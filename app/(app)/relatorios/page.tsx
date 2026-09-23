"use client";

/**
 * Relatórios (/relatorios): the four documents to print or save as PDF, and
 * every list of the farm as a planilha (.xlsx or .csv), one at a time or all
 * in one file. Banco, Romaneio and Despesas need Financeiro view.
 */
import { useMemo } from "react";
import { Download, Info, Landmark, ReceiptText, ScrollText, Stethoscope } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { DocCard, type DocCardProps } from "@/components/reports/DocCard";
import { SectionDivider } from "@/components/reports/SectionDivider";
import { SheetsList } from "@/components/reports/SheetsList";
import { reportDatasets, type ReportDataset } from "@/components/reports/datasets";
import { defaultPeriod } from "@/components/reports/params";
import { headsLabel } from "@/components/reports/tables";
import { useDownload, type DownloadFormat } from "@/components/reports/useDownload";
import { useReportData } from "@/components/reports/useReportData";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { lastSalePrice } from "@/lib/reports/bank";
import { saleSessions } from "@/lib/reports/romaneio";
import { activeAnimals } from "@/lib/store/selectors";
import { useCan } from "@/lib/store/usePermissions";

export default function ReportsPage() {
  const data = useReportData();
  const seeMoney = useCan("finance", "view");
  const today = todayISO();
  const { download, busy } = useDownload();

  const datasets = useMemo(() => reportDatasets(data, today, seeMoney), [data, today, seeMoney]);

  const docs = useMemo((): DocCardProps[] => {
    const heads = activeAnimals(data.animals).length;
    const lastSale = saleSessions(data.manejoSessions)[0];
    const soldHeads = lastSale ? lastSale.animals.filter((line) => line.outcome === "done").length : 0;
    const price = lastSalePrice(data.manejoSessions);
    const { from } = defaultPeriod(today);
    const breedings = data.animals
      .flatMap((animal) => animal.reproduction?.breedings ?? [])
      .filter((breeding) => breeding.date >= from && breeding.date <= today).length;

    // Banco and Romaneio carry values in R$: shown only with Financeiro view.
    const all: DocCardProps[] = [
      {
        href: "/relatorios/declaracao",
        icon: ScrollText,
        tone: "brand",
        title: "Declaração de rebanho",
        text: "Saldo por sexo e faixa etária numa data-base, com a movimentação desde a última declaração.",
        audience: "Agência de defesa agropecuária do estado",
        fact: `Rebanho hoje: ${headsLabel(heads)}`,
      },
      {
        href: "/relatorios/romaneio",
        icon: ReceiptText,
        tone: "scheduled",
        title: "Romaneio de venda",
        text: "Brincos, pesos e valores de um manejo de venda, com totais e campos de assinatura.",
        audience: "Frigorífico ou comprador",
        fact: lastSale
          ? `Última venda: ${formatDate(lastSale.date)} · ${headsLabel(soldHeads)}`
          : "Nenhuma venda registrada",
        money: true,
      },
      {
        href: "/relatorios/banco",
        icon: Landmark,
        tone: "attention",
        title: "Relatório para banco",
        text: "Inventário valorizado pelo preço da arroba, evolução de 12 meses e peso médio por lote.",
        audience: "Crédito rural e garantias",
        fact: price
          ? `Arroba da última venda: ${formatCurrency(price.pricePerArroba)} em ${formatDate(price.date)}`
          : "Sem venda por arroba: informe o preço ao gerar",
        money: true,
      },
      {
        href: "/relatorios/tecnico",
        icon: Stethoscope,
        tone: "healthy",
        title: "Relatório técnico",
        text: "Prenhez da estação, IATF por touro, partos e GMD por lote no período escolhido.",
        audience: "Veterinário ou consultor",
        fact: `${formatNumber(breedings)} ${breedings === 1 ? "cobertura" : "coberturas"} nos últimos 12 meses`,
      },
    ];
    return all.filter((doc) => seeMoney || !doc.money);
  }, [data.animals, data.manejoSessions, seeMoney, today]);

  const downloadDataset = (dataset: ReportDataset, format: DownloadFormat) =>
    void download(`${dataset.key}.${format}`, dataset.name, dataset.tables, format);

  const downloadAll = () =>
    void download(
      "all",
      "Planilhas",
      datasets.flatMap((dataset) => dataset.tables),
      "xlsx"
    );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-6 md:px-8">
      <PageHeader
        title="Relatórios"
        subtitle="Documentos para imprimir ou salvar em PDF, e planilhas com os dados da fazenda."
      />

      <SectionDivider title="Documentos" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {docs.map((doc) => (
          <DocCard key={doc.href} {...doc} />
        ))}
      </div>

      <SectionDivider
        title="Planilhas"
        action={
          <Button className="min-h-11 w-full sm:w-auto md:min-h-8" disabled={busy !== null} onClick={downloadAll}>
            <Download aria-hidden />
            {busy === "all" ? "Gerando…" : "Baixar tudo (.xlsx)"}
          </Button>
        }
      />
      <SheetsList datasets={datasets} busy={busy} onDownload={downloadDataset} />
      <p className="flex items-start gap-2 text-xs text-ink-soft">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        “Baixar tudo” gera um arquivo com uma aba por lista. Colunas em R$ só saem para quem vê o
        Financeiro.
      </p>
    </div>
  );
}
