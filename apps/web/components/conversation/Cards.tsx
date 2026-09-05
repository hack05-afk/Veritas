"use client";

/** The three things the conversation column can show instead of an answer. */
import React from "react";
import { Card } from "@veritas/ui";

import type { Clarification, Refusal } from "@/lib/orchestrator/types";

export function ClarificationCard({ clarification, onChoose }: {
  clarification: Clarification;
  onChoose?: (index: number) => void;
}) {
  const [chosen, setChosen] = React.useState(0);
  return (
    <Card data-clarification className="mt-4">
      <p className="text-sm font-medium">{clarification.question}</p>
      <div className="mt-3 flex flex-col gap-2">
        {clarification.options.slice(0, 3).map((option, index) => (
          <button key={option.label} type="button" data-option aria-pressed={index === chosen}
            onClick={() => { setChosen(index); onChoose?.(index); }}
            className={`rounded-[var(--radius)] border px-3 py-2 text-left text-sm ${
              index === chosen ? "border-[hsl(var(--brand))] bg-[hsl(var(--brand-soft))] text-[hsl(var(--brand-text))]"
                               : "border-[hsl(var(--border))]"}`}>
            {option.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

export function RefusalCard({ refusal }: { refusal: Refusal }) {
  return (
    <Card data-refusal className="mt-4">
      <p className="text-sm">{refusal.reason}</p>
      <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">What I can answer:</p>
      <ul className="mt-1 list-disc pl-5 text-sm text-[hsl(var(--muted-foreground))]">
        {refusal.can_do.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </Card>
  );
}

export function FailureCaseCard({ text }: { text?: string }) {
  return (
    <Card data-failure-case className="mt-4">
      <p className="text-sm font-medium">Where Veritas gets it wrong</p>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        {text ?? "A worked example of a question this build answers badly, and why, is written up in the documentation."}
      </p>
    </Card>
  );
}
