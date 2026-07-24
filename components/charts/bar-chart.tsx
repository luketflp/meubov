import { cn } from "@/lib/utils";

export interface GroupBar {
  key: string;
  value: number;
  colorClass: string;
}

export interface BarGroup {
  label: string;
  bars: GroupBar[];
}

interface BarChartProps {
  groups: BarGroup[];
  height?: number;
  formatValue?: (value: number) => string;
  legend?: boolean;
}

const WIDTH = 640;
const MARGIN = { top: 12, right: 16, bottom: 24, left: 48 } as const;
const GRID_LINES = 4;
const MAX_BAR_WIDTH = 28;
const BAR_GAP = 4;

function formatDefault(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function roundedTopBarPath(
  x: number,
  topY: number,
  width: number,
  baseY: number
): string {
  const barHeight = baseY - topY;
  if (barHeight <= 0) return "";
  const radius = Math.min(3, width / 2, barHeight);
  return [
    `M ${x.toFixed(1)} ${baseY.toFixed(1)}`,
    `L ${x.toFixed(1)} ${(topY + radius).toFixed(1)}`,
    `Q ${x.toFixed(1)} ${topY.toFixed(1)} ${(x + radius).toFixed(1)} ${topY.toFixed(1)}`,
    `L ${(x + width - radius).toFixed(1)} ${topY.toFixed(1)}`,
    `Q ${(x + width).toFixed(1)} ${topY.toFixed(1)} ${(x + width).toFixed(1)} ${(topY + radius).toFixed(1)}`,
    `L ${(x + width).toFixed(1)} ${baseY.toFixed(1)}`,
    "Z",
  ].join(" ");
}

export function BarChart({
  groups,
  height = 200,
  formatValue = formatDefault,
  legend = false,
}: BarChartProps) {
  if (groups.length === 0) return null;

  const maxValue = Math.max(1, ...groups.flatMap((group) => group.bars.map((b) => b.value)));
  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const baseY = MARGIN.top + innerHeight;
  const slotWidth = innerWidth / groups.length;

  const coordY = (value: number): number =>
    MARGIN.top + (1 - Math.max(value, 0) / maxValue) * innerHeight;

  const gridLevels = Array.from(
    { length: GRID_LINES },
    (_, index) => maxValue - (index / (GRID_LINES - 1)) * maxValue
  );
  const legendItems = groups[0].bars.map(({ key, colorClass }) => ({ key, colorClass }));

  return (
    <div>
      {legend ? (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {legendItems.map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-1.5 text-xs text-ink-soft"
            >
              <span className={cn("size-2 rounded-full bg-current", item.colorClass)} aria-hidden />
              {item.key}
            </span>
          ))}
        </div>
      ) : null}

      <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" role="img" className="block">
        <g className="text-hairline">
          {gridLevels.map((level) => (
            <line
              key={level}
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={coordY(level)}
              y2={coordY(level)}
              stroke="currentColor"
              strokeWidth={1}
            />
          ))}
        </g>

        <g className="text-ink-soft">
          {gridLevels.map((level) => (
            <text
              key={level}
              x={MARGIN.left - 8}
              y={coordY(level) + 3}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
              className="font-mono"
            >
              {formatValue(level)}
            </text>
          ))}
          {groups.map((group, index) => (
            <text
              key={group.label}
              x={MARGIN.left + (index + 0.5) * slotWidth}
              y={height - 8}
              textAnchor="middle"
              fontSize={10}
              fill="currentColor"
            >
              {group.label}
            </text>
          ))}
        </g>

        {groups.map((group, groupIndex) => {
          const count = group.bars.length;
          const barWidth = Math.min(
            MAX_BAR_WIDTH,
            (slotWidth * 0.7 - BAR_GAP * (count - 1)) / count
          );
          const clusterWidth = count * barWidth + (count - 1) * BAR_GAP;
          const startX = MARGIN.left + (groupIndex + 0.5) * slotWidth - clusterWidth / 2;

          return group.bars.map((bar, barIndex) => (
            <g key={`${group.label}-${bar.key}`} className={bar.colorClass}>
              <path
                d={roundedTopBarPath(
                  startX + barIndex * (barWidth + BAR_GAP),
                  coordY(bar.value),
                  barWidth,
                  baseY
                )}
                fill="currentColor"
              />
            </g>
          ));
        })}
      </svg>
    </div>
  );
}
