/**
 * Turning a VerifiedResultPackage into the four inquiry surfaces.
 *
 * Every value below is read off the package. Nothing here estimates a reading
 * the query service did not run: where a value is missing it stays null, and
 * where a series does not exist the caller gets null rather than a placeholder.
 * The workspace rail and the truth panel share these functions so the same
 * answer cannot be described two different ways in two places.
 */
import { formatIndian, type Attack, type Axis as WhatIfAxis, type Bucket } from "@veritas/ui";

import type { QueryPlan, VerifiedResultPackage } from "@/lib/orchestrator/types";

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAME = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** A figure is grounded when the computation listed it. Compared to the paisa. */
export function grounded(value: number, allowed: number[]): boolean {
  return allowed.some((candidate) => Math.abs(candidate - value) < 0.005);
}

/** "2026-06" read as a month a person would say. */
export function monthLabel(key: string, short = true): string {
  if (!MONTH_KEY.test(key)) return key;
  const name = (short ? MONTH_NAME : MONTH_FULL)[Number(key.slice(5, 7)) - 1];
  return short ? `${name} ${key.slice(2, 4)}` : `${name} ${key.slice(0, 4)}`;
}

/**
 * The alternatives, regrouped by the axis they vary. Each axis becomes one row
 * of choices in the counterfactual control, carrying the value and variance the
 * service computed for that reading.
 */
export function toAxes(pkg: VerifiedResultPackage, plan?: QueryPlan): WhatIfAxis[] {
  const byAxis = new Map<string, WhatIfAxis>();
  for (const alternative of pkg.alternatives) {
    const name = alternative.axis;
    if (!byAxis.has(name)) {
      byAxis.set(name, {
        axis: name,
        current: plan?.interpretation?.[name] ?? "as asked",
        options: [],
      });
    }
    byAxis.get(name)!.options.push({
      reading: alternative.reading,
      value: alternative.value,
      variance_pct: alternative.variance_pct ?? null,
    });
  }
  return [...byAxis.values()];
}

/**
 * What the system tried against its own answer.
 *
 * One entry per alternative reading it recomputed, one for the breakdown
 * summing back to the total, one for the anomaly sweep, and one for the
 * grounding check. Nothing is listed that was not actually run.
 */
export function toAttacks(pkg: VerifiedResultPackage): Attack[] {
  const attacks: Attack[] = [];
  const threshold = pkg.verdict.thresholds.stable;

  for (const alternative of pkg.alternatives) {
    const moved = Math.abs(alternative.variance_pct ?? 0);
    attacks.push({
      name: `${alternative.axis}-${alternative.reading}`,
      attempt: `Recomputed reading ${alternative.axis} as ${alternative.reading}`,
      finding:
        alternative.value === null
          ? "That reading could not be computed on this data"
          : `Came back at ₹${formatIndian(alternative.value, true)}`,
      survived: alternative.value === null ? true : moved < threshold,
      movedPct: alternative.value === null ? undefined : alternative.variance_pct,
    });
  }

  if (pkg.verdict.single_reading && pkg.alternatives.length === 0) {
    attacks.push({
      name: "single-reading",
      attempt: "Looked for another reasonable reading of the question",
      finding: "The question admits only one reading, so there was nothing to vary",
      survived: true,
    });
  }

  const sums = toSumCheck(pkg);
  if (sums) attacks.push(sums);

  const anomaly = pkg.anomalies[0];
  attacks.push({
    name: "anomaly",
    attempt: "Swept for counterparties paid far above their recent average",
    finding: anomaly
      ? `${anomaly.subject} was paid ${anomaly.ratio} times its average over ${anomaly.baseline_periods} periods`
      : "No counterparty stood out against its own baseline",
    survived: !anomaly,
  });

  const figures = [
    pkg.answer_value,
    ...pkg.alternatives.map((alternative) => alternative.value),
    ...pkg.breakdown.map((row) => row.value),
  ].filter((value): value is number => value !== null && value !== undefined);
  const ungrounded = figures.filter((value) => !grounded(value, pkg.allowed_numbers));
  attacks.push({
    name: "grounding",
    attempt: "Checked every figure on this panel against the computation's allowed numbers",
    finding: ungrounded.length
      ? `${ungrounded.length} of ${figures.length} figures are not in allowed_numbers`
      : `All ${figures.length} figures are in allowed_numbers`,
    survived: ungrounded.length === 0,
  });

  return attacks;
}

/**
 * Does the breakdown add back up to the headline number?
 *
 * Only meaningful when the answer is an amount and the breakdown partitions it,
 * so a package without both is given no row at all.
 */
function toSumCheck(pkg: VerifiedResultPackage): Attack | null {
  if (pkg.answer_value === null || pkg.answer_unit !== "INR") return null;
  if (pkg.breakdown.length < 2) return null;

  const summed = pkg.breakdown.reduce((total, row) => total + row.value, 0);
  const gap = summed - pkg.answer_value;
  const gapPct = pkg.answer_value === 0 ? 0 : (gap / Math.abs(pkg.answer_value)) * 100;
  const holds = Math.abs(gapPct) < 0.01;

  return {
    name: "breakdown-sum",
    attempt: `Added the ${pkg.breakdown.length} breakdown rows back up and compared them with the total`,
    finding: holds
      ? "The parts sum to the total exactly"
      : `The parts sum to ₹${formatIndian(summed, true)}, a gap of ₹${formatIndian(Math.abs(gap), true)}`,
    survived: holds,
    movedPct: holds ? undefined : Number(gapPct.toFixed(2)),
  };
}

/** The strongest counter-reading is the one that moved the answer furthest. */
export function strongestCounter(pkg: VerifiedResultPackage) {
  const ranked = pkg.alternatives
    .filter((alternative) => alternative.value !== null)
    .sort((a, b) => Math.abs(b.variance_pct ?? 0) - Math.abs(a.variance_pct ?? 0));
  const top = ranked[0];
  if (!top || !top.variance_pct) return null;
  return { label: top.reading, value: top.value as number, variance_pct: top.variance_pct };
}

/**
 * Monthly buckets, only when the answer genuinely has them.
 *
 * The breakdown is the one honest source of a series in this package shape, so
 * the scrub appears when the plan grouped by month and the keys look like
 * months. Otherwise it is left out rather than drawn from a guess.
 */
export function toBuckets(pkg: VerifiedResultPackage, plan?: QueryPlan): Bucket[] | null {
  if (plan?.group_by !== "month") return null;
  const rows = pkg.breakdown.filter((row) => MONTH_KEY.test(row.key));
  if (rows.length < 2) return null;
  return rows.map((row) => ({ key: row.key, label: monthLabel(row.key), value: row.value }));
}

/** The same question, asked again over a window the reader chose. */
export function rewindow(question: string, from: string, to: string): string {
  const window =
    from === to
      ? monthLabel(from, false)
      : `${monthLabel(from, false)} to ${monthLabel(to, false)}`;
  return `${question.replace(/[?.]\s*$/, "")}, over ${window}`;
}
