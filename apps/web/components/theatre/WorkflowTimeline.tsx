"use client";

/**
 * The workflow, shown as it happens.
 *
 * Each stage is a row that fills in while the answer is worked out: what the
 * stage did, how long it took, and a one-line summary of what it produced.
 * Clicking a row opens that stage's artifact underneath and freezes it, so it
 * can be read while later stages are still arriving.
 *
 * The rail is a hairline rather than a track: it is only drawn strong once the
 * stage above it has finished, and it marches while the stage below is running.
 */
import React from "react";
import { STAGES, type Stage, type StageState } from "@veritas/ui";

export interface StageDetail {
  state: StageState;
  note?: string;
  summary?: string;
  startedAt?: number;
  endedAt?: number;
}

const LABEL: Record<Stage, string> = {
  understand: "Understand",
  verify: "Verify",
  compute: "Compute",
  test: "Test",
  answer: "Answer",
};

const CAPTION: Record<Stage, string> = {
  understand: "Read the question and write a query plan",
  verify: "Check the plan against the catalog and the contract",
  compute: "Run the query in DuckDB and read the rows",
  test: "Recompute under every other reasonable reading",
  answer: "Assemble the answer and check every number in it",
};

const NODE: Record<StageState, string> = {
  idle: "border-rule-strong bg-surface text-ink-4",
  active: "border-accent bg-accent text-white",
  done: "border-ink bg-ink text-surface",
  skipped: "border-dashed border-rule-strong bg-surface text-ink-4",
  error: "border-fragile bg-fragile text-white",
};

const WORD: Record<StageState, string> = {
  idle: "Waiting", active: "Working", done: "Done", skipped: "Skipped", error: "Failed",
};

const WORD_TONE: Record<StageState, string> = {
  idle: "text-ink-4",
  active: "text-accent",
  done: "text-ink-3",
  skipped: "text-ink-4",
  error: "text-fragile",
};

function took(detail?: StageDetail): string | null {
  if (!detail?.startedAt || !detail?.endedAt) return null;
  const ms = detail.endedAt - detail.startedAt;
  return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** The artifact as an attribute, so a test can read what a stage produced. */
function serialise(artifact: unknown): string | undefined {
  if (artifact === undefined || artifact === null) return undefined;
  try {
    return JSON.stringify(artifact);
  } catch {
    return undefined;
  }
}

export function WorkflowTimeline({ details, artifacts, selected, onSelect }: {
  details: Partial<Record<Stage, StageDetail>>;
  artifacts?: Partial<Record<Stage, unknown>>;
  selected: Stage | null;
  onSelect: (stage: Stage | null) => void;
}) {
  return (
    <ol data-kit="StageStrip" data-workflow className="flex flex-col border-t border-rule">
      {STAGES.map((stage, index) => {
        const detail = details[stage];
        const state = detail?.state ?? "idle";
        const isLast = index === STAGES.length - 1;
        const next = isLast ? null : (details[STAGES[index + 1]]?.state ?? "idle");
        const done = state === "done" || state === "skipped" || state === "error";
        const open = selected === stage;
        const elapsed = took(detail);

        return (
          <li key={stage} className="relative flex gap-3 border-b border-rule-faint last:border-b-0">
            <div className="flex w-5 shrink-0 flex-col items-center pt-2">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors duration-[var(--motion-base)] ${NODE[state]} ${
                state === "active" ? "animate-[veritas-pulse_1.2s_ease-in-out_infinite]" : ""}`}>
                {state === "error" ? "!" : state === "skipped" ? "-" : index + 1}
              </span>
              {!isLast ? (
                <span aria-hidden="true" className={`mt-1 w-px flex-1 ${
                  next === "active" ? "marching"
                    : done ? "bg-rule-strong"
                    : "bg-rule"}`} />
              ) : null}
            </div>

            <button type="button" data-stage={stage} data-state={state}
              data-artifact={serialise(artifacts?.[stage])}
              aria-expanded={open}
              onClick={() => onSelect(open ? null : stage)}
              className={`flex-1 px-1 py-2 text-left transition-colors duration-[var(--motion-fast)] ${
                open ? "bg-surface-sunken" : "hover:bg-surface-sunken"}`}>
              <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="text-sm font-semibold text-ink">{LABEL[stage]}</span>
                <span className={`text-2xs font-semibold uppercase tracking-label ${WORD_TONE[state]}`}>
                  {WORD[state]}
                </span>
                {elapsed ? <span className="text-2xs text-ink-4" data-numeric>{elapsed}</span> : null}
              </span>
              <span className="mt-0.5 block text-xs text-ink-3">
                {detail?.note ?? detail?.summary ?? CAPTION[stage]}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
