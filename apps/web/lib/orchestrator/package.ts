/**
 * Assembling the VerifiedResultPackage.
 *
 * This is the only thing the explanation model, the Truth Panel and the Speech
 * Writer ever see. Raw records never reach it, and allowed_numbers is built
 * here so the grounding check has something to check against.
 */
import { computeVerdict, withVariance } from "./verdict";
import type { QueryPlan, VerifiedResultPackage } from "./types";

const READING_TEXT: Record<string, string> = {
  debits: "debits only", net: "net of credits",
  include: "bank charges included", exclude: "bank charges excluded",
  entity: "all accounts of the entity", account: "the named accounts only",
};

export function interpretationText(plan: QueryPlan): string {
  const interpretation = plan.interpretation ?? {};
  const parts = [
    READING_TEXT[interpretation.spend ?? "debits"],
    READING_TEXT[interpretation.charges ?? "include"],
    READING_TEXT[interpretation.scope ?? "entity"],
  ];
  const period = plan.filters?.period;
  if (period?.label) parts.push(period.kind === "trailing" ? "trailing window" : "calendar period");
  return parts.join(", ");
}

function collect(...values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
               .map((v) => Math.round(v * 100) / 100);
}

/** Build the package from a plan and the query service's result. */
export function buildPackage(question: string, plan: QueryPlan, result: any): VerifiedResultPackage {
  const primary = result.primary?.value ?? 0;
  const alternatives = withVariance(primary, result.alternatives ?? []);
  const verdict = computeVerdict(primary, result.alternatives ?? []);
  const breakdown = (result.primary?.rows ?? []).map((row: any) => ({
    key: row.key, value: row.value, count: row.count,
  }));

  const allowed = new Set<number>([
    ...collect(primary, verdict.max_variance_pct),
    ...alternatives.flatMap((a) => collect(a.value, a.variance_pct)),
    ...breakdown.flatMap((b: any) => collect(b.value, b.count)),
    ...(result.anomalies ?? []).flatMap((a: any) => collect(a.ratio, a.baseline_periods)),
  ]);

  return {
    question,
    answer_value: primary,
    answer_unit: plan.metric === "count" ? "count" : "INR",
    period_label: plan.filters?.period?.label ?? null,
    interpretation_text: interpretationText(plan),
    verdict,
    alternatives,
    breakdown,
    evidence_ref: result.evidence?.ref ?? null,
    anomalies: result.anomalies ?? [],
    allowed_numbers: [...allowed],
    clarification: null,
    refusal: null,
    explanation: "",
    explanation_source: "template",
  };
}

/** A package that carries a question back to the user instead of a number. */
export function emptyPackage(question: string,
                             extra: Partial<VerifiedResultPackage>): VerifiedResultPackage {
  return {
    question,
    answer_value: null,
    answer_unit: "none",
    period_label: null,
    interpretation_text: "No number was computed",
    verdict: { status: "Stable", max_variance_pct: 0, axis: null, materiality_ok: false,
               single_reading: true, thresholds: { stable: 5, sensitive: 15 } },
    alternatives: [],
    breakdown: [],
    evidence_ref: null,
    anomalies: [],
    allowed_numbers: [0],
    clarification: null,
    refusal: null,
    explanation: "",
    explanation_source: "template",
    ...extra,
  };
}
