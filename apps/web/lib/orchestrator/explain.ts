/**
 * The sentence under the number.
 *
 * The model may rewrite the templated explanation, but only if every digit it
 * writes is a number the computation actually produced. Otherwise the template
 * stands. This is the grounding check.
 */
import { chat } from "../llm/provider";
import type { VerifiedResultPackage } from "./types";

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** Indian grouping: 12,40,000 rather than 1,240,000. */
export function formatIndian(value: number): string {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(2).replace(/\.00$/, "");
  const [whole, decimals] = fixed.split(".");
  const last = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last}` : last;
  return `${negative ? "-" : ""}${grouped}${decimals ? `.${decimals}` : ""}`;
}

/** Whether every number in the text is one the computation produced. */
export function numbersAreAllowed(text: string, allowed: number[]): boolean {
  const permitted = new Set(allowed.map((n) => Math.round(n * 100) / 100));
  for (const match of text.match(NUMBER) ?? []) {
    const value = Math.round(parseFloat(match.replace(/,/g, "")) * 100) / 100;
    if (Number.isNaN(value)) continue;
    if (!permitted.has(value)) return false;
  }
  return true;
}

/** The explanation Veritas writes for itself, using only numbers it computed. */
export function templateExplanation(pkg: VerifiedResultPackage): string {
  if (pkg.refusal) {
    return `${pkg.refusal.reason} Ask for spend, receipts, counterparties, balances or a reference number instead.`;
  }
  if (pkg.clarification) {
    return `${pkg.clarification.question} Pick a reading and the number follows.`;
  }
  const amount = pkg.answer_unit === "INR" ? `₹${formatIndian(pkg.answer_value ?? 0)}`
                                           : `${formatIndian(pkg.answer_value ?? 0)}`;
  const first = `The answer is ${amount}, read as ${pkg.interpretation_text.toLowerCase()}.`;
  if (pkg.verdict.single_reading || !pkg.verdict.materiality_ok) {
    return `${first} Only one reading of this question applies, so the number does not move.`;
  }
  return `${first} Read another way it moves by ${pkg.verdict.max_variance_pct}%, so it is ${pkg.verdict.status.toLowerCase()}.`;
}

/**
 * Let the model rewrite the template, and keep its version only if it is grounded.
 */
export async function explain(pkg: VerifiedResultPackage, fakeExplainOverride?: string):
    Promise<{ explanation: string; explanation_source: "model" | "template" }> {
  const template = templateExplanation(pkg);
  try {
    const written = await chat([
      { role: "system", content: "Rewrite the explanation in two short plain sentences. Use only the numbers given. Add nothing." },
      { role: "user", content: `<explain>${template}</explain>` },
    ], { fakeExplainOverride });

    const candidate = written.trim();
    if (candidate && numbersAreAllowed(candidate, pkg.allowed_numbers)) {
      return { explanation: candidate, explanation_source: "model" };
    }
  } catch {
    // A model that is unavailable or wrong is not a reason to fail the answer.
  }
  return { explanation: template, explanation_source: "template" };
}
