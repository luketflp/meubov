export interface DonutSlice {
  label: string;
  value: number;
  colorClass: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  center?: { value: string; label: string };
}

const SIZE = 120;
const CENTER = SIZE / 2;
const RADIUS = 45;
const THICKNESS = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({ slices, center }: DonutChartProps) {
  if (slices.length === 0) return null;

  const total = slices.reduce((sum, slice) => sum + Math.max(slice.value, 0), 0);

  const segments = slices
    .filter((slice) => slice.value > 0 && total > 0)
    .reduce<Array<{ slice: DonutSlice; fraction: number; start: number }>>((acc, slice) => {
      const fraction = slice.value / total;
      const start = acc.length > 0 ? acc[acc.length - 1].start + acc[acc.length - 1].fraction : 0;
      acc.push({ slice, fraction, start });
      return acc;
    }, []);

  const percentage = (value: number): number =>
    total > 0 ? Math.round((Math.max(value, 0) / total) * 100) : 0;

  return (
    <div className="flex items-center gap-5">
      <div className="w-full max-w-36 shrink-0">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" role="img" className="block">
          <g className="text-hairline">
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={THICKNESS}
            />
          </g>
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            {segments.map(({ slice, fraction, start }) => (
              <g key={slice.label} className={slice.colorClass}>
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={THICKNESS}
                  strokeDasharray={`${(fraction * CIRCUMFERENCE).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
                  strokeDashoffset={(-start * CIRCUMFERENCE).toFixed(2)}
                />
              </g>
            ))}
          </g>
          {center ? (
            <>
              <g className="text-ink">
                <text
                  x={CENTER}
                  y={CENTER - 1}
                  textAnchor="middle"
                  fontSize={17}
                  fill="currentColor"
                  className="font-mono font-medium"
                >
                  {center.value}
                </text>
              </g>
              <g className="text-ink-soft">
                <text
                  x={CENTER}
                  y={CENTER + 13}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                >
                  {center.label}
                </text>
              </g>
            </>
          ) : null}
        </svg>
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-xs">
            <span
              className={`size-2 shrink-0 rounded-full bg-current ${slice.colorClass}`}
              aria-hidden
            />
            <span className="truncate text-ink">{slice.label}</span>
            <span className="ml-auto font-mono text-ink-soft">
              {percentage(slice.value)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
