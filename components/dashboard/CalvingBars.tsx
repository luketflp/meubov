/**
 * Parição by month: the calvings recorded as solid brand bars, the ones still
 * expected stacked on top as a dashed outline, the month's total above.
 */
import type { CalvingMonth } from "@/lib/store/dashboard";
import { MONTH_ABBREV, parseISODate } from "@/lib/domain/dates";

const WIDTH = 320;
const HEIGHT = 150;
const TOP = 22;
const BOTTOM = 24;
const SIDE = 8;

export function CalvingBars({ months }: { months: CalvingMonth[] }) {
  const peak = Math.max(1, ...months.map((month) => month.born + month.due));
  const inner = HEIGHT - TOP - BOTTOM;
  const base = TOP + inner;
  const slot = (WIDTH - SIDE * 2) / months.length;
  const barWidth = Math.min(40, slot * 0.55);
  const size = (value: number) => (value / peak) * inner;
  const label = (month: CalvingMonth) => MONTH_ABBREV[parseISODate(month.date).getMonth()];
  const summary = months
    .map((month) => `${label(month)}: ${month.born} nascidos, ${month.due} previstos`)
    .join("; ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label={`Partos por mês — ${summary}`}
      className="block"
    >
      <line x1={SIDE} x2={WIDTH - SIDE} y1={base} y2={base} strokeWidth={1} className="stroke-hairline" />
      {months.map((month, index) => {
        const center = SIDE + slot * index + slot / 2;
        const x = center - barWidth / 2;
        const bornHeight = size(month.born);
        const dueHeight = size(month.due);
        const total = month.born + month.due;
        return (
          <g key={month.date}>
            {month.born > 0 ? (
              <rect
                x={x}
                y={base - bornHeight}
                width={barWidth}
                height={bornHeight}
                rx={3}
                className="fill-brand"
              />
            ) : null}
            {month.due > 0 ? (
              <rect
                x={x + 0.5}
                y={base - bornHeight - dueHeight + 0.5}
                width={barWidth - 1}
                height={Math.max(dueHeight - 1, 0)}
                rx={3}
                strokeDasharray="3 2"
                className="fill-brand-soft stroke-brand"
              />
            ) : null}
            {total > 0 ? (
              <text
                x={center}
                y={base - bornHeight - dueHeight - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={500}
                className="fill-ink font-mono"
              >
                {total}
              </text>
            ) : null}
            <text x={center} y={HEIGHT - 8} textAnchor="middle" fontSize={10} className="fill-ink-soft">
              {label(month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
