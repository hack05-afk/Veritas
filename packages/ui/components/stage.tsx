"use client";

import React from "react";

export const STAGES = ["understand", "verify", "compute", "test", "answer"] as const;
export type Stage = (typeof STAGES)[number];
export type StageState = "idle" | "active" | "done" | "skipped" | "error";

const LABEL: Record<Stage, string> = {
  understand: "Understand",
  verify: "Verify",
  compute: "Compute",
  test: "Test",
  answer: "Answer",
};

const NODE: Record<StageState, string> = {
  idle: "border-[hsl(var(--rule-strong))] bg-[hsl(var(--surface))] text-[hsl(var(--ink-4))]",
  active: "border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-white",
  done: "border-[hsl(var(--ink))] bg-[hsl(var(--ink))] text-[hsl(var(--surface))]",
  skipped: "border-dashed border-[hsl(var(--rule-strong))] bg-[hsl(var(--surface))] text-[hsl(var(--ink-4))]",
  error: "border-[hsl(var(--fragile))] bg-[hsl(var(--fragile))] text-white",
};

const TEXT: Record<StageState, string> = {
  idle: "text-[hsl(var(--ink-4))]",
  active: "text-[hsl(var(--accent))]",
  done: "text-[hsl(var(--ink))]",
  skipped: "text-[hsl(var(--ink-4))]",
  error: "text-[hsl(var(--fragile))]",
};

/**
 * The five stages as a rail.
 *
 * The connector between two nodes is the honest part: it is only drawn solid
 * once the stage on its left has finished, and it marches while the stage on
 * its right is running. Nothing here animates ahead of the events.
 */
export function StageStrip({
  states,
  notes,
  selected,
  onSelect,
  compact = false,
}: {
  states?: Partial<Record<Stage, StageState>>;
  notes?: Partial<Record<Stage, string>>;
  selected?: Stage | null;
  onSelect?: (stage: Stage) => void;
  compact?: boolean;
}) {
  return (
    <ol data-kit="StageStrip" className="flex w-full items-start">
      {STAGES.map((stage, index) => {
        const state = states?.[stage] ?? "idle";
        const next = index < STAGES.length - 1 ? (states?.[STAGES[index + 1]] ?? "idle") : null;
        const done = state === "done" || state === "skipped" || state === "error";
        return (
          <li key={stage} className="flex min-w-0 flex-1 items-start last:flex-none">
            <button
              type="button"
              data-stage={stage}
              data-state={state}
              data-selected={selected === stage ? "true" : undefined}
              onClick={() => onSelect?.(stage)}
              title={notes?.[stage] ?? LABEL[stage]}
              className={
                "group flex min-w-0 flex-col items-start gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 text-left " +
                (selected === stage ? "bg-[hsl(var(--surface-sunken))]" : "")
              }
            >
              <span
                className={
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border " +
                  `text-[10px] font-semibold transition-colors duration-[var(--motion-base)] ${NODE[state]} ` +
                  (state === "active" ? "animate-[veritas-pulse_1.2s_ease-in-out_infinite]" : "")
                }
              >
                {state === "error" ? "!" : state === "skipped" ? "–" : index + 1}
              </span>
              {compact ? null : (
                <span className="flex min-w-0 flex-col">
                  <span
                    className={`text-[length:var(--text-2xs)] font-semibold uppercase tracking-[var(--tracking-label)] ${TEXT[state]}`}
                  >
                    {LABEL[stage]}
                  </span>
                  {notes?.[stage] ? (
                    <span className="mt-0.5 max-w-[16ch] truncate text-[length:var(--text-2xs)] text-[hsl(var(--ink-3))]">
                      {notes[stage]}
                    </span>
                  ) : null}
                </span>
              )}
            </button>

            {next !== null ? (
              <span
                aria-hidden="true"
                className={
                  "mx-1.5 mt-2.5 h-px min-w-4 flex-1 " +
                  (next === "active"
                    ? "marching"
                    : done
                      ? "bg-[hsl(var(--rule-strong))]"
                      : "bg-[hsl(var(--rule))]")
                }
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
