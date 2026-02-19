"use client";

import React from "react";

type SparklineProps = {
  values: Array<number | null | undefined>;
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
};

export function Sparkline({
  values,
  width = 220,
  height = 48,
  stroke = "#4a6a78",
  className,
}: SparklineProps) {
  const clean = values.map((v) => (v == null || Number.isNaN(v) ? null : Number(v)));
  const indexed = clean
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null);

  if (indexed.length < 1) {
    return <div className={`text-[11px] text-slate-500 ${className ?? ""}`}>Trend unavailable</div>;
  }

  const min = Math.min(...indexed.map((p) => p.v));
  const max = Math.max(...indexed.map((p) => p.v));
  const range = max - min || 1;
  const stepX = width / Math.max(clean.length - 1, 1);
  const yFor = (v: number) => height - ((v - min) / range) * (height - 6) - 3;

  const points = indexed.map((p) => `${p.i * stepX},${yFor(p.v)}`).join(" ");
  const last = indexed[indexed.length - 1];
  const lastX = last.i * stepX;
  const lastY = yFor(last.v);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label="Trend sparkline">
      {indexed.length > 1 ? (
        <polyline fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
      ) : (
        <line x1="0" y1={lastY} x2={width} y2={lastY} stroke={stroke} strokeWidth="1.5" strokeOpacity="0.35" />
      )}
      <circle cx={lastX} cy={lastY} r="2.5" fill={stroke} />
    </svg>
  );
}
