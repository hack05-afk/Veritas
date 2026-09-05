/**
 * The Reasoning Theatre stream.
 *
 * A question becomes a plan, a computed answer, a verdict and a checked
 * sentence, and every step is emitted as it happens so the interface can show
 * the working rather than a spinner.
 */
import { NextResponse } from "next/server";

import { decide } from "@/lib/orchestrator/decide";
import { explain } from "@/lib/orchestrator/explain";
import { extractPlan, getCatalog } from "@/lib/orchestrator/extract";
import { buildPackage, emptyPackage } from "@/lib/orchestrator/package";
import * as state from "@/lib/orchestrator/state";
import type { QueryPlan, TheatreEvent, VerifiedResultPackage } from "@/lib/orchestrator/types";
import { clarificationFor, verifyPlan } from "@/lib/orchestrator/verify";
import { provider } from "@/lib/llm/provider";

export const dynamic = "force-dynamic";

async function runQuery(plan: QueryPlan) {
  const base = (process.env.QUERY_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");
  const response = await fetch(`${base}/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(plan),
    signal: AbortSignal.timeout(Number(process.env.QUERY_SERVICE_TIMEOUT_MS || 20000)),
  });
  if (!response.ok) throw new Error(`query service returned ${response.status}: ${await response.text()}`);
  return response.json();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { conversation_id: conversationId, question, model,
          _fake_explain_override: override } = body ?? {};

  if (!conversationId || !question) {
    return NextResponse.json({ detail: "conversation_id and question are required" }, { status: 400 });
  }
  if (override !== undefined && provider() !== "fake") {
    return NextResponse.json({ detail: "_fake_explain_override is only accepted with LLM_PROVIDER=fake" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: TheatreEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      const at = () => Math.floor(Date.now() / 1000);

      const finish = async (pkg: VerifiedResultPackage) => {
        const written = await explain(pkg, override, model);
        pkg.explanation = written.explanation;
        pkg.explanation_source = written.explanation_source;
        send({ stage: "answer", state: "done", artifact: pkg, ts: at() });
        state.remember(conversationId, null, pkg);
        close();
      };

      try {
        const turn = state.nextTurn(conversationId);
        const previous = state.get(conversationId).plan;

        send({ stage: "understand", state: "start", ts: at() });
        const catalog = await getCatalog();
        const { plan, errors } = await extractPlan(question, catalog, previous, model);
        const decision = decide(question, plan, previous, catalog, errors);

        if (decision.kind !== "compute") {
          const artifact = decision.kind === "refuse"
            ? { refusal: decision.refusal } : { clarification: decision.clarification };
          send({ stage: "understand", state: "done", artifact: { ...artifact, turn }, ts: at() });
          send({ stage: "answer", state: "start", ts: at() });
          await finish(emptyPackage(question, artifact as Partial<VerifiedResultPackage>));
          return;
        }

        const validated: QueryPlan = { ...decision.plan, conversation_id: conversationId, turn };
        send({ stage: "understand", state: "done", artifact: validated, ts: at() });

        send({ stage: "verify", state: "start", ts: at() });
        const checks = verifyPlan(validated, catalog);
        send({ stage: "verify", state: "done", artifact: checks, ts: at() });

        const failed = checks.filter((check) => !check.ok);
        if (failed.length) {
          const clarification = clarificationFor(failed, catalog);
          send({ stage: "answer", state: "start", ts: at() });
          await finish(emptyPackage(question, { clarification }));
          return;
        }

        send({ stage: "compute", state: "start", ts: at() });
        const result = await runQuery(validated);
        send({
          stage: "compute", state: "done", ts: at(),
          artifact: { sql: result.primary?.sql, value: result.primary?.value,
                      rows: result.primary?.rows, row_count: result.primary?.row_count },
        });

        const pkg = buildPackage(question, validated, result);
        if (pkg.alternatives.length) {
          send({ stage: "test", state: "start", ts: at() });
          send({ stage: "test", state: "done", artifact: pkg.alternatives, ts: at() });
        } else {
          send({ stage: "test", state: "skipped", ts: at(),
                 note: "This question has one reading, so there is nothing to compare it with." });
        }

        state.remember(conversationId, validated, null);
        send({ stage: "answer", state: "start", ts: at() });
        await finish(pkg);
      } catch (error) {
        send({ stage: "compute", state: "error", ts: at(), note: String((error as Error).message ?? error) });
        send({ stage: "answer", state: "error", ts: at(),
               note: "Nothing was computed, so no answer is shown." });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" },
  });
}
