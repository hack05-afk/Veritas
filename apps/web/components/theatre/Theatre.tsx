"use client";

/**
 * The Reasoning Theatre.
 *
 * Five stages, each showing what it actually produced. Clicking a stage freezes
 * its artifact so it can be read while the rest of the answer arrives.
 */
import React from "react";
import { StageStrip, type Stage, type StageState } from "@veritas/ui";

export interface TheatreState {
  states: Partial<Record<Stage, StageState>>;
  notes: Partial<Record<Stage, string>>;
  artifacts: Partial<Record<Stage, unknown>>;
}

const TITLE: Record<Stage, string> = {
  understand: "The plan", verify: "The checks", compute: "The query and its rows",
  test: "The other readings", answer: "The answer",
};

function Artifact({ stage, artifact }: { stage: Stage; artifact: unknown }) {
  if (artifact === undefined || artifact === null) {
    return <p className="text-sm text-[hsl(var(--muted-foreground))]">Nothing recorded for this stage.</p>;
  }
  if (stage === "verify" && Array.isArray(artifact)) {
    return (
      <ul className="space-y-1 text-sm">
        {(artifact as { check: string; ok: boolean }[]).map((item) => (
          <li key={item.check} className="text-[hsl(var(--success-text))]">{item.ok ? "Checked" : "Failed"}: {item.check}</li>
        ))}
      </ul>
    );
  }
  return (
    <pre data-mono className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
      {JSON.stringify(artifact, null, 2)}
    </pre>
  );
}

export function Theatre({ state }: { state: TheatreState }) {
  const [frozen, setFrozen] = React.useState<Stage | null>(null);

  const latest = (["answer", "test", "compute", "verify", "understand"] as Stage[])
    .find((stage) => state.artifacts[stage] !== undefined) ?? "understand";
  const shown = frozen ?? latest;

  return (
    <div>
      <StageStrip states={state.states} notes={state.notes} onSelect={setFrozen} />
      <section data-artifact-panel data-frozen={frozen ? "true" : "false"}
        className="mt-4 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">{TITLE[shown]}</h3>
          {frozen ? (
            <button type="button" onClick={() => setFrozen(null)}
              className="text-xs text-[hsl(var(--muted-foreground))]">Follow along again</button>
          ) : null}
        </header>
        <Artifact stage={shown} artifact={state.artifacts[shown]} />
      </section>
    </div>
  );
}
