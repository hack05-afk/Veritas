"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Button, Chip } from "@veritas/ui";

const LedgerField = dynamic(() => import("@/components/LedgerField"), { ssr: false });

const QUESTIONS = [
  "What did we spend last month?",
  "Who were our top five counterparties last quarter?",
  "How much did we spend on the marketing category last month?",
  "Find the transaction with reference 1715499972",
  "Does our balance match the transactions?",
];

const PROOF = [
  "Every number computed in DuckDB, never by the model",
  "Account numbers and UTRs masked everywhere",
  "Each answer shows the readings that would change it",
];

/** Types each sample question into the placeholder, then moves to the next. */
function useTypedPlaceholder(): string {
  const [text, setText] = React.useState("");
  React.useEffect(() => {
    let question = 0;
    let letters = 0;
    const timer = window.setInterval(() => {
      letters += 1;
      const current = QUESTIONS[question % QUESTIONS.length];
      setText(current.slice(0, letters));
      if (letters >= current.length + 6) {
        question += 1;
        letters = 0;
      }
    }, 45);
    return () => window.clearInterval(timer);
  }, []);
  return text || QUESTIONS[0].slice(0, 1);
}

export default function Landing() {
  const placeholder = useTypedPlaceholder();
  const [question, setQuestion] = React.useState("");

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold tracking-tight">Veritas</span>
        <a href="/workspace" className="text-sm text-[hsl(var(--muted-foreground))]">Open workspace</a>
      </header>

      <section className="pt-10">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Ask your ledger. Get the truth.
        </h1>
        <p className="mt-4 max-w-xl text-[hsl(var(--muted-foreground))]">
          Plain questions about your accounts, answered with the records behind them and the
          other readings that would change the number.
        </p>

        <form action="/workspace" className="mt-8 flex flex-wrap items-center gap-3">
          <input
            name="q"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={placeholder}
            aria-label="Ask a question about your ledger"
            className="h-[52px] min-w-0 flex-1 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm outline-none focus:border-[hsl(var(--brand))]"
          />
          <Button type="submit">Ask</Button>
          <Button type="button" variant="secondary">Call TBX</Button>
        </form>

        <div className="mt-6 flex flex-wrap gap-2">
          {PROOF.map((proof) => (
            <span key={proof} data-proof-chip><Chip tone="brand">{proof}</Chip></span>
          ))}
        </div>
      </section>

      <section className="mt-10 flex-1">
        <LedgerField />
      </section>
    </main>
  );
}
