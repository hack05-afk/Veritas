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

/**
 * How close two counterparty volumes have to be before the choice matters.
 *
 * When one candidate carries far more rows than the other, it is plainly the one
 * meant. When they are of a similar size, guessing would produce a confidently
 * wrong number, so the question goes back.
 */
export const AMBIGUITY_PCT = 15;

type Counterparty = Catalog["counterparties"][number];

/**
 * The catalog entries a named counterparty could mean.
 *
 * An exact name is taken at its word. Otherwise the names that start with it are
 * preferred, and a loose substring match is used only when nothing else matches,
 * so "TATA" does not pull in every name that happens to contain those letters
 * when a real "TATA ..." exists.
 */
function candidates(wanted: string, catalog: Catalog): Counterparty[] {
  const needle = wanted.trim().toUpperCase();
  if (!needle) return [];

  const exact = catalog.counterparties.filter((c) => c.canonical.toUpperCase() === needle);
  if (exact.length) return exact;

  const prefix = catalog.counterparties.filter((c) => c.canonical.toUpperCase().startsWith(needle));
  if (prefix.length) return prefix;

  return catalog.counterparties.filter((c) => c.canonical.toUpperCase().includes(needle));
}

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
    const matches = candidates(wanted, catalog);
    if (matches.length >= 2) {
      const [first, second] = matches;
      const gap = Math.abs(first.count - second.count) / Math.max(first.count, 1) * 100;
      // Two counterparties of similar volume are the ambiguous case.
      if (gap < AMBIGUITY_PCT) {
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

  // The deterministic side decides what to run, not the model. A model that
  // omits these flags would silently switch off the alternative readings and
  // the anomaly scan, which is most of what the answer is for. The query
  // service works out which axes actually apply and returns nothing when none
  // do, so asking for both here is always safe.
  return { kind: "compute", plan: { ...plan, run_alternatives: true, run_anomaly: true } };
}
