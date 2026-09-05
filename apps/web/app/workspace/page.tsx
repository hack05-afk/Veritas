"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, type Stage, type StageState } from "@veritas/ui";

import { ClarificationCard, RefusalCard } from "@/components/conversation/Cards";
import { PulseStrip } from "@/components/pulse/PulseStrip";
import { CallSurface } from "@/components/call/CallSurface";
import { Theatre, type TheatreState } from "@/components/theatre/Theatre";
import { TruthPanel } from "@/components/truth/TruthPanel";
import type { EvidenceRecord } from "@/components/evidence/EvidenceDrawer";
import { readEvents } from "@/lib/theatre/stream";
import type { TheatreEvent, VerifiedResultPackage } from "@/lib/orchestrator/types";

const SUGGESTED = [
  "What did we spend last month?",
  "Who were our top five counterparties last quarter?",
  "Does our balance match the transactions?",
  "How many transactions have no reference number or UTR?",
];

const STATE_FOR: Record<string, StageState> = {
  start: "active", progress: "active", done: "done", skipped: "skipped", error: "error",
};

const EMPTY: TheatreState = { states: {}, notes: {}, artifacts: {} };

interface Answer {
  pkg: VerifiedResultPackage | null;
  sql?: string;
  records: EvidenceRecord[];
  filters: Record<string, unknown>;
}

function Workspace() {
  const params = useSearchParams();
  const replay = params.get("replay");
  const slow = params.get("slow") === "1";

  const [theatre, setTheatre] = React.useState<TheatreState>(EMPTY);
  const [answer, setAnswer] = React.useState<Answer>({ pkg: null, records: [], filters: {} });
  const [question, setQuestion] = React.useState("");
  const [asking, setAsking] = React.useState(false);
  const [entity, setEntity] = React.useState("ent-0001");
  const [callOpen, setCallOpen] = React.useState(false);

  const apply = React.useCallback((event: TheatreEvent) => {
    setTheatre((current) => {
      const next: TheatreState = {
        states: { ...current.states, [event.stage as Stage]: STATE_FOR[event.state] ?? "idle" },
        notes: { ...current.notes },
        artifacts: { ...current.artifacts },
      };
      if (event.note) next.notes[event.stage as Stage] = event.note;
      if (event.artifact !== undefined && event.artifact !== null) {
        next.artifacts[event.stage as Stage] = event.artifact;
      }
      return next;
    });

    if (event.stage === "understand" && event.state === "done") {
      const plan = event.artifact as Record<string, any> | null;
      if (plan?.filters) setAnswer((a) => ({ ...a, filters: plan.filters }));
    }
    if (event.stage === "compute" && event.state === "done") {
      const artifact = event.artifact as Record<string, any> | null;
      setAnswer((a) => ({ ...a, sql: artifact?.sql, records: artifact?.records ?? [] }));
    }
    if (event.stage === "answer" && event.state === "done") {
      setAnswer((a) => ({ ...a, pkg: event.artifact as VerifiedResultPackage }));
    }
  }, []);

  const run = React.useCallback(async (url: string, init?: RequestInit) => {
    setTheatre(EMPTY);
    setAnswer({ pkg: null, records: [], filters: {} });
    setAsking(true);
    try {
      const response = await fetch(url, init);
      if (response.ok) await readEvents(response, apply);
    } finally {
      setAsking(false);
    }
  }, [apply]);

  React.useEffect(() => {
    if (!replay) return;
    void run(`/api/replay?name=${encodeURIComponent(replay)}${slow ? "&slow=1" : ""}`);
  }, [replay, slow, run]);

  const ask = (text: string) => {
    if (!text.trim()) return;
    void run("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversation_id: "workspace", question: text }),
    });
  };

  const pkg = answer.pkg;
  const showPanel = Boolean(pkg && pkg.answer_value !== null && !pkg.clarification && !pkg.refusal);

  return (
    <div className="flex min-h-screen flex-col">
      <header data-topbar className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-base font-semibold tracking-tight">Veritas</span>
          <label className="sr-only" htmlFor="entity">Entity</label>
          <select id="entity" name="entity" value={entity}
            onChange={(event) => setEntity(event.target.value)}
            className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 text-sm">
            <option>ent-0001</option><option>ent-0002</option>
            <option>ent-0003</option><option>ent-0004</option>
          </select>
        </div>
        <Button variant="secondary" onClick={() => setCallOpen(true)}>Call TBX</Button>
      </header>

      <PulseStrip entityId={entity} onAsk={(text) => { setQuestion(text); ask(text); }} />

      <div className="flex flex-1">
        <aside data-conversation
          className="flex w-[400px] shrink-0 flex-col justify-between border-r border-[hsl(var(--border))] p-5">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <h2 className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Ask anything about the ledger</h2>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTED.map((suggestion) => (
                <button key={suggestion} type="button" data-suggested-question
                  onClick={() => { setQuestion(suggestion); ask(suggestion); }}
                  className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-left text-sm hover:bg-[hsl(var(--brand-soft))]">
                  {suggestion}
                </button>
              ))}
            </div>

            {pkg?.question ? (
              <p data-message className="mt-5 text-sm">{pkg.question}</p>
            ) : null}
            {pkg?.clarification ? <ClarificationCard clarification={pkg.clarification} /> : null}
            {pkg?.refusal ? <RefusalCard refusal={pkg.refusal} /> : null}
          </div>

          <form className="mt-6 flex gap-2"
            onSubmit={(event) => { event.preventDefault(); ask(question); }}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)}
              aria-label="Your question" placeholder="Ask a question"
              className="h-11 min-w-0 flex-1 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm outline-none focus:border-[hsl(var(--brand))]" />
            <Button type="submit" disabled={asking}>Ask</Button>
          </form>
        </aside>

        <main className="min-w-0 flex-1 p-6">
          <Theatre state={theatre} />
          {showPanel && pkg ? (
            <TruthPanel pkg={pkg} sql={answer.sql} records={answer.records} filters={answer.filters} />
          ) : (
            <Card className="mt-6">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Ask a question and the working appears here, stage by stage, with the records behind
                the number.
              </p>
            </Card>
          )}
        </main>
      </div>

      <CallSurface open={callOpen} fakeProvider={params.get("voice_provider") === "fake"}
        pkg={pkg} sql={answer.sql} records={answer.records} filters={answer.filters}
        onAsk={(text) => { setQuestion(text); ask(text); }}
        onEnd={() => setCallOpen(false)} />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">Loading the workspace</div>}>
      <Workspace />
    </Suspense>
  );
}
