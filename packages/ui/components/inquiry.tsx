"use client";

/**
 * Inquiry surfaces.
 *
 * Three ways of pressing on an answer that has already been computed. All
 * three are built only from readings the query service actually ran: nothing
 * here estimates, interpolates or predicts. Where a value is unknown the
 * control says so and offers to recompute rather than filling the gap.
 */

import React from "react";
import { formatIndian } from "../format";
import { MonthBars, VarianceStrip, type Bucket, type Reading } from "./viz";
import { Chip } from "./primitives";

/* --------------------------------------------------------------- WhatIf */

export interface Axis {
  /** The name of the interpretation axis, e.g. "period boundary". */
  axis: string;
  /** The reading currently in force. */
  current: string;
  /** Other readings, each with the value it actually produced. */
  options: { reading: string; value: number | null; variance_pct: number | null }[];
}

/**
 * Counterfactual control.
 *
 * Each axis is a real fork in how the question could be read. Selecting a
 * different reading swaps in the value that reading actually produced, and the
 * verdict recomputes from the resulting spread. A reading whose value was
 * never computed is offered but marked, and asks the parent to run it.
 */
export function WhatIf({
  primary,
  axes,
  materialityPct = 5,
  onRecompute,
}: {
  primary: number;
  axes: Axis[];
  materialityPct?: number;
  onRecompute?: (axis: string, reading: string) => void;
}) {
  const [choice, setChoice] = React.useState<Record<string, string>>({});

  const chosen = axes.map((axis) => {
    const reading = choice[axis.axis] ?? axis.current;
    const option = axis.options.find((o) => o.reading === reading);
    return { axis: axis.axis, reading, value: option?.value ?? null, isDefault: reading === axis.current };
  });

  const moved = chosen.filter((c) => !c.isDefault && c.value !== null);
  // Only one axis can be substituted at a time and remain honest: the service
  // computed each alternative independently, not in combination.
  const substituted = moved.length === 1 ? moved[0].value : null;
  const shown = substituted ?? primary;
  const deltaPct = primary === 0 ? 0 : ((shown - primary) / Math.abs(primary)) * 100;
  const verdict =
    Math.abs(deltaPct) < materialityPct ? "Stable" : Math.abs(deltaPct) < materialityPct * 3 ? "Sensitive" : "Fragile";

  return (
    <div data-kit="WhatIf" className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span data-numeric className="text-[length:var(--text-xl)] font-semibold tracking-[var(--tracking-tight)]">
          ₹{formatIndian(shown, true)}
        </span>
        {substituted !== null ? (
          <>
            <span data-numeric className="text-[length:var(--text-xs)] text-[hsl(var(--ink-3))] line-through">
              ₹{formatIndian(primary, true)}
            </span>
            <span data-numeric className="text-[length:var(--text-xs)] text-[hsl(var(--ink-2))]">
              {deltaPct > 0 ? "+" : ""}
              {deltaPct.toFixed(1)}%
            </span>
            <Chip tone={verdict === "Stable" ? "success" : verdict === "Sensitive" ? "warning" : "danger"}>
              would read {verdict}
            </Chip>
          </>
        ) : (
          <span className="text-[length:var(--text-xs)] text-[hsl(var(--ink-3))]">
            the answer as asked
          </span>
        )}
      </div>

      {axes.length === 0 ? (
        <p className="text-[length:var(--text-sm)] text-[hsl(var(--ink-3))]">
          This question has only one reasonable reading, so there is nothing to vary.
        </p>
      ) : null}

      {axes.map((axis) => (
        <div key={axis.axis}>
          <span className="label">{axis.axis}</span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[{ reading: axis.current, value: primary, variance_pct: 0 }, ...axis.options.filter((o) => o.reading !== axis.current)].map(
              (option) => {
                const selected = (choice[axis.axis] ?? axis.current) === option.reading;
                const unknown = option.value === null;
                return (
                  <button
                    key={option.reading}
                    type="button"
                    onClick={() => {
                      if (unknown) {
                        onRecompute?.(axis.axis, option.reading);
                        return;
                      }
                      setChoice((current) => ({ ...current, [axis.axis]: option.reading }));
                    }}
                    className={
                      "rounded-[var(--radius-sm)] border px-2 py-1 text-[length:var(--text-xs)] " +
                      "transition-colors duration-[var(--motion-fast)] " +
                      (selected
                        ? "border-[hsl(var(--ink))] bg-[hsl(var(--ink))] text-[hsl(var(--surface))]"
                        : "border-[hsl(var(--rule))] text-[hsl(var(--ink-2))] hover:border-[hsl(var(--ink-3))]")
                    }
                  >
                    {option.reading}
                    {unknown ? (
                      <span className="ml-1.5 opacity-60">not computed</span>
                    ) : option.variance_pct ? (
                      <span data-numeric className="ml-1.5 opacity-60">
                        {option.variance_pct > 0 ? "+" : ""}
                        {option.variance_pct}%
                      </span>
                    ) : null}
                  </button>
                );
              },
            )}
          </div>
        </div>
      ))}

      {moved.length > 1 ? (
        <p className="rounded-[var(--radius-sm)] border border-[hsl(var(--sensitive))] bg-[hsl(var(--sensitive-soft))] px-2.5 py-1.5 text-[length:var(--text-xs)] text-[hsl(var(--sensitive))]">
          Each alternative was computed on its own, so two of them cannot be combined into one
          figure. Showing the answer as asked until one axis is left changed.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------- AdversarialAudit */

export interface Attack {
  name: string;
  /** What was tried against the answer. */
  attempt: string;
  /** What came back. */
  finding: string;
  /** True when the answer held. */
  survived: boolean;
  /** How far the answer moved under this attack, if it moved. */
  movedPct?: number;
}

/**
 * The self-audit.
 *
 * After computing an answer the system tries to break it: recomputing under
 * every other reading, checking the total against its own breakdown, looking
 * for rows it could not attribute, and re-running the reconciliation. What is
 * shown here is the outcome of those attempts, including the ones that
 * succeeded in moving the number. An audit with nothing to report is stated as
 * such rather than dressed up.
 */
export function AdversarialAudit({
  attacks,
  strongest,
}: {
  attacks: Attack[];
  /** The counter-reading that moved the answer furthest, if any survived. */
  strongest?: { label: string; value: number; variance_pct: number } | null;
}) {
  const broke = attacks.filter((a) => !a.survived);

  return (
    <div data-kit="AdversarialAudit" className="space-y-3">
      <div className="flex items-center gap-2">
        {broke.length === 0 ? (
          <Chip tone="success">Held under {attacks.length} attempts to break it</Chip>
        ) : (
          <Chip tone="warning">
            {broke.length} of {attacks.length} attempts moved the answer
          </Chip>
        )}
      </div>

      {strongest ? (
        <div className="rounded-[var(--radius-sm)] border border-[hsl(var(--rule))] bg-[hsl(var(--surface-sunken))] p-2.5">
          <span className="label">Strongest counter-reading found</span>
          <p className="mt-1 text-[length:var(--text-sm)] text-[hsl(var(--ink))]">
            Read as <strong className="font-semibold">{strongest.label}</strong> the answer is{" "}
            <span data-numeric>₹{formatIndian(strongest.value, true)}</span>, a difference of{" "}
            <span data-numeric>{strongest.variance_pct}%</span>.
          </p>
        </div>
      ) : null}

      <ul className="divide-y divide-[hsl(var(--rule-faint))]">
        {attacks.map((attack) => (
          <li key={attack.name} className="flex items-start gap-2.5 py-2">
            <span
              aria-hidden="true"
              className={
                "mt-1 h-1.5 w-1.5 shrink-0 rounded-full " +
                (attack.survived ? "bg-[hsl(var(--stable))]" : "bg-[hsl(var(--sensitive))]")
              }
            />
            <span className="min-w-0">
              <span className="block text-[length:var(--text-sm)] text-[hsl(var(--ink))]">{attack.attempt}</span>
              <span className="mt-0.5 block text-[length:var(--text-xs)] text-[hsl(var(--ink-3))]">
                {attack.finding}
                {attack.movedPct !== undefined ? (
                  <span data-numeric className="ml-1">
                    ({attack.movedPct > 0 ? "+" : ""}
                    {attack.movedPct}%)
                  </span>
                ) : null}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- TimeScrub */

/**
 * The ledger under the current question, month by month.
 *
 * Dragging the handles narrows the window; releasing re-asks the question over
 * the new window rather than slicing a cached total, so the number stays a
 * computed number.
 */
export function TimeScrub({
  buckets,
  window: activeWindow,
  onCommit,
  comparePrevious,
}: {
  buckets: Bucket[];
  /** Keys currently inside the answer's window. */
  window: string[];
  onCommit?: (from: string, to: string) => void;
  /** The previous period's total, drawn as a reference line. */
  comparePrevious?: number;
}) {
  const keys = buckets.map((b) => b.key);
  const initialFrom = keys.indexOf(activeWindow[0] ?? keys[0]);
  const initialTo = keys.indexOf(activeWindow[activeWindow.length - 1] ?? keys[keys.length - 1]);
  const [from, setFrom] = React.useState(Math.max(0, initialFrom));
  const [to, setTo] = React.useState(Math.max(0, initialTo));

  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const selected = keys.slice(lo, hi + 1);
  const total = buckets.slice(lo, hi + 1).reduce((sum, b) => sum + b.value, 0);
  const changed = selected.join() !== activeWindow.join();

  return (
    <div data-kit="TimeScrub" className="space-y-3">
      <MonthBars buckets={buckets} selected={selected} compareValue={comparePrevious} />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">From</span>
          <input
            type="range"
            min={0}
            max={keys.length - 1}
            value={from}
            onChange={(event) => setFrom(Number(event.target.value))}
            className="mt-1 w-full accent-[hsl(var(--accent))]"
            aria-label="Window start"
          />
        </label>
        <label className="block">
          <span className="label">To</span>
          <input
            type="range"
            min={0}
            max={keys.length - 1}
            value={to}
            onChange={(event) => setTo(Number(event.target.value))}
            className="mt-1 w-full accent-[hsl(var(--accent))]"
            aria-label="Window end"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-[hsl(var(--rule))] pt-2">
        <span className="text-[length:var(--text-xs)] text-[hsl(var(--ink-3))]">
          {buckets[lo]?.label} to {buckets[hi]?.label}
        </span>
        <span className="flex items-baseline gap-2">
          <span data-numeric className="text-[length:var(--text-sm)] text-[hsl(var(--ink))]">
            ₹{formatIndian(total)}
          </span>
          <span className="text-[length:var(--text-2xs)] text-[hsl(var(--ink-3))]">
            summed from the months shown
          </span>
        </span>
      </div>

      {changed && onCommit ? (
        <button
          type="button"
          onClick={() => onCommit(keys[lo], keys[hi])}
          className="w-full rounded-[var(--radius-sm)] border border-[hsl(var(--ink))] bg-[hsl(var(--ink))] px-3 py-1.5 text-[length:var(--text-xs)] font-medium text-[hsl(var(--surface))]"
        >
          Ask the question again over this window
        </button>
      ) : null}
    </div>
  );
}

/** Re-exported so a consumer can build the verdict picture without two imports. */
export { VarianceStrip };
export type { Reading, Bucket };
