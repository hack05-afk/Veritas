/**
 * The Stability Engine.
 *
 * A verdict is a confidence signal, not a hedge: the primary number is always
 * stated first, and this only says whether the other reasonable readings of the
 * same question would move it.
 */
import type { Alternative, Axis, Verdict } from "./types";

export const THRESHOLDS = { stable: 5, sensitive: 15 };
/** Below this many rupees a difference is noise, whatever the percentage says. */
export const MATERIALITY_INR = 1000;

export function computeVerdict(primary: number, alternatives: Alternative[]): Verdict {
  let worst = 0;
  let axis: Axis | null = null;
  let material = false;

  for (const alternative of alternatives) {
    if (alternative.value === null || alternative.value === undefined) continue;
    const difference = Math.abs(primary - alternative.value);
    if (difference < MATERIALITY_INR) continue;
    material = true;
    const variance = (difference / Math.max(Math.abs(primary), 1)) * 100;
    if (variance > worst) {
      worst = variance;
      axis = alternative.axis;
    }
  }

  const status = worst < THRESHOLDS.stable ? "Stable"
    : worst <= THRESHOLDS.sensitive ? "Sensitive" : "Fragile";

  return {
    status,
    max_variance_pct: Math.round(worst * 100) / 100,
    axis,
    materiality_ok: material,
    single_reading: alternatives.length === 0,
    thresholds: THRESHOLDS,
  };
}

/** The variance each alternative carries, for the Truth Panel to list. */
export function withVariance(primary: number, alternatives: Alternative[]) {
  return alternatives.map((alternative) => ({
    ...alternative,
    variance_pct: alternative.value === null || alternative.value === undefined ? 0
      : Math.round((Math.abs(primary - alternative.value) / Math.max(Math.abs(primary), 1)) * 10000) / 100,
  }));
}
