"use client";

import React from "react";
import { Button, Card, Chip, StageStrip } from "@veritas/ui";

const SUGGESTED = [
  "What did we spend last month?",
  "Who were our top five counterparties last quarter?",
  "Does our balance match the transactions?",
  "How many transactions have no reference number or UTR?",
];

export default function Workspace() {
  const [question, setQuestion] = React.useState("");

  return (
    <div className="flex min-h-screen flex-col">
      <header data-topbar
        className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-base font-semibold tracking-tight">Veritas</span>
          <label className="sr-only" htmlFor="entity">Entity</label>
          <select id="entity" name="entity"
            className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 text-sm">
            <option>ent-0001</option>
            <option>ent-0002</option>
            <option>ent-0003</option>
            <option>ent-0004</option>
          </select>
        </div>
        <Button variant="secondary">Call TBX</Button>
      </header>

      <div data-pulse-strip className="flex gap-2 overflow-x-auto border-b border-[hsl(var(--border))] px-6 py-3">
        <Chip>Ledger Pulse arrives with the live data</Chip>
      </div>

      <div className="flex flex-1">
        <aside data-conversation
          className="flex w-[400px] shrink-0 flex-col justify-between border-r border-[hsl(var(--border))] p-5">
          <div>
            <h2 className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Ask anything about the ledger</h2>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTED.map((suggestion) => (
                <button key={suggestion} type="button" data-suggested-question
                  onClick={() => setQuestion(suggestion)}
                  className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-left text-sm hover:bg-[hsl(var(--brand-soft))]">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
          <form className="mt-6 flex gap-2">
            <input value={question} onChange={(event) => setQuestion(event.target.value)}
              aria-label="Your question" placeholder="Ask a question"
              className="h-11 min-w-0 flex-1 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm outline-none focus:border-[hsl(var(--brand))]" />
            <Button type="submit">Ask</Button>
          </form>
        </aside>

        <main className="flex-1 p-6">
          <StageStrip states={{ understand: "idle", verify: "idle", compute: "idle", test: "idle", answer: "idle" }} />
          <Card className="mt-6">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Ask a question and the working appears here, stage by stage, with the records behind
              the number.
            </p>
          </Card>
        </main>
      </div>
    </div>
  );
}
