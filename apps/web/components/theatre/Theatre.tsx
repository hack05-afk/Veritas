"use client";

/**
 * The Reasoning Theatre.
 *
 * A timeline of the five stages that shows what each one produced as it
 * produces it. Selecting a stage freezes its artifact so it can be read while
 * the rest of the answer is still arriving.
 */
import React from "react";
import type { Stage } from "@veritas/ui";

import { WorkflowTimeline, type StageDetail } from "./WorkflowTimeline";

export interface TheatreState {
  details: Partial<Record<Stage, StageDetail>>;
  artifacts: Partial<Record<Stage, unknown>>;
}

const TITLE: Record<Stage, string> = {
  understand: "The plan the model wrote",
  verify: "What was checked",
  compute: "The query and the rows it read",
  test: "The other readings",
  answer: "The finished answer",
};

function Artifact({ stage, artifact }: { stage: Stage; artifact: unknown }) {
  if (artifact === undefined || artifact === null) {
    return <p className="text-sm text-[hsl(var(--muted-foreground))]">This stage recorded nothing.</p>;
  }
  if (stage === "verify" && Array.isArray(artifact)) {
    return (
      <ul className="space-y-2">
        {(artifact as { check: string; ok: boolean }[]).map((entry) => (
          <li key={entry.check} className="flex items-start gap-2 text-sm">
            <span className={entry.ok ? "text-[hsl(var(--success-text))]" : "text-[hsl(var(--danger-text))]"}>
              {entry.ok ? "Passed" : "Failed"}
            </span>
            <span className="text-[hsl(var(--muted-foreground))]">{entry.check}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <pre data-mono className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius)] bg-[hsl(var(--background))] p-4 text-xs leading-relaxed">
      {JSON.stringify(artifact, null, 2)}
    </pre>
  );
}

export function Theatre({ state }: { state: TheatreState }) {
  const [selected, setSelected] = React.useState<Stage | null>(null);

  const latest = (["answer", "test", "compute", "verify", "understand"] as Stage[])
    .find((stage) => state.artifacts[stage] !== undefined) ?? "understand";
  const shown = selected ?? latest;

  return (
    <div>
      <WorkflowTimeline details={state.details} selected={selected} onSelect={setSelected} />

      <section data-artifact-panel data-frozen={selected ? "true" : "false"}
        className="mt-4 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <header className="mb-3 flex items-center justify-between gap-4">
          <h3 className="text-sm font-medium">{TITLE[shown]}</h3>
          {selected ? (
            <button type="button" onClick={() => setSelected(null)}
              className="text-xs text-[hsl(var(--brand-text))]">Follow along again</button>
          ) : (
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Select a step to hold it</span>
          )}
        </header>
        <Artifact stage={shown} artifact={state.artifacts[shown]} />
      </section>
    </div>
  );
}
