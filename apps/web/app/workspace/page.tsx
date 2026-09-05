"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Button, Chip, Panel, ThemeToggle, useReducedMotion,
  type Provenance, type Stage, type StageState,
} from "@veritas/ui";

import { CallSurface } from "@/components/call/CallSurface";
import { ClarificationCard, FailureCaseCard, RefusalCard } from "@/components/conversation/Cards";
import { DemoBar } from "@/components/demo/DemoBar";
import { PulseStrip } from "@/components/pulse/PulseStrip";
import { Theatre, type TheatreState } from "@/components/theatre/Theatre";
import type { StageDetail } from "@/components/theatre/WorkflowTimeline";
import { TruthPanel } from "@/components/truth/TruthPanel";
import { Inspector } from "@/components/workspace/Inspector";
import type { EvidenceRecord } from "@/components/evidence/EvidenceDrawer";
import { showEvidenceAndExport } from "@/lib/demo/evidence";
import { readDemoParam } from "@/lib/demo/script";
import { useDemo, type RunOutcome } from "@/lib/demo/useDemo";
import { readEvents } from "@/lib/theatre/stream";
import type { QueryPlan, TheatreEvent, VerifiedResultPackage } from "@/lib/orchestrator/types";

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
  plan?: QueryPlan;
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
  // Read from the catalog rather than hard coded: swapping the dataset must
  // change what the header offers, or every tile queries an entity that is not
  // in the data and reports zero.
  const [entities, setEntities] = React.useState<string[]>([]);
  const [entity, setEntity] = React.useState("");
  const [callOpen, setCallOpen] = React.useState(params.get("call") === "1");
  const [trail, setTrail] = React.useState<Provenance | null>(null);

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
      const plan = event.artifact as QueryPlan | null;
      if (plan) setAnswer((a) => ({ ...a, plan, filters: plan.filters ?? a.filters }));
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

  /**
   * The one path an answer takes. It reports how the run ended so a caller that
   * cares, such as the demo runner, can tell a finished answer from a stream
   * that failed, timed out or stopped short.
   */
  const run = React.useCallback(async (url: string, init?: RequestInit): Promise<RunOutcome> => {
    setTheatre(EMPTY);
    setAnswer({ pkg: null, records: [], filters: {} });
    setTrail(null);
    setAsking(true);
    let failure: string | null = null;
    let answered = false;
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        failure = `the request came back ${response.status}`;
      } else {
        await readEvents(response, (event) => {
          if (event.state === "error") failure = event.note ?? "the pipeline reported an error";
          if (event.stage === "answer" && event.state === "done") answered = true;
          apply(event);
        });
      }
    } catch (error) {
      failure = String((error as Error)?.message ?? error);
    } finally {
      setAsking(false);
    }
    if (failure) return { ok: false, reason: failure };
    if (!answered) return { ok: false, reason: "the stream ended without an answer" };
    return { ok: true };
  }, [apply]);

  const ask = React.useCallback((text: string, options?: { signal?: AbortSignal }) => {
    if (!text.trim()) return Promise.resolve<RunOutcome>({ ok: false, reason: "no question" });
    setMessages((m) => [...m, { role: "you", text }]);
    setQuestion("");
    return run("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversation_id: "workspace", question: text }),
      signal: options?.signal,
    });
  }, [run]);

  const demoParam = readDemoParam(params.get("demo"));

  React.useEffect(() => {
    if (!replay || demoParam.active) return;
    void run(`/api/replay?name=${encodeURIComponent(replay)}${slow ? "&slow=1" : ""}`);
  }, [replay, slow, demoParam.active, run]);

  // A question handed over from the landing page runs itself.
  const handed = params.get("q");
  const startedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!handed || replay || demoParam.active || startedFor.current === handed) return;
    startedFor.current = handed;
    void ask(handed);
  }, [handed, replay, demoParam.active, ask]);

  // Whatever dataset is loaded decides the entities on offer. The first one is
  // selected so the pulse tiles have something real to ask about immediately.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((catalog) => {
        if (cancelled || !catalog?.entities?.length) return;
        setEntities(catalog.entities);
        setEntity((current) => (current && catalog.entities.includes(current) ? current : catalog.entities[0]));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const reduced = useReducedMotion();

  /** A replayed beat shows its question too, so the conversation still reads. */
  const replayBeat = React.useCallback(
    (fixture: string, text: string, echo: boolean, signal: AbortSignal) => {
      if (echo) setMessages((m) => [...m, { role: "you", text }]);
      const slowly = reduced ? "" : "&slow=1";
      return run(`/api/replay?name=${encodeURIComponent(fixture)}${slowly}`, { signal });
    },
    [run, reduced],
  );

  const clearAnswer = React.useCallback(() => {
    setTheatre(EMPTY);
    setAnswer({ pkg: null, records: [], filters: {} });
    setTrail(null);
  }, []);

  const demo = useDemo({
    requested: demoParam.active,
    forced: demoParam.forced,
    askLive: React.useCallback(
      (text: string, signal: AbortSignal) => ask(text, { signal }),
      [ask],
    ),
    replayBeat,
    clearAnswer,
    afterAnswer: React.useCallback((after) => {
      if (after === "evidence") showEvidenceAndExport(reduced ? 0 : 1200);
    }, [reduced]),
    onExit: React.useCallback(() => {
      window.history.replaceState(null, "", "/workspace");
    }, []),
  });

  const pkg = answer.pkg;
  const showPanel = Boolean(pkg && pkg.answer_value !== null && !pkg.clarification && !pkg.refusal);
  const started = Object.keys(theatre.details).length > 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Demo mode is decided from the URL at mount, so the bar is there from
          the first paint and nothing below it moves once the demo is running. */}
      {demo.active ? <DemoBar controller={demo} /> : null}

      <header data-topbar
        className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-rule bg-surface px-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="text-sm font-semibold tracking-tight">Veritas</span>
          <label className="sr-only" htmlFor="entity">Entity</label>
          <select id="entity" name="entity" value={entity}
            onChange={(event) => setEntity(event.target.value)}
            className="h-7 rounded-sm border border-rule bg-surface px-2 text-2xs uppercase tracking-label text-ink-2 outline-none hover:border-rule-strong focus:border-accent">
            {entities.length
              ? entities.map((id) => <option key={id} value={id}>{id}</option>)
              : <option value="">loading</option>}
          </select>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-baseline gap-2 lg:flex">
            <span className="label">Bounds</span>
            <span data-numeric className="text-2xs text-ink-3">
              {pkg?.period_label ?? "whole ledger"}
            </span>
          </span>
          <span className="hidden items-baseline gap-2 lg:flex">
            <span className="label">Rows read</span>
            <span data-numeric className="text-2xs text-ink-3">
              {answer.records.length.toLocaleString("en-IN")}
            </span>
          </span>
          <span data-run-state={asking ? "running" : "idle"}>
            {asking
              ? <Chip tone="brand">Running</Chip>
              : <Chip tone="quiet">{started ? "Idle" : "Ready"}</Chip>}
          </span>
          <a href="/benchmark" className="rounded-sm px-1 py-1 text-xs text-ink-3 hover:text-ink">
            Model receipts
          </a>
          <ThemeToggle />
          <Button variant="secondary" size="sm" onClick={() => setCallOpen(true)}>Call Veritas</Button>
        </div>
      </header>

      <PulseStrip entityId={entity} onAsk={ask} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section data-conversation
          className="flex w-[520px] min-w-[520px] shrink-0 flex-col border-r border-rule bg-surface">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <>
                <h2 className="text-base font-semibold">Ask anything about the ledger</h2>
                <p className="mt-1.5 text-sm text-ink-2">
                  Every answer comes back with the rows behind it and the other readings that
                  would change it.
                </p>
                <div className="mt-5 border-t border-rule">
                  {SUGGESTED.map((suggestion) => (
                    <button key={suggestion} type="button" data-suggested-question
                      onClick={() => ask(suggestion)}
                      className="block w-full border-b border-rule-faint px-1 py-2.5 text-left text-sm text-ink-2 transition-colors duration-[var(--motion-fast)] hover:bg-surface-sunken hover:text-ink">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((message, index) => (
                  <p key={index} data-message
                    className={message.role === "you"
                      ? "self-end rounded-sm border border-rule bg-surface-sunken px-2.5 py-1.5 text-sm text-ink"
                      : "border-l-2 border-accent-line pl-3 text-base text-ink"}>
                    {message.text}
                  </p>
                ))}
                {asking ? (
                  <p className="text-xs text-ink-3">Working through it</p>
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
              <div className="mt-6 border-t border-rule pt-3">
                <span className="label">Ask next</span>
                <div className="mt-2 flex flex-col">
                  {FOLLOW_UPS.map((follow) => (
                    <button key={follow} type="button" data-suggested-question data-follow-up
                      onClick={() => ask(follow)}
                      className="border-b border-rule-faint px-1 py-2 text-left text-sm text-ink-2 transition-colors duration-[var(--motion-fast)] hover:bg-surface-sunken hover:text-ink">
                      {follow}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <form className="flex shrink-0 gap-1.5 border-t border-rule p-3"
            onSubmit={(event) => { event.preventDefault(); ask(question); }}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)}
              aria-label="Your question" placeholder="Ask a question about the ledger"
              className="h-9 min-w-0 flex-1 rounded-sm border border-rule-strong bg-surface px-2.5 text-sm text-ink outline-none placeholder:text-ink-4 focus:border-accent" />
            <Button type="submit" disabled={asking}>Ask</Button>
          </form>
        </section>

        {/* Centre and rail. The rail sits beside the centre on a wide screen and
            under it on a narrow one, so nothing important is pushed off. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto min-[1600px]:flex-row min-[1600px]:overflow-hidden">
          {/* Stacked, the centre sizes to its content and the container
              scrolls. It must not be a flex-1 item there: the rail below is
              shrink-0 and taller than the container, so flex-1 collapsed the
              centre to a sliver and its content painted over the rail. */}
          <div className="flex min-w-0 flex-col bg-paper p-3 min-[1600px]:min-h-0 min-[1600px]:flex-1 min-[1600px]:overflow-hidden">
            <Panel
              title="How this answer was reached"
              meta={started ? undefined : "the five steps appear here as the answer is worked out"}
              actions={asking ? <Chip tone="brand">Running</Chip> : null}
              className="shrink-0"
              bodyClassName="max-h-[40vh] overflow-y-auto p-4"
            >
              <Theatre state={theatre} />
            </Panel>

            {/* One panel, switching its contents. Two panels in the same position
                would share React state, and the collapsed one would stay shut. */}
            <Panel
              title="The answer"
              meta={showPanel ? "with the readings that would change it" : "nothing computed yet"}
              className="mt-3 min-[1600px]:min-h-0 min-[1600px]:flex-1"
              bodyClassName="min-h-0 overflow-y-auto p-4"
            >
              {showPanel && pkg ? (
                <TruthPanel pkg={pkg} sql={answer.sql} records={answer.records}
                  filters={answer.filters} plan={answer.plan}
                  inquiry={false} onAsk={ask}
                  onInspect={(_id, found) => setTrail(found)} />
              ) : (
                <p className="text-sm text-ink-3">
                  The number, the readings beside it and the rows behind it appear here. Ask a
                  question, or click a tile above.
                </p>
              )}
            </Panel>
          </div>

          <Inspector pkg={showPanel ? pkg : null} plan={answer.plan} trail={trail}
            onCloseTrail={() => setTrail(null)} onAsk={ask} />
        </div>
      </div>

      <CallSurface open={callOpen} fakeProvider={params.get("voice_provider") === "fake"}
        pkg={pkg} sql={answer.sql} records={answer.records} filters={answer.filters}
        plan={answer.plan} onAsk={ask} onEnd={() => setCallOpen(false)} />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-3">Loading the workspace</div>}>
      <Workspace />
    </Suspense>
  );
}
