/**
 * The only place a language model is called.
 *
 * Business logic never names a provider. Set LLM_PROVIDER=fake to answer from
 * fixtures, which is how the tests run and how the product degrades when no key
 * is configured.
 */
import fs from "fs";
import path from "path";

export interface Message { role: "system" | "user" | "assistant"; content: string }
export interface ChatOptions {
  jsonSchema?: Record<string, unknown>;
  /** Fake provider only: stand in for the explanation the model would have written. */
  fakeExplainOverride?: string;
}

const REPO_ROOT = path.resolve(process.cwd(), process.cwd().endsWith("apps/web") ? "../.." : ".");
const FIXTURE = path.join(REPO_ROOT, "fixtures/llm/fake_responses.json");

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
  return JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
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
    return options?.fakeExplainOverride ?? fixtures["__explain__"] ?? "";
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

async function openAiCompatibleChat(messages: Message[], options?: ChatOptions): Promise<string> {
  const base = process.env.LLM_BASE_URL;
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!base || !key || !model) throw new Error("LLM_BASE_URL, LLM_API_KEY and LLM_MODEL must be set");

  const body: Record<string, unknown> = { model, messages, temperature: 0 };
  if (options?.jsonSchema) {
    body.response_format = { type: "json_schema", json_schema: { name: "plan", schema: options.jsonSchema } };
  }
  const response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`model call failed: ${response.status} ${await response.text()}`);
  const parsed = await response.json();
  return parsed.choices?.[0]?.message?.content ?? "";
}

/** Send messages to the configured model and return its raw text. */
export async function chat(messages: Message[], options?: ChatOptions): Promise<string> {
  if (provider() === "fake") return fakeChat(messages.map((m) => m.content).join("\n"), options);
  return openAiCompatibleChat(messages, options);
}
