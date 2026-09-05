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
    return <p className="text-sm text-ink-3">This stage recorded nothing.</p>;
  }
  if (stage === "verify" && Array.isArray(artifact)) {
    return (
      <ul className="divide-y divide-rule-faint">
        {(artifact as { check: string; ok: boolean }[]).map((entry) => (
          <li key={entry.check} className="flex items-baseline gap-2.5 py-1.5 text-sm">
            <span className={`w-14 shrink-0 text-2xs font-semibold uppercase tracking-label ${
              entry.ok ? "text-stable" : "text-fragile"}`}>
              {entry.ok ? "Passed" : "Failed"}
            </span>
            <span className="min-w-0 text-ink-2">{entry.check}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <pre data-mono className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-sm border border-rule bg-surface-sunken p-2.5 text-2xs leading-relaxed text-ink-2">
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <WorkflowTimeline details={state.details} artifacts={state.artifacts}
        selected={selected} onSelect={setSelected} />

      <section data-artifact-panel data-frozen={selected ? "true" : "false"}
        className="min-w-0 border-t border-rule pt-2 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <header className="mb-2 flex h-6 items-center justify-between gap-3">
          <h3 className="label truncate">{TITLE[shown]}</h3>
          {selected ? (
            <button type="button" onClick={() => setSelected(null)}
              className="shrink-0 text-2xs text-accent hover:underline">Follow along again</button>
          ) : (
            <span className="shrink-0 text-2xs text-ink-4">Select a step to hold it</span>
          )}
        </header>
        <Artifact stage={shown} artifact={state.artifacts[shown]} />
      </section>
    </div>
  );
}
