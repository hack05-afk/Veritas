"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Button, Chip, GridBackground, ThemeToggle } from "@veritas/ui";

import { Specimen } from "@/components/landing/Specimen";

const LedgerField = dynamic(() => import("@/components/LedgerField"), { ssr: false });

const QUESTIONS = [
  "What did we spend last month?",
  "Who were our top five counterparties last quarter?",
  "Does our balance match the transactions?",
  "How many transactions have no reference number or UTR?",
  "What were our largest payments last month?",
];

const PROOF = [
  "Computed in DuckDB, never by the model",
  "Account numbers and UTRs masked everywhere",
  "Every answer shows what would change it",
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

const LIMITS = [
  {
    title: "It will not invent a category",
    body: "The schema has no category column, so a question about marketing spend is refused rather than approximated. The refusal says what can be answered from the columns that do exist.",
  },
  {
    title: "It will not guess which counterparty you meant",
    body: "A name that matches several parties comes back as a question with the candidates, not as a confident total over one of them.",
  },
  {
    title: "It will not speak a number it did not compute",
    body: "Every figure in a written or spoken answer must already appear in the computation's allowed numbers. A sentence that fails that check is replaced with one that passes it.",
  },
  {
    title: "It will not show an account number or a UTR",
    body: "Both are masked to their last four characters everywhere: on screen, in the export, in the report and in the spoken answer. Neither is ever sent to the model.",
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-4 border-b border-rule bg-paper px-5">
        <span className="text-sm font-semibold tracking-tight">Veritas</span>
        <nav className="flex items-center gap-1 text-xs">
          <a href="/benchmark" className="rounded-sm px-2 py-1 text-ink-3 hover:text-ink">
            Model receipts
          </a>
          <a href="/kit" className="rounded-sm px-2 py-1 text-ink-3 hover:text-ink">
            Design kit
          </a>
          <ThemeToggle className="ml-1" />
          <a
            href="/workspace"
            className="ml-1 rounded-sm border border-accent-line px-2 py-1 font-medium text-accent hover:bg-accent-soft"
          >
            Open workspace
          </a>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5">
        <section className="relative border-b border-rule py-14">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-70">
            <GridBackground />
          </div>
          <span className="label">Grounded finance assistant</span>
          <h1 className="mt-3 max-w-3xl text-display font-semibold">
            Ask your ledger. Get the truth.
          </h1>
          <p className="mt-4 max-w-2xl text-md text-ink-2">
            Two people ask the same question and get two different numbers, because the
            question hides an assumption. Veritas answers under a documented default, shows
            the records behind it, and tells you whether the other readings would change the
            answer.
          </p>

          <form action="/workspace" className="mt-8 flex flex-wrap items-center gap-2">
            <input
              name="q"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={placeholder}
              aria-label="Ask a question about your ledger"
              className="h-[3.25rem] min-w-0 flex-1 rounded-sm border border-rule-strong bg-surface px-4 text-md text-ink outline-none placeholder:text-ink-4 focus:border-accent"
            />
            <Button type="submit" size="lg">Ask</Button>
            <a href="/workspace?call=1">
              <Button type="button" variant="secondary" size="lg">Call Veritas</Button>
            </a>
            <a
              href="/workspace?demo=1"
              data-demo-link
              className="rounded-sm px-1 py-1 text-xs text-ink-3 underline-offset-4 hover:text-ink hover:underline"
            >
              Run the demo
            </a>
          </form>

          <div className="mt-5 flex flex-wrap gap-1.5">
            {PROOF.map((proof) => (
              <span key={proof} data-proof-chip>
                <Chip tone="quiet">{proof}</Chip>
              </span>
            ))}
          </div>
        </section>

        <section aria-hidden="true" className="border-b border-rule">
          <LedgerField className="h-[140px] w-full" />
        </section>

        <section className="border-b border-rule py-10">
          <span className="label">A specimen</span>
          <p className="mb-4 mt-1 max-w-2xl text-sm text-ink-2">
            This is the whole output, not a picture of it. The number, the reading it was
            computed under, and where every other reading lands beside it.
          </p>
          <Specimen />
        </section>

        <section className="border-b border-rule py-10">
          <span className="label">How an answer is made</span>
          <ol className="mt-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-b border-rule-faint py-4 last:border-b-0 md:grid-cols-[3rem_minmax(0,22rem)_minmax(0,1fr)] md:gap-x-6"
              >
                <span data-numeric className="text-sm text-ink-4">{`0${index + 1}`}</span>
                <h2 className="text-base font-semibold leading-snug text-ink">{step.title}</h2>
                <p className="col-start-2 mt-1.5 text-sm text-ink-2 md:col-start-3 md:mt-0">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="py-12">
          <span className="label">The refusals</span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">What it will not do</h2>
          <p className="mt-3 max-w-2xl text-md text-ink-2">
            Most of the work in a grounded assistant is in what it declines to say. These are
            not warnings in a footer, they are the behaviour.
          </p>
          <ul className="mt-6 border-t border-rule">
            {LIMITS.map((limit) => (
              <li
                key={limit.title}
                className="grid gap-x-6 gap-y-1 border-b border-rule py-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
              >
                <h3 className="text-base font-semibold text-ink">{limit.title}</h3>
                <p className="text-sm text-ink-2">{limit.body}</p>
              </li>
            ))}
          </ul>
          <a href="/workspace" className="mt-8 inline-block">
            <Button size="lg">Open the workspace</Button>
          </a>
        </section>
      </main>
    </div>
  );
}
