/**
 * Clarify or compute.
 *
 * Asking a question back is expensive, so it is reserved for the cases where
 * guessing would produce a confidently wrong number.
 */
import type { Catalog } from "./extract";
import type { Clarification, QueryPlan } from "./types";

const FOLLOW_UP = /\b(that|those|it|them|same|again)\b/i;

export type Decision =
  | { kind: "compute"; plan: QueryPlan }
  | { kind: "clarify"; clarification: Clarification }
  | { kind: "refuse"; refusal: { reason: string; can_do: string[] } };

/** How different two counterparty totals must be before the choice matters. */
export const AMBIGUITY_PCT = 15;

export function decide(question: string, plan: QueryPlan | null, previous: QueryPlan | null,
                       catalog: Catalog, errors: string[]): Decision {
  if (plan?.refusal) return { kind: "refuse", refusal: plan.refusal };
  if (plan?.clarification) return { kind: "clarify", clarification: plan.clarification };

  if (!plan || !plan.intent) {
    if (FOLLOW_UP.test(question) && !previous) {
      return {
        kind: "clarify",
        clarification: {
          question: "There is nothing earlier in this conversation to refer to. What would you like to compare?",
          options: [
            { label: "The latest month against the month before it" },
            { label: "The latest quarter against the quarter before it" },
          ],
        },
      };
    }
    return {
      kind: "refuse",
      refusal: {
        reason: errors.length ? `I could not turn that into a query: ${errors[0]}.`
                              : "I could not turn that into a query over this data.",
        can_do: [
          "Spend for a period, in total or split by channel",
          "Spend or receipts for a named counterparty",
          "A ranking of counterparties by amount paid",
          "Balances per account or per entity",
          "A lookup by reference number or UTR",
          "Reconciliation checks: balance gaps, unmatched transfers, unreferenced rows",
        ],
      },
    };
  }

  const period = plan.filters?.period;
  if (!period || !period.start) {
    if (plan.intent !== "lookup_reference" && plan.intent !== "balance"
        && !plan.intent.startsWith("reconciliation") && plan.intent !== "unreferenced") {
      return {
        kind: "clarify",
        clarification: {
          question: "Which period did you mean?",
          options: [
            { label: `The latest month, ending ${catalog.data_bounds.max_date}` },
            { label: `The latest quarter, ending ${catalog.data_bounds.max_date}` },
          ],
        },
      };
    }
  }

  const wanted = plan.filters?.counterparty?.canonical;
  if (wanted) {
    const matches = catalog.counterparties.filter((c) => c.canonical.includes(wanted.toUpperCase()));
    if (matches.length >= 2) {
      const [first, second] = matches;
      const gap = Math.abs(first.count - second.count) / Math.max(first.count, 1) * 100;
      if (gap >= AMBIGUITY_PCT) {
        return {
          kind: "clarify",
          clarification: {
            question: `More than one counterparty matches ${wanted}. Which did you mean?`,
            options: matches.slice(0, 3).map((c) => ({
              label: c.canonical, plan_patch: { filters: { counterparty: { canonical: c.canonical, match: "exact" } } },
            })),
          },
        };
      }
    }
  }

  return { kind: "compute", plan };
}
