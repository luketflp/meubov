/**
 * The subscription tiers as the homepage prints them and as billing will
 * enforce them. Prices in centavos, caps count ACTIVE animals (sold and dead
 * never push a farmer over). Null means unlimited (caps) or not sold (prices).
 */
import { formatNumber } from "@/lib/domain/format";

export type PlanId = "curral" | "fazenda" | "fazenda_pro" | "consultor";
export type BillingInterval = "month" | "year";

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in centavos; null for the quote-only tier. */
  monthlyBrl: number | null;
  /** Annual price in centavos (10 × monthly); null when not sold or free. */
  yearlyBrl: number | null;
  /** Active-animal cap; null = unlimited. */
  maxHeads: number | null;
  maxFarms: number | null;
  maxUsers: number | null;
  /** The bullets on the pricing card, in order. */
  bullets: readonly string[];
  highlighted: boolean;
}

export const PLANS: readonly Plan[] = [
  {
    id: "curral",
    name: "Curral",
    monthlyBrl: 0,
    yearlyBrl: null,
    maxHeads: 50,
    maxFarms: 1,
    maxUsers: 1,
    bullets: ["1 fazenda · 1 usuário", "Todas as telas", "Importação da planilha", "Suporte por e-mail"],
    highlighted: false,
  },
  {
    id: "fazenda",
    name: "Fazenda",
    monthlyBrl: 8900,
    yearlyBrl: 89000,
    maxHeads: 500,
    maxFarms: 1,
    maxUsers: 3,
    bullets: ["1 fazenda · 3 usuários", "Todas as telas", "Importação da planilha", "Suporte no WhatsApp"],
    highlighted: true,
  },
  {
    id: "fazenda_pro",
    name: "Fazenda Pro",
    monthlyBrl: 18900,
    yearlyBrl: 189000,
    maxHeads: 2000,
    maxFarms: 3,
    maxUsers: null,
    bullets: [
      "3 fazendas · usuários ilimitados",
      "Todas as telas",
      "Importação da planilha",
      "Suporte prioritário no WhatsApp",
    ],
    highlighted: false,
  },
  {
    id: "consultor",
    name: "Consultor",
    monthlyBrl: null,
    yearlyBrl: null,
    maxHeads: null,
    maxFarms: null,
    maxUsers: null,
    bullets: [
      "Preço por fazenda",
      "Painel de todas as fazendas",
      "Desconto para associações",
      "Gerente de conta",
    ],
    highlighted: false,
  },
];

/** The plan with that id, or null for anything that is not a PlanId. */
export function planById(id: string): Plan | null {
  return PLANS.find((plan) => plan.id === id) ?? null;
}

/** "R$ 89" / "R$ 1.890" from centavos; centavos shown only when not zero. */
export function formatPlanPrice(centavos: number): string {
  const reais = centavos / 100;
  const decimals = centavos % 100 === 0 ? 0 : 2;
  return `R$ ${formatNumber(reais, decimals)}`;
}

/** Months the annual price waives: 2 on the paid tiers, 0 elsewhere. */
export function annualFreeMonths(plan: Plan): number {
  if (plan.monthlyBrl === null || plan.yearlyBrl === null || plan.monthlyBrl === 0) return 0;
  return 12 - Math.round(plan.yearlyBrl / plan.monthlyBrl);
}

/** "até 500 cabeças", or "fazendas ilimitadas" for the tier without a cap. */
export function capLabel(plan: Plan): string {
  if (plan.maxHeads === null) return "fazendas ilimitadas";
  return `até ${formatNumber(plan.maxHeads)} cabeças`;
}

/**
 * Price in centavos for the interval, or null when that plan is not sold that
 * way — the free tier has no price to put on a checkout either.
 */
export function priceFor(plan: Plan, interval: BillingInterval): number | null {
  if (interval === "month") return plan.monthlyBrl === 0 ? null : plan.monthlyBrl;
  return plan.yearlyBrl;
}
