"use client";

/**
 * Página do touro (/nascimentos/reproducao/touros/[id]): one semen bull with
 * its stock, what a dose costs and how often it took, every purchase of doses
 * and every cobertura that used one. Opened from the bull's name on the Touros
 * tab and on the Coberturas list.
 *
 * Everything is derived from the store (lib/domain/semen.ts): the purchases
 * travel inside the bull, the coberturas inside their dams. Deleting a purchase
 * asks nothing first — the server refuses it when its doses were already used,
 * and the toast says so.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, SearchX, Trash2 } from "lucide-react";
import type { Animal, SemenBull, SemenPurchase } from "@/lib/types";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { useToast } from "@/components/providers/Toasts";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import {
  bullInseminations,
  bullPregnancy,
  bullStock,
  canRemovePurchase,
  type BullInsemination,
} from "@/lib/domain/semen";
import { awaitsDiagnosis } from "@/lib/domain/ultrasound";
import { ResultPill } from "@/components/animal/reproduction-pills";
import { ResumoCard, useHerdLookup } from "@/components/manejo/detail-shell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SemenBullDialog } from "@/components/semen/semen-bull-dialog";
import { SemenPurchaseDialog } from "@/components/semen/semen-purchase-dialog";
import { TOUROS_TAB } from "@/components/semen/helpers";
import { dosesLabel, MonoDoses } from "@/components/semen/stock-pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const damLinkClass = "font-mono font-medium text-ink underline-offset-2 hover:underline";

function BackLink() {
  return (
    <Link
      href={TOUROS_TAB}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink md:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Reprodução
    </Link>
  );
}

/** "1 inseminação", "41 inseminações". */
function inseminationsLabel(n: number): string {
  return n === 1 ? "1 inseminação" : `${formatNumber(n)} inseminações`;
}

interface BullResumoProps {
  bull: SemenBull;
  animals: Animal[];
  inseminations: BullInsemination[];
}

/** Resumo do touro: stock on the left, cost and pregnancy rate on the right. */
function BullResumo({ bull, animals, inseminations }: BullResumoProps) {
  const stock = bullStock(bull, animals);
  const pregnancy = bullPregnancy(bull.id, animals);
  // Waiting for the ultrassom means being on the Ultrassom list: the dam's
  // latest cobertura, the dam still in the herd, no calving since.
  const awaiting = inseminations.filter(({ dam, breeding }) =>
    dam.reproduction ? awaitsDiagnosis(dam.reproduction, breeding, dam.active) : false
  ).length;
  const purchases = bull.purchases.length;

  return (
    <ResumoCard
      title="Resumo"
      lead={
        <>
          <span className="font-medium text-ink">{inseminationsLabel(inseminations.length)}</span>
          {` · ${formatNumber(pregnancy.diagnosed)} com diagnóstico · ${formatNumber(awaiting)} aguardando ultrassom`}
        </>
      }
      columns={[
        {
          caption: "Estoque",
          rows: [
            { label: "Em estoque", value: dosesLabel(stock.left) },
            {
              label: "Compradas",
              value: dosesLabel(stock.bought),
              suffix:
                purchases === 0
                  ? undefined
                  : purchases === 1
                    ? "1 compra"
                    : `${formatNumber(purchases)} compras`,
            },
            { label: "Usadas", value: dosesLabel(stock.used) },
          ],
        },
        {
          caption: "Custo e prenhez",
          rows: [
            {
              label: "Custo médio por dose",
              value: stock.avgCostPerDose === null ? "—" : formatCurrency(stock.avgCostPerDose),
            },
            {
              label: "Total comprado",
              value: purchases === 0 ? "—" : formatCurrency(stock.totalBrl),
            },
            {
              label: "Taxa de prenhez",
              value: pregnancy.rate === null ? "—" : `${formatNumber(pregnancy.rate * 100)}%`,
              suffix:
                pregnancy.rate === null
                  ? undefined
                  : `${formatNumber(pregnancy.pregnant)} de ${formatNumber(pregnancy.diagnosed)} ${
                      pregnancy.diagnosed === 1 ? "diagnosticada" : "diagnosticadas"
                    }`,
            },
          ],
        },
      ]}
    />
  );
}

/** Compras: every purchase of the bull, newest first, each with its delete. */
function BullPurchases({ bull, animals }: { bull: SemenBull; animals: Animal[] }) {
  const removeSemenPurchase = useHerdStore((s) => s.removeSemenPurchase);
  const { addToast } = useToast();
  const [removing, setRemoving] = useState(false);

  const purchases = useMemo(
    () => [...bull.purchases].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [bull.purchases]
  );

  /** Deletes the purchase and its expense, unless its doses were already used. */
  async function onRemove(purchase: SemenPurchase) {
    setRemoving(true);
    try {
      // The store's count refuses at once; the server counts again under a lock.
      const removed =
        canRemovePurchase(bull, purchase.id, animals) &&
        (await removeSemenPurchase(bull.id, purchase.id));
      addToast(
        removed
          ? { messageType: "success", text: "Compra excluída" }
          : {
              messageType: "error",
              text: "Não dá para excluir: as doses dessa compra já foram usadas.",
            }
      );
    } catch {
      // The store already told the farmer.
    } finally {
      setRemoving(false);
    }
  }

  const removeButton = (purchase: SemenPurchase) => (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Excluir compra de ${formatDate(purchase.date)}`}
      disabled={removing}
      className="size-11 shrink-0 text-ink-soft hover:text-overdue md:size-9"
      onClick={() => onRemove(purchase)}
    >
      <Trash2 className="size-4" aria-hidden />
    </Button>
  );

  return (
    <SectionCard title="Compras">
      {purchases.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhuma compra desse touro ainda.</p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Doses</TableHead>
                  <TableHead className="text-right">Valor total</TableHead>
                  <TableHead className="text-right">Por dose</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-mono text-ink">{formatDate(purchase.date)}</TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {formatNumber(purchase.doses)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {formatCurrency(purchase.totalBrl)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {formatCurrency(purchase.totalBrl / purchase.doses)}
                    </TableCell>
                    <TableCell className="text-ink">{purchase.seller ?? "—"}</TableCell>
                    <TableCell className="text-right">{removeButton(purchase)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: one line per purchase */}
          <ul className="divide-y divide-hairline md:hidden">
            {purchases.map((purchase) => (
              <li key={purchase.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm text-ink">{formatDate(purchase.date)}</span>
                    <span className="font-mono text-sm font-medium text-ink">
                      {formatCurrency(purchase.totalBrl)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    <MonoDoses doses={purchase.doses} className="text-ink" /> ·{" "}
                    <span className="font-mono text-ink">
                      {formatCurrency(purchase.totalBrl / purchase.doses)}
                    </span>{" "}
                    por dose
                  </p>
                  {purchase.seller ? (
                    <p className="mt-0.5 truncate text-xs text-ink-soft">{purchase.seller}</p>
                  ) : null}
                </div>
                {removeButton(purchase)}
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

/** Inseminações: every cobertura that used a dose of the bull, newest first. */
function BullInseminations({ rows }: { rows: BullInsemination[] }) {
  const lookup = useHerdLookup();

  return (
    <SectionCard title="Inseminações">
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhuma inseminação com esse touro ainda.</p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Matriz</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Diagnóstico</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ breeding, dam, result }) => (
                  <TableRow key={breeding.id}>
                    <TableCell className="font-mono text-ink">{formatDate(breeding.date)}</TableCell>
                    <TableCell>
                      <Link href={`/herd/${dam.id}`} className={damLinkClass}>
                        {dam.earTag}
                      </Link>
                    </TableCell>
                    <TableCell className="text-ink-soft">{lookup.lotName(dam.lotId)}</TableCell>
                    <TableCell>
                      <ResultPill result={result} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map(({ breeding, dam, result }) => (
              <li key={breeding.id} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/herd/${dam.id}`} className={damLinkClass}>
                    {dam.earTag}
                  </Link>
                  <span className="font-mono text-xs text-ink-soft">
                    {formatDate(breeding.date)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ResultPill result={result} />
                  <span className="text-xs text-ink-soft">{lookup.lotName(dam.lotId)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

/** The bull's record once it is found: header, resumo, compras and inseminações. */
function BullRecord({ bull }: { bull: SemenBull }) {
  const animals = useHerdStore((s) => s.animals);
  const inseminations = useMemo(() => bullInseminations(bull.id, animals), [bull.id, animals]);
  const subtitle = [bull.breed, bull.central].filter(Boolean).join(" · ");

  return (
    <>
      <BackLink />
      <PageHeader
        title={bull.name}
        subtitle={subtitle === "" ? undefined : subtitle}
        badges={
          bull.code ? <span className="font-mono text-sm text-ink-soft">{bull.code}</span> : undefined
        }
        actions={
          <>
            <SemenBullDialog bull={bull} />
            <SemenPurchaseDialog bull={bull} variant="header" />
          </>
        }
      />
      <BullResumo bull={bull} animals={animals} inseminations={inseminations} />
      <BullPurchases bull={bull} animals={animals} />
      <BullInseminations rows={inseminations} />
    </>
  );
}

export function SemenBullPage({ bullId }: { bullId: string }) {
  const bull = useHerdStore((s) => s.semenBulls.find((b) => b.id === bullId));

  if (!bull) {
    return (
      <>
        <BackLink />
        <div className="rounded-lg border border-hairline bg-panel pb-8">
          <EmptyState
            icon={SearchX}
            title="Touro não encontrado"
            description="Este touro não está cadastrado na fazenda. Volte aos touros e tente novamente."
          />
          <div className="flex justify-center">
            <Link
              href={TOUROS_TAB}
              className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-panel transition-colors hover:bg-brand/90"
            >
              Voltar aos touros
            </Link>
          </div>
        </div>
      </>
    );
  }

  return <BullRecord bull={bull} />;
}
