/**
 * The presentation script.
 *
 * Six beats in the order the argument is made, held as data so the runner has
 * nothing to decide except how to play them. Every beat names the requirement
 * it demonstrates and the recorded stream that stands in for it when the live
 * pipeline cannot be reached.
 */

export type DemoMode = "live" | "replay";

export interface DemoBeat {
  id: string;
  /** Asked exactly as written, through the same path a typed question takes. */
  question: string;
  /** One line for the presenter: what this beat proves. */
  note: string;
  /** The requirement of the problem statement this beat demonstrates. */
  requirement: string;
  /** A stream in fixtures/events, played when the live run cannot be trusted. */
  fixture: string | null;
  /** Work to do once the answer has settled. */
  after?: "evidence";
}

export const DEMO_BEATS: DemoBeat[] = [
  {
    id: "grounded",
    question: "What did we spend last month?",
    note: "A plain question becomes a plan, a query and a number with the rows behind it.",
    requirement: "Natural language understanding and grounded retrieval",
    fixture: "spend_last_month",
  },
  {
    id: "follow-up",
    question: "Compare that with the month before",
    note: "Nothing is repeated. The follow-up carries the previous plan forward.",
    requirement: "Multi-turn conversation",
    // Recorded from a real two-turn run against the query service, so the two
    // period totals and the variance are the ones DuckDB computed.
    fixture: "period_compare",
  },
  {
    id: "sensitive",
    question: "Who were our top five counterparties last quarter?",
    note: "Sensitive, because another reasonable reading of the same question moves the number.",
    requirement: "Confidence signalling with computed alternative readings",
    fixture: "counterparty_ranking",
  },
  {
    id: "clarify",
    question: "How much did we pay SELECTION last quarter?",
    note: "Several counterparties start with that word, so it asks instead of picking one.",
    requirement: "Clarifying questions in place of a confident guess",
    fixture: "clarification",
  },
  {
    id: "refuse",
    question: "How much did we spend on the marketing category last month?",
    note: "The schema has no category column, so the question is refused rather than approximated.",
    requirement: "Hallucination guardrail",
    fixture: "refusal_unknown_category",
  },
  {
    id: "evidence",
    question: "What did we spend last month?",
    note: "The rows behind the number, masked, and the same rows as a CSV.",
    requirement: "Verifiability, evidence and masking",
    fixture: "spend_last_month",
    after: "evidence",
  },
];

/** How long a live beat may take before it is replayed instead. */
export const BEAT_TIMEOUT_MS = 25000;

/** How long the probe waits before deciding the pipeline is out of reach. */
export const PROBE_TIMEOUT_MS = 4000;

export const AUTO_SECONDS_CHOICES = [8, 12, 20, 30];

export const DEFAULT_AUTO_SECONDS = 12;

/** Reads the ?demo= parameter: whether the demo runs, and whether a mode is forced. */
export function readDemoParam(value: string | null): { active: boolean; forced: DemoMode | null } {
  if (value === null) return { active: false, forced: null };
  if (value === "replay") return { active: true, forced: "replay" };
  if (value === "live") return { active: true, forced: "live" };
  if (value === "1" || value === "") return { active: true, forced: null };
  return { active: false, forced: null };
}
