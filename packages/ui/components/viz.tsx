"use client";

/**
 * Data visualisation.
 *
 * Every chart here is inline SVG drawn from tokens, so it inherits the theme
 * and needs no library. The rules they all follow: the primary series is ink,
 * the comparison is the accent, gridlines are faint, and no chart invents a
 * value it was not given. Where a number is drawn it is also written, because
 * a pixel is not evidence.
 */

import React from "react";
import { formatIndian } from "../format";

const AXIS = "hsl(var(--viz-grid))";

/* --------------------------------------------------------------- Sparkline */

export function Sparkline({
  values,
  width = 120,
  height = 28,
  highlight,
  tone = "ink",
  className = "",
}: {
  values: number[];
  width?: number;
  height?: number;
  /** Index of the point to mark, usually the one under discussion. */
  highlight?: number;
  tone?: "ink" | "accent";
  className?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const stroke = tone === "accent" ? "hsl(var(--viz-2))" : "hsl(var(--viz-1))";

  return (
    <svg
      data-kit="Sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Trend across ${values.length} periods`}
    >
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinejoin="round" />
      {highlight !== undefined && values[highlight] !== undefined ? (
        <circle cx={highlight * step} cy={y(values[highlight])} r="2.5" fill={stroke} />
      ) : null}
    </svg>
  );
}

/* ------------------------------------------------------------------ BarRow */

/** One horizontal bar with its label and figure. Used for rankings. */
export function BarRow({
  label,
  value,
  max,
  count,
  onClick,
  active = false,
  decimals = false,
}: {
  label: string;
  value: number;
  max: number;
  count?: number;
  onClick?: () => void;
  active?: boolean;
  decimals?: boolean;
}) {
  const pct = max > 0 ? Math.max(1, (value / max) * 100) : 0;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      data-kit="BarRow"
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={
        "group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-[var(--radius-sm)] " +
        "px-1.5 py-1 text-left transition-colors duration-[var(--motion-fast)] " +
        (active ? "bg-[hsl(var(--accent-soft))]" : onClick ? "hover:bg-[hsl(var(--surface-sunken))]" : "")
      }
    >
      <span className="min-w-0 truncate text-[length:var(--text-sm)] text-[hsl(var(--ink))]" title={label}>
        {label}
      </span>
      <span data-numeric className="shrink-0 text-right text-[length:var(--text-sm)] text-[hsl(var(--ink))]">
        ₹{formatIndian(value, decimals)}
      </span>
      <span className="col-span-2 flex items-center gap-2">
        <span className="h-1 min-w-0 flex-1 rounded-full bg-[hsl(var(--rule-faint))]">
          <span
            className="block h-1 rounded-full bg-[hsl(var(--viz-1))] transition-[width] duration-[var(--motion-slow)]"
            style={{ width: `${pct}%` }}
          />
        </span>
        {count !== undefined ? (
          <span data-numeric className="shrink-0 text-[length:var(--text-2xs)] text-[hsl(var(--ink-3))]">
            {formatIndian(count)} rows
          </span>
        ) : null}
      </span>
    </Tag>
  );
}

/* ---------------------------------------------------------- VarianceStrip */

export interface Reading {
  label: string;
  value: number;
  /** Signed percentage difference from the primary reading. */
  variance_pct?: number;
}

/**
 * The verdict, drawn.
 *
 * The primary answer sits on a line; every alternative reading is a tick on the
 * same line, positioned by its real value. The shaded band is the materiality
 * threshold: a reading inside it does not change the decision, a reading
 * outside it does. This is the single most useful picture in the product,
 * because it turns "Sensitive" from a label into a distance.
 */
export function VarianceStrip({
  primary,
  readings,
  materialityPct = 5,
  height = 64,
}: {
  primary: number;
  readings: Reading[];
  materialityPct?: number;
  height?: number;
}) {
  const all = [primary, ...readings.map((r) => r.value)];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.18 || Math.abs(primary) * 0.08 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const x = (v: number) => ((v - min) / (max - min || 1)) * 100;

  const bandLo = x(primary * (1 - materialityPct / 100));
  const bandHi = x(primary * (1 + materialityPct / 100));

  return (
    <div data-kit="VarianceStrip" className="w-full" style={{ minHeight: height }}>
      <div className="relative h-8">
        {/* the materiality band */}
        <div
          aria-hidden="true"
          className="absolute top-3 h-2 rounded-sm bg-[hsl(var(--accent-soft))]"
          style={{ left: `${Math.min(bandLo, bandHi)}%`, width: `${Math.abs(bandHi - bandLo)}%` }}
        />
        {/* the axis */}
        <div aria-hidden="true" className="absolute top-4 h-px w-full" style={{ background: AXIS }} />

        {readings.map((reading) => (
          <div
            key={reading.label}
            className="group absolute top-1.5"
            style={{ left: `${x(reading.value)}%`, transform: "translateX(-50%)" }}
            title={`${reading.label}: ₹${formatIndian(reading.value, true)}`}
          >
            <span className="block h-5 w-px bg-[hsl(var(--viz-3))]" />
            <span className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] border border-[hsl(var(--rule))] bg-[hsl(var(--surface))] px-1.5 py-0.5 text-[length:var(--text-2xs)] text-[hsl(var(--ink-2))] opacity-0 shadow-[var(--shadow-1)] transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100">
              {reading.label}
            </span>
          </div>
        ))}

        {/* the primary reading, drawn last so it sits on top */}
        <div
          className="absolute top-0"
          style={{ left: `${x(primary)}%`, transform: "translateX(-50%)" }}
          title={`This answer: ₹${formatIndian(primary, true)}`}
        >
          <span className="block h-8 w-[2px] bg-[hsl(var(--ink))]" />
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between text-[length:var(--text-2xs)] text-[hsl(var(--ink-3))]">
        <span data-numeric>₹{formatIndian(min)}</span>
        <span>
          shaded band = within {materialityPct}% of the answer
        </span>
        <span data-numeric>₹{formatIndian(max)}</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- MonthBars */

export interface Bucket {
  key: string;
  label: string;
  value: number;
}

/**
 * A column chart over time with an optional selected range.
 *
 * Used by the time scrub: the bars are the ledger month by month, and the
 * selection is the window the current answer actually covers.
 */
export function MonthBars({
  buckets,
  selected,
  onSelect,
  height = 96,
  compareValue,
}: {
  buckets: Bucket[];
  /** Keys inside the current answer's window. */
  selected?: string[];
  onSelect?: (key: string) => void;
  height?: number;
  /** Draws a dashed reference line, e.g. the previous period's total. */
  compareValue?: number;
}) {
  const max = Math.max(...buckets.map((b) => b.value), compareValue ?? 0) || 1;
  const inWindow = (key: string) => !selected || selected.length === 0 || selected.includes(key);

  return (
    <div data-kit="MonthBars" className="w-full">
      <div className="relative flex items-end gap-1" style={{ height }}>
        {compareValue !== undefined ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[hsl(var(--viz-2))]"
            style={{ bottom: `${(compareValue / max) * 100}%` }}
          />
        ) : null}
        {buckets.map((bucket) => {
          const on = inWindow(bucket.key);
          const Tag = onSelect ? "button" : "div";
          return (
            <Tag
              key={bucket.key}
              {...(onSelect ? { type: "button" as const, onClick: () => onSelect(bucket.key) } : {})}
              title={`${bucket.label}: ₹${formatIndian(bucket.value)}`}
              className="group flex min-w-0 flex-1 flex-col justify-end"
              style={{ height: "100%" }}
            >
              <span
                className={
                  "w-full rounded-t-[1px] transition-[height,background-color] duration-[var(--motion-base)] " +
                  (on ? "bg-[hsl(var(--viz-1))]" : "bg-[hsl(var(--viz-4))]")
                }
                style={{ height: `${Math.max(1, (bucket.value / max) * 100)}%` }}
              />
            </Tag>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {buckets.map((bucket) => (
          <span
            key={bucket.key}
            className={
              "min-w-0 flex-1 truncate text-center text-[length:var(--text-2xs)] " +
              (inWindow(bucket.key) ? "text-[hsl(var(--ink-2))]" : "text-[hsl(var(--ink-4))]")
            }
          >
            {bucket.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- ShareBar */

/** A single stacked bar: how a total splits across channels or types. */
export function ShareBar({
  parts,
  height = 8,
}: {
  parts: { label: string; value: number }[];
  height?: number;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0) || 1;
  const fills = ["hsl(var(--viz-1))", "hsl(var(--viz-2))", "hsl(var(--viz-3))", "hsl(var(--viz-4))"];
  return (
    <div data-kit="ShareBar">
      <div className="flex w-full overflow-hidden rounded-full" style={{ height }}>
        {parts.map((part, index) => (
          <span
            key={part.label}
            title={`${part.label}: ${((part.value / total) * 100).toFixed(1)}%`}
            style={{ width: `${(part.value / total) * 100}%`, background: fills[index % fills.length] }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((part, index) => (
          <li key={part.label} className="flex items-center gap-1.5 text-[length:var(--text-2xs)]">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-[1px]"
              style={{ background: fills[index % fills.length] }}
            />
            <span className="text-[hsl(var(--ink-2))]">{part.label}</span>
            <span data-numeric className="text-[hsl(var(--ink-3))]">
              {((part.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- DeltaText */

/** A signed change, coloured only by direction, never by good or bad. */
export function Delta({ pct, className = "" }: { pct: number; className?: string }) {
  const sign = pct > 0 ? "+" : "";
  return (
    <span
      data-kit="Delta"
      data-numeric
      className={`text-[length:var(--text-xs)] ${pct === 0 ? "text-[hsl(var(--ink-3))]" : "text-[hsl(var(--ink-2))]"} ${className}`}
    >
      {sign}
      {pct.toFixed(1)}%
    </span>
  );
}
