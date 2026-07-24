/**
 * ILLUSTRATIVE beef cattle market data (deterministic, own seed) and the
 * swap point for a real quote source.
 *
 * Nothing here is an official quote: the numbers only feed the UI.
 */
import { TODAY_ISO, parseISODate, monthYearLabel, toISO } from "@/lib/domain/dates";
import { type Rng, chance, createRng, intBetween } from "@/lib/data/rng";

/** Fat steer arroba quote point (R$/@) on an ISO date. */
export interface ArrobaQuote {
  date: string;
  value: number;
}

/** Payload served by /api/market/quote and consumed by the UI. */
export interface MarketQuotePayload {
  /** Latest quote of the source. */
  current: ArrobaQuote;
  /** Change vs the previous point in %, or null when the source has no history. */
  changePct: number | null;
  /** Historical points, ascending (may be empty for snapshot-only sources). */
  series: ArrobaQuote[];
  /** User-visible source label. */
  source: string;
}

/** Consolidated revenue and cost of a month (short label, e.g.: "jul/26"). */
export interface MonthlyRevenueCost {
  month: string;
  revenue: number;
  cost: number;
}

/** Slice of the farm cost breakdown, in % (the slices add up to 100). */
export interface CostBreakdown {
  category: string;
  pct: number;
}

/** Market panel and illustrative economic indicators of the farm. */
export interface LivestockMarket {
  currentArrobaPrice: number;
  monthlyChangePct: number;
  quoteSeries: ArrobaQuote[];
  monthlyRevenueCost: MonthlyRevenueCost[];
  costBreakdown: CostBreakdown[];
  productionCostPerArroba: number;
  averageCalfPrice: number;
  averageArrobasPerSteer: number;
  dailyCostPerHead: number;
  headSoldPerYear: number;
  arrobasProducedPerYear: number;
}

const MARKET_SEED = 20260724;
const SERIES_MONTHS = 12;
const CURRENT_ARROBA_PRICE = 308.5;
const MONTHLY_CHANGE_PCT = 2.1;
const AVERAGE_ARROBAS_PER_STEER = 19.5;
const HEAD_SOLD_PER_YEAR = 34;
/** Months (series indices) forced to a negative result. */
const NEGATIVE_MONTHS: ReadonlySet<number> = new Set([1, 5, 10]);

/** First day of the i-th month of the series (the last month is the month of TODAY_ISO). */
function seriesMonth(index: number): string {
  const ref = parseISODate(TODAY_ISO);
  return toISO(new Date(ref.getFullYear(), ref.getMonth() - (SERIES_MONTHS - 1 - index), 1));
}

/**
 * Plausible monthly walk between 285 and 312 R$/@. The last two points are
 * fixed to close at currentArrobaPrice with the declared monthly change.
 */
function generateQuoteSeries(rng: Rng): ArrobaQuote[] {
  const series: ArrobaQuote[] = [];
  let value = 291;
  for (let i = 0; i < SERIES_MONTHS; i++) {
    if (i === SERIES_MONTHS - 2) {
      value = CURRENT_ARROBA_PRICE / (1 + MONTHLY_CHANGE_PCT / 100);
    } else if (i === SERIES_MONTHS - 1) {
      value = CURRENT_ARROBA_PRICE;
    } else if (i > 0) {
      const step = chance(rng, 0.58) ? rng() * 4.5 : -(rng() * 3.5);
      value = Math.min(311, Math.max(286, value + step));
    }
    series.push({ date: seriesMonth(i), value: Math.round(value * 100) / 100 });
  }
  return series;
}

/** 12 months of revenue x cost, with exactly 3 months of negative result. */
function generateMonthlyRevenueCost(rng: Rng): MonthlyRevenueCost[] {
  return Array.from({ length: SERIES_MONTHS }, (_, i) => {
    const month = monthYearLabel(seriesMonth(i));
    if (NEGATIVE_MONTHS.has(i)) {
      const revenue = intBetween(rng, 60000, 78000);
      return { month, revenue, cost: intBetween(rng, revenue + 4000, 95000) };
    }
    const revenue = intBetween(rng, 88000, 140000);
    return { month, revenue, cost: intBetween(rng, 45000, 80000) };
  });
}

function createMockMarket(): LivestockMarket {
  const rng = createRng(MARKET_SEED);
  return {
    currentArrobaPrice: CURRENT_ARROBA_PRICE,
    monthlyChangePct: MONTHLY_CHANGE_PCT,
    quoteSeries: generateQuoteSeries(rng),
    monthlyRevenueCost: generateMonthlyRevenueCost(rng),
    costBreakdown: [
      { category: "Nutrição", pct: 34 },
      { category: "Pastagem", pct: 18 },
      { category: "Mão de obra", pct: 16 },
      { category: "Sanidade", pct: 12 },
      { category: "Reprodução", pct: 8 },
      { category: "Administrativo", pct: 12 },
    ],
    productionCostPerArroba: 246,
    averageCalfPrice: 2850,
    averageArrobasPerSteer: AVERAGE_ARROBAS_PER_STEER,
    dailyCostPerHead: 8.9,
    headSoldPerYear: HEAD_SOLD_PER_YEAR,
    // Estimate: heads sold x average arrobas, discounting light categories.
    arrobasProducedPerYear: Math.round(HEAD_SOLD_PER_YEAR * AVERAGE_ARROBAS_PER_STEER * 0.9),
  };
}

/** Illustrative market data used by the UI while there is no real source. */
export const mockMarket: LivestockMarket = createMockMarket();

/**
 * Port to an arroba quote source.
 *
 * To plug in a real source, create a class that implements this interface and
 * replace MockQuoteSource at the injection point:
 * - ESALQ/CEPEA: fetch from the Fat Steer Indicator (daily series in CSV/API from
 *   CEPEA), mapping each line to { date: ISO "YYYY-MM-DD", value }.
 * - B3: fat steer futures contracts (BGI) via a licensed market-data API.
 * - Scot Consultoria: quotes by region via subscription, converting the farm's
 *   reference region to the monthly series.
 * The UI depends only on this interface, so the swap requires no other change.
 */
export interface QuoteSource {
  getCurrentQuote(): Promise<ArrobaQuote>;
  getSeries(months: number): Promise<ArrobaQuote[]>;
}

/** Mock implementation: responds immediately with the illustrative data. */
export class MockQuoteSource implements QuoteSource {
  async getCurrentQuote(): Promise<ArrobaQuote> {
    return { date: TODAY_ISO, value: mockMarket.currentArrobaPrice };
  }

  async getSeries(months: number): Promise<ArrobaQuote[]> {
    return mockMarket.quoteSeries.slice(-months).map((c) => ({ ...c }));
  }
}
