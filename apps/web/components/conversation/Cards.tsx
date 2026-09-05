"use client";

/** The three things the conversation column can show instead of an answer. */
import React from "react";

import type { Clarification, Refusal } from "@/lib/orchestrator/types";

function Note({ label, children, attribute }: {
  label: string;
  children: React.ReactNode;
  attribute: Record<string, string>;
}) {
  return (
    <section {...attribute} className="mt-4 border-t border-rule pt-3">
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

export function ClarificationCard({ clarification, onChoose }: {
  clarification: Clarification;
  onChoose?: (index: number) => void;
}) {
  const [chosen, setChosen] = React.useState(0);
  return (
    <Note label="One thing to settle first" attribute={{ "data-clarification": "" }}>
      <p className="text-sm text-ink">{clarification.question}</p>
      <div className="mt-2 flex flex-col">
        {clarification.options.slice(0, 3).map((option, index) => (
          <button key={option.label} type="button" data-option aria-pressed={index === chosen}
            onClick={() => { setChosen(index); onChoose?.(index); }}
            className={`flex items-center gap-2 border-b border-rule-faint px-1 py-2 text-left text-sm transition-colors duration-[var(--motion-fast)] ${
              index === chosen ? "text-ink" : "text-ink-3 hover:text-ink"}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              index === chosen ? "bg-accent" : "bg-rule-strong"}`} />
            {option.label}
          </button>
        ))}
      </div>
    </Note>
  );
}

export function RefusalCard({ refusal }: { refusal: Refusal }) {
  return (
    <Note label="Not answerable from this schema" attribute={{ "data-refusal": "" }}>
      <p className="text-sm text-ink">{refusal.reason}</p>
      <p className="mt-3 text-xs text-ink-3">What can be answered instead</p>
      <ul className="mt-1 divide-y divide-rule-faint border-t border-rule-faint">
        {refusal.can_do.map((item) => (
          <li key={item} className="py-1.5 text-sm text-ink-2">{item}</li>
        ))}
      </ul>
    </Note>
  );
}

export function FailureCaseCard({ text }: { text?: string }) {
  return (
    <Note label="Where Veritas gets it wrong" attribute={{ "data-failure-case": "" }}>
      <p className="text-sm text-ink-2">
        {text ?? "A worked example of a question this build answers badly, and why, is written up in the documentation."}
      </p>
    </Note>
  );
}
