"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Button, Card, Chip } from "@veritas/ui";

const LedgerField = dynamic(() => import("@/components/LedgerField"), { ssr: false });

const QUESTIONS = [
  "What did we spend last month?",
  "Who were our top five counterparties last quarter?",
  "Does our balance match the transactions?",
  "How many transactions have no reference number or UTR?",
  "What were our largest payments last month?",
];

const PROOF = [
  "Every number computed in DuckDB, never by the model",
  "Account numbers and UTRs masked everywhere",
  "Each answer shows the readings that would change it",
];

const STEPS = [
  {
    title: "It reads the question, not the database",
    body: "A small language model turns what you asked into a structured query plan. It never sees a raw record, never writes SQL and never produces a figure.",
  },
  {
    title: "The numbers are computed, not generated",
    body: "The plan runs against the ledger in DuckDB. Bank narrations were decoded once at load, so a counterparty is a column rather than a guess.",
  },
  {
    title: "Then it argues with itself",
    body: "The same question is recomputed under every other reasonable reading. If the number moves, the answer says so before you have to ask.",
  },
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
    <main className="mx-auto flex w-full max-w-6xl flex-col px-7">
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold tracking-tight">Veritas</span>
        <nav className="flex items-center gap-2 text-sm">
          <a href="/benchmark" className="rounded-[var(--radius)] px-3 py-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            Model receipts
          </a>
          <a href="/kit" className="rounded-[var(--radius)] px-3 py-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            Design kit
          </a>
          <a href="/workspace" className="rounded-[var(--radius)] px-3 py-2 text-[hsl(var(--brand-text))]">
            Open workspace
          </a>
        </nav>
      </header>

      <section className="pt-12">
        <Chip tone="brand">Grounded finance assistant</Chip>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Ask your ledger. Get the truth.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">
          Two people ask the same question and get two different numbers, because the question
          hides an assumption. Veritas answers under a documented default, shows the records
          behind it, and tells you whether the other readings would change the answer.
        </p>

        <form action="/workspace" className="mt-9 flex flex-wrap items-center gap-3">
          <input
            name="q"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={placeholder}
            aria-label="Ask a question about your ledger"
            className="h-14 min-w-0 flex-1 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 text-base outline-none focus:border-[hsl(var(--brand))]"
          />
          <Button type="submit">Ask</Button>
          <a href="/workspace?call=1">
            <Button type="button" variant="secondary">Call Veritas</Button>
          </a>
        </form>

        <div className="mt-6 flex flex-wrap gap-2">
          {PROOF.map((proof) => (
            <span key={proof} data-proof-chip><Chip tone="brand">{proof}</Chip></span>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <LedgerField />
      </section>

      <section className="mt-4 grid gap-5 pb-10 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Card key={step.title} tilt>
            <span className="text-xs font-medium text-[hsl(var(--brand-text))]" data-numeric>
              {`0${index + 1}`}
            </span>
            <h2 className="mt-3 text-lg font-medium leading-snug">{step.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              {step.body}
            </p>
          </Card>
        ))}
      </section>

      <section className="border-t border-[hsl(var(--border))] py-10">
        <h2 className="text-xl font-medium">What it will not do</h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
          The schema has no category column, so Veritas will not tell you what you spent on
          marketing. It refuses instead, and says what it can answer. A name that matches
          several counterparties gets a question back rather than a confident guess. Every
          figure in a spoken or written answer must already exist in the computation, or the
          sentence is replaced with one that does.
        </p>
        <a href="/workspace" className="mt-6 inline-block">
          <Button>Open the workspace</Button>
        </a>
      </section>
    </main>
  );
}
