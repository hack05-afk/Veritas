"use client";

/**
 * The workflow, shown as it happens.
 *
 * Each stage is a row that fills in while the answer is worked out: what the
 * stage did, how long it took, and a one-line summary of what it produced.
 * Clicking a row opens that stage's artifact underneath and freezes it, so it
 * can be read while later stages are still arriving.
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

const DOT: Record<StageState, string> = {
  idle: "border-[hsl(var(--border))] bg-[hsl(var(--card))]",
  active: "border-[hsl(var(--brand))] bg-[hsl(var(--brand))]",
  done: "border-[hsl(var(--success))] bg-[hsl(var(--success))]",
  skipped: "border-[hsl(var(--border))] bg-[hsl(var(--border))]",
  error: "border-[hsl(var(--danger))] bg-[hsl(var(--danger))]",
};

const WORD: Record<StageState, string> = {
  idle: "Waiting", active: "Working", done: "Done", skipped: "Skipped", error: "Failed",
};

const WORD_TONE: Record<StageState, string> = {
  idle: "text-[hsl(var(--muted-foreground))]",
  active: "text-[hsl(var(--brand-text))]",
  done: "text-[hsl(var(--success-text))]",
  skipped: "text-[hsl(var(--muted-foreground))]",
  error: "text-[hsl(var(--danger-text))]",
};

function Mark({ state }: { state: StageState }) {
  if (state === "done") {
    return (
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
        <path d="M2.5 6.5l2.5 2.5 4.5-5" fill="none" stroke="white" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "error") {
    return (
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
        <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" fill="none" stroke="white" strokeWidth="1.8"
          strokeLinecap="round" />
      </svg>
    );
  }
  if (state === "active") return <span className="h-2 w-2 rounded-full bg-white" />;
  return null;
}

function took(detail?: StageDetail): string | null {
  if (!detail?.startedAt || !detail?.endedAt) return null;
  const ms = detail.endedAt - detail.startedAt;
  return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function WorkflowTimeline({ details, selected, onSelect }: {
  details: Partial<Record<Stage, StageDetail>>;
  selected: Stage | null;
  onSelect: (stage: Stage | null) => void;
}) {
  return (
    <ol data-kit="StageStrip" data-workflow className="flex flex-col">
      {STAGES.map((stage, index) => {
        const detail = details[stage];
        const state = detail?.state ?? "idle";
        const isLast = index === STAGES.length - 1;
        const open = selected === stage;
        const elapsed = took(detail);

        return (
          <li key={stage} className="relative flex gap-4">
            <div className="flex flex-col items-center">
              <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-[var(--motion-base)] ${DOT[state]}`}>
                <Mark state={state} />
              </span>
              {!isLast ? (
                <span className={`w-0.5 flex-1 ${state === "done" ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--border))]"}`} />
              ) : null}
            </div>

            <button type="button" data-stage={stage} data-state={state}
              aria-expanded={open}
              onClick={() => onSelect(open ? null : stage)}
              className={`mb-3 flex-1 rounded-[var(--radius)] border px-4 py-3 text-left transition-colors duration-[var(--motion-fast)] ${
                open ? "border-[hsl(var(--brand))] bg-[hsl(var(--brand-soft))]"
                     : "border-transparent hover:bg-[hsl(var(--background))]"}`}>
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-base font-medium">{LABEL[stage]}</span>
                <span className={`text-xs font-medium ${WORD_TONE[state]}`}>{WORD[state]}</span>
                {elapsed ? <span className="text-xs text-[hsl(var(--muted-foreground))]" data-numeric>{elapsed}</span> : null}
              </span>
              <span className="mt-1 block text-sm text-[hsl(var(--muted-foreground))]">
                {detail?.note ?? detail?.summary ?? CAPTION[stage]}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
