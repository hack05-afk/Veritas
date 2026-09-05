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

/**
 * The intents the spend and charges readings mean anything for. This is the
 * same set the query service flips those axes on, so the sentence describes
 * the readings that were actually available.
 */
const SPEND_INTENTS = new Set([
  "spend_total", "spend_by_channel", "spend_by_counterparty",
  "counterparty_ranking", "period_compare",
]);

/** Intents whose number is a row count rather than an amount. */
const COUNT_INTENTS = new Set(["unreferenced", "reconciliation_transfers"]);

/** Intents that answer with money whatever metric the plan asked for. */
const ALWAYS_MONEY = new Set(["reconciliation_balance", "lookup_reference"]);

/** INR or count, decided by what the intent actually computes. */
export function answerUnit(plan: QueryPlan): "INR" | "count" {
  const intent = plan.intent ?? "";
  if (COUNT_INTENTS.has(intent)) return "count";
  if (ALWAYS_MONEY.has(intent)) return "INR";
  return plan.metric === "count" ? "count" : "INR";
}

/**
 * The reading the number was computed under, in words.
 *
 * Only the axes that apply to this intent are named. Telling someone their
 * account balance was read as "debits only, bank charges included" describes a
 * choice that was never made and reads as boilerplate.
 */
export function interpretationText(plan: QueryPlan): string {
  const interpretation = plan.interpretation ?? {};
  const intent = plan.intent ?? "";
  const parts: string[] = [];

  if (SPEND_INTENTS.has(intent)) {
    parts.push(READING_TEXT[interpretation.spend ?? "debits"]);
    parts.push(READING_TEXT[interpretation.charges ?? "include"]);
  }
  parts.push(READING_TEXT[interpretation.scope ?? "entity"]);
  if (intent === "lookup_reference") {
    parts.push(plan.filters?.reference?.column === "utr"
      ? "matched on the UTR" : "matched on the reference number");
  }

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
    answer_unit: answerUnit(plan),
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
