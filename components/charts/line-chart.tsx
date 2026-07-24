"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export interface LinePoint {
  label: string;
  value: number;
}

interface LineChartProps {
  points: LinePoint[];
  height?: number;
  formatValue?: (value: number) => string;
  colorClass?: string;
  area?: boolean;
  highlightLast?: boolean;
}

const WIDTH = 640;
const MARGIN = { top: 20, right: 16, bottom: 24, left: 48 } as const;
const GRID_LINES = 4;

function formatDefault(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function LineChart({
  points,
  height = 200,
  formatValue = formatDefault,
  colorClass = "text-brand",
  area = false,
  highlightLast = false,
}: LineChartProps) {
  const gradientId = useId();

  if (points.length === 0) return null;

  const values = points.map((point) => point.value);
  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);
  if (minValue === maxValue) {
    minValue -= 1;
    maxValue += 1;
  }

  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const baseY = MARGIN.top + innerHeight;

  const coordX = (index: number): number =>
    points.length === 1
      ? MARGIN.left + innerWidth / 2
      : MARGIN.left + (index / (points.length - 1)) * innerWidth;
  const coordY = (value: number): number =>
    MARGIN.top + (1 - (value - minValue) / (maxValue - minValue)) * innerHeight;

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${coordX(index).toFixed(1)} ${coordY(point.value).toFixed(1)}`
    )
    .join(" ");
  const areaPath = `${linePath} L ${coordX(points.length - 1).toFixed(1)} ${baseY} L ${coordX(0).toFixed(1)} ${baseY} Z`;

  const gridLevels = Array.from(
    { length: GRID_LINES },
    (_, index) => maxValue - (index / (GRID_LINES - 1)) * (maxValue - minValue)
  );
  const labelStep = Math.ceil(points.length / 8);
  const lastIndex = points.length - 1;
  const lastValueX = Math.min(coordX(lastIndex), WIDTH - 34);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      width="100%"
      role="img"
      className={cn("block", colorClass)}
    >
      {area ? (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.2} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
      ) : null}

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
        {points.map((point, index) =>
          index % labelStep === 0 ? (
            <text
              key={point.label}
              x={coordX(index)}
              y={height - 8}
              textAnchor="middle"
              fontSize={10}
              fill="currentColor"
            >
              {point.label}
            </text>
          ) : null
        )}
      </g>

      {area ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {highlightLast ? (
        <>
          <circle
            cx={coordX(lastIndex)}
            cy={coordY(points[lastIndex].value)}
            r={3.5}
            fill="currentColor"
          />
          <g className="text-ink">
            <text
              x={lastValueX}
              y={coordY(points[lastIndex].value) - 9}
              textAnchor="middle"
              fontSize={10}
              fill="currentColor"
              className="font-mono"
            >
              {formatValue(points[lastIndex].value)}
            </text>
          </g>
        </>
      ) : null}
    </svg>
  );
}
