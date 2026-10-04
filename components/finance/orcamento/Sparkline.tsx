/**
 * "Mês a mês": the realizado of each month up to today as bars, in the overdue
 * colour when it passes that month's orçado by more than 2 %, and the orçado
 * as a step line. 128 × 24, inline SVG.
 */
const H = 24;
const BAR = 7;
/** A bar and the gap after it. */
const STEP = 11;

interface SparklineProps {
  label: string;
  /** By safra month. */
  budgeted: number[];
  realized: number[];
  /** Months after it have no bar; -1 before the safra. */
  todayIndex: number;
}

export function Sparkline({ label, budgeted, realized, todayIndex }: SparklineProps) {
  const max = Math.max(1, ...budgeted, ...realized);
  const y = (value: number) => H - (value / max) * (H - 2);
  const planned = budgeted.some((value) => value > 0);
  const line = budgeted.map((value, i) => `${i * STEP},${y(value)} ${i * STEP + BAR},${y(value)}`).join(" ");
  return (
    <svg width="128" height={H} viewBox={`0 0 128 ${H}`} role="img" aria-label={`${label}: realizado mês a mês contra o orçado`}>
      <polyline points={line} fill="none" strokeWidth="1.25" strokeLinejoin="round" className="stroke-ink opacity-70" />
      {realized.slice(0, todayIndex + 1).map((value, i) => {
        const over = planned && value > budgeted[i] * 1.02;
        return (
          <rect
            key={i}
            x={i * STEP}
            y={y(value)}
            width={BAR}
            height={H - y(value)}
            rx="1"
            className={over ? "fill-overdue opacity-75" : "fill-brand opacity-55"}
          />
        );
      })}
    </svg>
  );
}
