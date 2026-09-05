"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Chip, type Stage, type StageState } from "@veritas/ui";

import { CallSurface } from "@/components/call/CallSurface";
import { ClarificationCard, FailureCaseCard, RefusalCard } from "@/components/conversation/Cards";
import { Panel } from "@/components/dash/Panel";
import { PulseStrip } from "@/components/pulse/PulseStrip";
import { Theatre, type TheatreState } from "@/components/theatre/Theatre";
import type { StageDetail } from "@/components/theatre/WorkflowTimeline";
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

/** Offered once an answer is on screen, so the next question is one tap away. */
const FOLLOW_UPS = [
  "Compare that with the month before",
  "Who were our top five counterparties last quarter?",
  "Which accounts do not reconcile?",
  "What were our largest payments last month?",
];

const STATE_FOR: Record<string, StageState> = {
  start: "active", progress: "active", done: "done", skipped: "skipped", error: "error",
};

const EMPTY: TheatreState = { details: {}, artifacts: {} };

interface Message { role: "you" | "veritas"; text: string }

interface Answer {
  pkg: VerifiedResultPackage | null;
  sql?: string;
  records: EvidenceRecord[];
  filters: Record<string, unknown>;
}

function summarise(event: TheatreEvent): string | undefined {
  const artifact = event.artifact as Record<string, any> | null;
  if (!artifact) return undefined;
  if (event.stage === "understand" && artifact.intent) {
    return `Reading it as ${String(artifact.intent).replace(/_/g, " ")}`;
  }
  if (event.stage === "verify" && Array.isArray(artifact)) {
    return `${artifact.length} checks passed`;
  }
  if (event.stage === "compute" && artifact.row_count !== undefined) {
    return `${Number(artifact.row_count).toLocaleString("en-IN")} rows read`;
  }
  if (event.stage === "test" && Array.isArray(artifact)) {
    return `${artifact.length} other readings compared`;
  }
  if (event.stage === "answer" && artifact.verdict) {
    return `Verdict: ${artifact.verdict.status}`;
  }
  return undefined;
}

function Workspace() {
  const params = useSearchParams();
  const replay = params.get("replay");
  const slow = params.get("slow") === "1";

  const [theatre, setTheatre] = React.useState<TheatreState>(EMPTY);
  const [answer, setAnswer] = React.useState<Answer>({ pkg: null, records: [], filters: {} });
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [question, setQuestion] = React.useState("");
  const [asking, setAsking] = React.useState(false);
  const [entity, setEntity] = React.useState("ent-0001");
  const [callOpen, setCallOpen] = React.useState(params.get("call") === "1");

  const apply = React.useCallback((event: TheatreEvent) => {
    const stage = event.stage as Stage;
    setTheatre((current) => {
      const previous = current.details[stage];
      const detail: StageDetail = {
        state: STATE_FOR[event.state] ?? "idle",
        note: event.note ?? previous?.note,
        summary: summarise(event) ?? previous?.summary,
        startedAt: previous?.startedAt ?? Date.now(),
        endedAt: ["done", "skipped", "error"].includes(event.state) ? Date.now() : previous?.endedAt,
      };
      return {
        details: { ...current.details, [stage]: detail },
        artifacts: event.artifact === undefined || event.artifact === null
          ? current.artifacts
          : { ...current.artifacts, [stage]: event.artifact },
      };
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
      const pkg = event.artifact as VerifiedResultPackage;
      setAnswer((a) => ({ ...a, pkg }));
      if (pkg?.explanation) setMessages((m) => [...m, { role: "veritas", text: pkg.explanation }]);
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

  const ask = React.useCallback((text: string) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "you", text }]);
    setQuestion("");
    void run("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversation_id: "workspace", question: text }),
    });
  }, [run]);

  // A question handed over from the landing page runs itself.
  const handed = params.get("q");
  const startedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!handed || replay || startedFor.current === handed) return;
    startedFor.current = handed;
    ask(handed);
  }, [handed, replay, ask]);

  const pkg = answer.pkg;
  const showPanel = Boolean(pkg && pkg.answer_value !== null && !pkg.clarification && !pkg.refusal);
  const started = Object.keys(theatre.details).length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header data-topbar
        className="flex items-center justify-between gap-4 border-b border-[hsl(var(--border))] px-7 py-4">
        <div className="flex items-center gap-5">
          <span className="text-lg font-semibold tracking-tight">Veritas</span>
          <label className="sr-only" htmlFor="entity">Entity</label>
          <select id="entity" name="entity" value={entity}
            onChange={(event) => setEntity(event.target.value)}
            className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm">
            <option>ent-0001</option><option>ent-0002</option>
            <option>ent-0003</option><option>ent-0004</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <a href="/benchmark" className="rounded-[var(--radius)] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            Model receipts
          </a>
          <Button variant="secondary" onClick={() => setCallOpen(true)}>Call Veritas</Button>
        </div>
      </header>

      <PulseStrip entityId={entity} onAsk={ask} />

      <div className="flex min-h-0 flex-1 flex-col gap-6 p-7 lg:flex-row">
        <section data-conversation
          className="flex min-h-[60vh] w-full shrink-0 flex-col justify-between rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 lg:w-[560px]">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <>
                <h2 className="text-lg font-medium">Ask anything about the ledger</h2>
                <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                  Every answer comes back with the rows behind it and the other readings that
                  would change it.
                </p>
                <div className="mt-6 flex flex-col gap-2">
                  {SUGGESTED.map((suggestion) => (
                    <button key={suggestion} type="button" data-suggested-question
                      onClick={() => ask(suggestion)}
                      className="rounded-[var(--radius)] border border-[hsl(var(--border))] px-4 py-3 text-left text-sm transition-colors duration-[var(--motion-fast)] hover:bg-[hsl(var(--brand-soft))]">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((message, index) => (
                  <p key={index} data-message
                    className={message.role === "you"
                      ? "self-end rounded-[var(--radius)] bg-[hsl(var(--brand-soft))] px-4 py-3 text-base text-[hsl(var(--brand-text))]"
                      : "text-base leading-relaxed"}>
                    {message.text}
                  </p>
                ))}
                {asking ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">Working through it</p>
                ) : null}
              </div>
            )}

            {pkg?.clarification ? (
              <ClarificationCard clarification={pkg.clarification}
                onChoose={(index) => ask(pkg.clarification!.options[index].label)} />
            ) : null}
            {pkg?.refusal ? (
              <>
                <RefusalCard refusal={pkg.refusal} />
                <FailureCaseCard />
              </>
            ) : null}

            {showPanel && !asking ? (
              <div className="mt-6">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Ask next
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {FOLLOW_UPS.map((follow) => (
                    <button key={follow} type="button" data-suggested-question data-follow-up
                      onClick={() => ask(follow)}
                      className="rounded-full border border-[hsl(var(--border))] px-4 py-2 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-[hsl(var(--brand-soft))]">
                      {follow}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <form className="mt-6 flex gap-2"
            onSubmit={(event) => { event.preventDefault(); ask(question); }}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)}
              aria-label="Your question" placeholder="Ask a question about the ledger"
              className="h-12 min-w-0 flex-1 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-base outline-none focus:border-[hsl(var(--brand))]" />
            <Button type="submit" disabled={asking}>Ask</Button>
          </form>
        </section>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Panel title="How this answer was reached"
            subtitle={started ? undefined : "The five steps appear here as the answer is worked out"}
            badge={asking ? <Chip tone="brand">Running</Chip> : null}>
            <Theatre state={theatre} />
          </Panel>

          {/* One panel, switching its contents. Two panels in the same position
              would share React state, and the collapsed one would stay shut. */}
          <Panel title="The answer"
            subtitle={showPanel ? "With the readings that would change it"
                                : "Nothing computed yet. Ask a question, or click a tile above."}>
            {showPanel && pkg ? (
              <TruthPanel pkg={pkg} sql={answer.sql} records={answer.records} filters={answer.filters} />
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                The number, the readings beside it and the rows behind it appear here.
              </p>
            )}
          </Panel>
        </div>
      </div>

      <CallSurface open={callOpen} fakeProvider={params.get("voice_provider") === "fake"}
        pkg={pkg} sql={answer.sql} records={answer.records} filters={answer.filters}
        onAsk={ask} onEnd={() => setCallOpen(false)} />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="p-7 text-base">Loading the workspace</div>}>
      <Workspace />
    </Suspense>
  );
}
