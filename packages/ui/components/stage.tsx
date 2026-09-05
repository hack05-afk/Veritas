"use client";

import React from "react";

export const STAGES = ["understand", "verify", "compute", "test", "answer"] as const;
export type Stage = (typeof STAGES)[number];
export type StageState = "idle" | "active" | "done" | "skipped" | "error";

const LABEL: Record<Stage, string> = {
  understand: "Understand", verify: "Verify", compute: "Compute", test: "Test", answer: "Answer",
};

const STATE_STYLE: Record<StageState, string> = {
  idle: "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]",
  active: "border-[hsl(var(--brand))] text-[hsl(var(--brand-text))] bg-[hsl(var(--brand-soft))]",
  done: "border-[hsl(var(--success))] text-[hsl(var(--success-text))] bg-[hsl(var(--success-soft))]",
  skipped: "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--background))]",
  error: "border-[hsl(var(--danger))] text-[hsl(var(--danger-text))] bg-[hsl(var(--danger-soft))]",
};

export function StageStrip({ states, notes, onSelect }: {
  states?: Partial<Record<Stage, StageState>>;
  notes?: Partial<Record<Stage, string>>;
  onSelect?: (stage: Stage) => void;
}) {
  return (
    <ol data-kit="StageStrip" className="flex flex-wrap items-center gap-2">
      {STAGES.map((stage) => {
        const state = states?.[stage] ?? "idle";
        return (
          <li key={stage}>
            <button type="button" data-stage={stage} data-state={state}
              onClick={() => onSelect?.(stage)}
              title={notes?.[stage] ?? LABEL[stage]}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors duration-[var(--motion-base)] ${STATE_STYLE[state]}`}>
              {LABEL[stage]}
              {notes?.[stage] ? <span className="ml-2 opacity-70">{notes[stage]}</span> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
