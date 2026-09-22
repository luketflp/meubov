"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Text color class the line takes (currentColor). */
  className?: string;
}

/** A small trend line with a soft area and the last point marked. No axes. */
export function Sparkline({ values, width = 150, height = 48, className }: SparklineProps) {
  const gradientId = useId();
  if (values.length < 2) return null;

  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const x = (index: number) => 2 + (index / (values.length - 1)) * (width - 4);
  const y = (value: number) => 3 + (1 - (value - low) / span) * (height - 6);
  const line = values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`)
    .join(" ");
  const last = values.length - 1;
  const area = `${line} L ${x(last).toFixed(1)} ${height} L 2 ${height} Z`;

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block shrink-0 overflow-visible text-brand", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(last)} cy={y(values[last])} r={2.5} fill="currentColor" />
    </svg>
  );
}
