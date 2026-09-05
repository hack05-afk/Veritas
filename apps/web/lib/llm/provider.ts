/**
 * The only place a language model is called.
 *
 * Business logic never names a provider. Set LLM_PROVIDER=fake to answer from
 * fixtures, which is how the tests run and how the product degrades when no key
 * is configured.
 */
import fs from "fs";

import { requireRepoFile } from "../paths";
import { sanitiseForModel } from "../security/redact";

export interface Message { role: "system" | "user" | "assistant"; content: string }
export interface ChatOptions {
  jsonSchema?: Record<string, unknown>;
  /** Overrides LLM_MODEL for this call. Used by the benchmark runner. */
  model?: string;
  /** Fake provider only: stand in for the explanation the model would have written. */
  fakeExplainOverride?: string;
}

export const REFUSAL = {
  refusal: {
    reason: "That cannot be derived from this data without guessing.",
    can_do: [
      "Spend for a period, in total or split by channel",
      "Spend or receipts for a named counterparty",
      "A ranking of counterparties by amount paid",
      "Balances per account or per entity",
      "A lookup by reference number or UTR",
      "Reconciliation checks: balance gaps, unmatched transfers, unreferenced rows",
    ],
  },
};

const NO_CONTEXT_CLARIFICATION = {
  clarification: {
    question: "There is nothing earlier in this conversation to compare with. Which period did you mean?",
    options: [
      { label: "The latest month against the month before it" },
      { label: "The latest quarter against the quarter before it" },
    ],
  },
};

export function provider(): string {
  return process.env.LLM_PROVIDER || "fake";
}

function readFixtures(): Record<string, string> {
  return JSON.parse(fs.readFileSync(requireRepoFile("fixtures/llm/fake_responses.json"), "utf8"));
}

function between(text: string, tag: string): string | null {
  const found = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  const inner = found?.[1]?.trim();
  return inner ? inner : null;
}

/** The fake provider: fixture lookup plus the two directives the fixtures use. */
function fakeChat(prompt: string, options?: ChatOptions): string {
  const fixtures = readFixtures();
  if (prompt.includes("<explain>")) {
    // Stand in for a model that rewrote the sentence faithfully: give back the
    // template it was handed, figures and all. Returning a canned sentence with
    // no number in it would sail through the grounding gate while quietly
    // dropping the answer, which is the one thing the gate exists to catch.
    return options?.fakeExplainOverride ?? between(prompt, "explain") ?? fixtures["__explain__"] ?? "";
  }

  const question = between(prompt, "question") ?? "";
  const answer = fixtures[question];
  if (answer === undefined || answer === "@refuse") return JSON.stringify(REFUSAL);

  if (answer === "@period_compare_from_previous") {
    const previous = between(prompt, "previous_plan");
    if (!previous) return JSON.stringify(NO_CONTEXT_CLARIFICATION);
    const plan = JSON.parse(previous);
    return JSON.stringify({ ...plan, intent: "period_compare", group_by: "month", limit: 2 });
  }
  return answer;
}

// 400 is deliberately absent: a rejected request is retried once with a
// different response_format, not blindly with the same body.
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function timeoutMs(): number {
  return Number(process.env.LLM_TIMEOUT_MS || 30000);
}

/**
 * Headroom for the answer, and the main lever on throughput.
 *
 * Hosted endpoints bill this reservation against the tokens-per-minute budget
 * rather than what the call actually spends, so 4096 here bought about one
 * question a minute on a small allowance. A plan and a two-sentence explanation
 * both fit inside 1024 with room for a reasoning model's own tokens.
 */
function maxCompletionTokens(): number {
  return Number(process.env.LLM_MAX_COMPLETION_TOKENS || 1024);
}

/** One pass over the endpoint with a fixed body, retried on throttling and faults. */
async function post(base: string, key: string, body: Record<string, unknown>):
    Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  let lastError = "";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs()),
      });
    } catch (error) {
      // A dropped connection or a timeout is worth another attempt.
      lastStatus = 0;
      lastError = String((error as Error).message ?? error);
      if (attempt === MAX_ATTEMPTS) break;
      await wait(Math.min(16000, 600 * 2 ** attempt) + Math.floor(Math.random() * 400));
      continue;
    }

    if (response.ok) {
      const parsed = await response.json();
      return { ok: true, text: parsed.choices?.[0]?.message?.content ?? "" };
    }

    lastStatus = response.status;
    lastError = `${response.status} ${(await response.text()).slice(0, 300)}`;
    if (!RETRY_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) break;

    // Hosted endpoints throttle by tokens per minute. Honour Retry-After when
    // it is given, and back off with a little jitter when it is not.
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(16000, 600 * 2 ** attempt) + Math.floor(Math.random() * 400);
    await wait(backoff);
  }

  return { ok: false, status: lastStatus, error: lastError };
}

async function openAiCompatibleChat(messages: Message[], options?: ChatOptions): Promise<string> {
  const base = process.env.LLM_BASE_URL;
  const key = process.env.LLM_API_KEY;
  const model = options?.model || process.env.LLM_MODEL;
  if (!base || !key || !model) throw new Error("LLM_BASE_URL, LLM_API_KEY and LLM_MODEL must be set");

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0,
    // Reasoning models spend tokens before they write anything, so the answer
    // needs headroom or it arrives truncated.
    max_completion_tokens: maxCompletionTokens(),
  };
  if (options?.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "plan", strict: true, schema: options.jsonSchema },
    };
  }

  const first = await post(base, key, body);
  if (first.ok) return first.text;

  // Not every endpoint accepts a strict schema for every model. A rejected
  // request falls back to plain JSON mode with the schema stated in the prompt;
  // the answer is validated against the contract either way.
  if (first.status === 400 && options?.jsonSchema) {
    const relaxed = {
      ...body,
      response_format: { type: "json_object" },
      messages: [
        ...messages,
        {
          role: "system" as const,
          content: `Answer with a single JSON object matching this JSON Schema, and nothing else: ${JSON.stringify(options.jsonSchema)}`,
        },
      ],
    };
    const second = await post(base, key, relaxed);
    if (second.ok) return second.text;
    throw new Error(`model call failed: ${second.error}`);
  }

  throw new Error(`model call failed: ${first.error}`);
}

/**
 * Send messages to the configured model and return its raw text.
 *
 * Every prompt in the product is built somewhere else and sent from here, so
 * this is where account numbers and UTRs are held back. Each one is swapped for
 * a placeholder on the way out and put back into the model's answer on the way
 * in, which keeps a plan that looks up a UTR working while the model never sees
 * the value. There is no way to reach a model without passing through here.
 */
export async function chat(messages: Message[], options?: ChatOptions): Promise<string> {
  const { safe, restore } = sanitiseForModel(messages);
  if (provider() === "fake") {
    // The fake provider is a local fixture table, not a model: nothing leaves
    // the machine, so the placeholders are resolved before the lookup and the
    // fixture keys stay the questions a person would actually type.
    return fakeChat(restore(safe).map((m) => m.content).join("\n"), options);
  }
  return restore(await openAiCompatibleChat(safe, options));
}
