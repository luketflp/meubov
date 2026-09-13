"use client";

/**
 * Touros tab of Reprodução: the bulls the farm buys semen from, each with the
 * doses left, how many of those bought were used, what a dose costs on average
 * and the latest purchase. Table on desktop, stacked cards on the phone — the
 * same shape as the Coberturas list. A bull's name opens its page; "Registrar
 * compra" adds doses without leaving the list.
 *
 * The stock is derived from the store on every render (lib/domain/semen.ts),
 * never read from a counter: a cobertura recorded anywhere in the app shows up
 * here at once.
 */
import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { Dna } from "lucide-react";
import { useHerdStore } from "@/lib/store/useHerdStore";
import { formatDate } from "@/lib/domain/dates";
import { formatCurrency, formatNumber } from "@/lib/domain/format";
import { bullStock } from "@/lib/domain/semen";
import { semenBullHref } from "@/components/semen/helpers";
import { SemenBullDialog } from "@/components/semen/semen-bull-dialog";
import { SemenPurchaseDialog } from "@/components/semen/semen-purchase-dialog";
import { StockPill } from "@/components/semen/stock-pill";
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

const nameLinkClass = "font-medium text-ink underline-offset-2 hover:underline";

/** "Código · raça · central" under the name on the phone card, skipping what is blank. */
function identityLine(code?: string, breed?: string, central?: string): ReactNode[] {
  const parts: ReactNode[] = [];
  if (code) {
    parts.push(
      <span key="code" className="font-mono">
        {code}
      </span>
    );
  }
  if (breed) parts.push(breed);
  if (central) parts.push(central);
  return parts.flatMap((part, index) => (index === 0 ? [part] : [" · ", part]));
}

export function SemenBullsList() {
  const semenBulls = useHerdStore((s) => s.semenBulls);
  const animals = useHerdStore((s) => s.animals);
  // A bull registered here is appended unsorted; the list reads by name.
  const rows = useMemo(
    () =>
      [...semenBulls]
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((bull) => ({ bull, stock: bullStock(bull, animals) })),
    [semenBulls, animals]
  );

  return (
    <SectionCard
      title="Touros"
      action={rows.length > 0 ? <SemenBullDialog /> : null}
    >
      {rows.length === 0 ? (
        <div className="pb-6">
          <EmptyState
            icon={Dna}
            title="Nenhum touro cadastrado"
            description="Cadastre os touros de que você compra sêmen para controlar o estoque de doses."
          />
          <div className="flex justify-center">
            <SemenBullDialog />
          </div>
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Touro</TableHead>
                  <TableHead>Raça</TableHead>
                  <TableHead>Central</TableHead>
                  <TableHead>Em estoque</TableHead>
                  <TableHead className="text-right">Usadas / compradas</TableHead>
                  <TableHead className="text-right">Custo médio por dose</TableHead>
                  <TableHead>Última compra</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ bull, stock }) => (
                  <TableRow key={bull.id}>
                    <TableCell>
                      <Link href={semenBullHref(bull.id)} className={nameLinkClass}>
                        {bull.name}
                      </Link>
                      {bull.code ? (
                        <span className="ml-2 font-mono text-xs text-ink-soft">{bull.code}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-ink">{bull.breed ?? "—"}</TableCell>
                    <TableCell className="text-ink-soft">{bull.central ?? "—"}</TableCell>
                    <TableCell>
                      <StockPill left={stock.left} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {formatNumber(stock.used)} de {formatNumber(stock.bought)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink">
                      {stock.avgCostPerDose === null ? "—" : formatCurrency(stock.avgCostPerDose)}
                    </TableCell>
                    <TableCell className="font-mono text-ink">
                      {stock.lastPurchase === null ? "—" : formatDate(stock.lastPurchase)}
                    </TableCell>
                    <TableCell className="text-right">
                      <SemenPurchaseDialog bull={bull} variant="row" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map(({ bull, stock }) => {
              const identity = identityLine(bull.code, bull.breed, bull.central);
              return (
                <li key={bull.id} className="rounded-lg border border-hairline bg-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={semenBullHref(bull.id)} className={nameLinkClass}>
                      {bull.name}
                    </Link>
                    <StockPill left={stock.left} />
                  </div>
                  {identity.length > 0 ? (
                    <p className="mt-1 text-xs text-ink-soft">{identity}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-ink-soft">
                    Usadas{" "}
                    <span className="font-mono text-ink">
                      {formatNumber(stock.used)} de {formatNumber(stock.bought)}
                    </span>
                    {stock.avgCostPerDose === null ? null : (
                      <>
                        {" · "}
                        <span className="font-mono text-ink">
                          {formatCurrency(stock.avgCostPerDose)}
                        </span>{" "}
                        por dose
                      </>
                    )}
                  </p>
                  {stock.lastPurchase === null ? null : (
                    <p className="mt-1 text-xs text-ink-soft">
                      Última compra{" "}
                      <span className="font-mono text-ink">{formatDate(stock.lastPurchase)}</span>
                    </p>
                  )}
                  <SemenPurchaseDialog bull={bull} variant="card" />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
