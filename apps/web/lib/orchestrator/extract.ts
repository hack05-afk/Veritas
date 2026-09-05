/**
 * Question in, validated QueryPlan out.
 *
 * The plan is validated against the contract itself, inlined in planSchema.ts so
 * that nothing is read from disk at request time. One retry is allowed, with the
 * validation errors fed back to the model.
 */
import Ajv2020 from "ajv/dist/2020";

import { chat, type Message } from "../llm/provider";
import { normalisePlan, PLAN_CONTRACT, STRICT_PLAN_REQUEST } from "./planSchema";
import { SCHEMA_GUIDE } from "./schemaGuide";
import type { QueryPlan } from "./types";

let validator: ReturnType<Ajv2020["compile"]> | null = null;

function validate() {
  if (!validator) {
    validator = new Ajv2020({ strict: false, allErrors: true }).compile(PLAN_CONTRACT as object);
  }
  return validator;
}

export interface Catalog {
  entities: string[];
  accounts?: { account_id: string; entity_id: string; account_masked: string; bank_code: string }[];
  channels: string[];
  counterparties: { canonical: string; family: string; count: number }[];
  data_bounds: { min_date: string; max_date: string };
}

interface CachedCatalog { at: number; url: string; catalog: Catalog }

let cached: CachedCatalog | null = null;
const CATALOG_TTL_MS = Number(process.env.CATALOG_TTL_MS || 5 * 60 * 1000);

function queryServiceUrl(): string {
  return (process.env.QUERY_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");
}

function queryTimeoutMs(): number {
  return Number(process.env.QUERY_SERVICE_TIMEOUT_MS || 20000);
}

/** Drop the cached catalog, so the next call fetches a fresh one. */
export function invalidateCatalog(): void {
  cached = null;
}

/**
 * The catalog, refreshed at most every five minutes. The cache is keyed on the
 * query service URL, so pointing the app at a different service never serves the
 * previous one's catalog.
 */
export async function getCatalog(options?: { refresh?: boolean }): Promise<Catalog> {
  const base = queryServiceUrl();
  if (!options?.refresh && cached && cached.url === base && Date.now() - cached.at < CATALOG_TTL_MS) {
    return cached.catalog;
  }
  const response = await fetch(`${base}/catalog`, { signal: AbortSignal.timeout(queryTimeoutMs()) });
  if (!response.ok) throw new Error(`catalog unavailable: ${response.status}`);
  const catalog = (await response.json()) as Catalog;
  cached = { at: Date.now(), url: base, catalog };
  return catalog;
}

/**
 * The context the model reads.
 *
 * Two of these parts can carry an identifier: the question a person typed, and
 * the previous plan, which holds the reference value of an earlier lookup. Both
 * are held back at the provider boundary, where every prompt is swapped for
 * placeholders before it is sent and the real values are put back into the plan
 * that comes home. Nothing else here has ever seen a raw record: the catalog
 * carries masked accounts and decoded counterparty names only.
 */
function buildPrompt(question: string, catalog: Catalog, previous: QueryPlan | null, retry?: string): Message[] {
  const names = catalog.counterparties.slice(0, 60).map((c) => c.canonical).join(", ");
  const context = [
    `Data covers ${catalog.data_bounds.min_date} to ${catalog.data_bounds.max_date}.`,
    `Entities: ${catalog.entities.join(", ")}.`,
    `Known counterparties: ${names}.`,
    previous ? `<previous_plan>${JSON.stringify(previous)}</previous_plan>` : "<previous_plan></previous_plan>",
    `<question>${question}</question>`,
    retry ? `Your previous answer was rejected: ${retry}. Return corrected JSON only.` : "",
  ].filter(Boolean).join("\n");

  return [{ role: "system", content: SCHEMA_GUIDE }, { role: "user", content: context }];
}

function parse(text: string): QueryPlan | null {
  const trimmed = text.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const braced = trimmed.match(/\{[\s\S]*\}/);
    if (!braced) return null;
    try {
      return JSON.parse(braced[0]);
    } catch {
      return null;
    }
  }
}

export interface Extraction {
  plan: QueryPlan | null;
  errors: string[];
}

/** Ask the model for a plan and validate it, retrying once with the errors. */
export async function extractPlan(question: string, catalog: Catalog,
                                  previous: QueryPlan | null,
                                  model?: string): Promise<Extraction> {
  const check = validate();
  let errors: string[] = [];

  for (const attempt of [0, 1]) {
    const messages = buildPrompt(question, catalog, previous, attempt ? errors.join("; ") : undefined);
    let raw: string;
    try {
      raw = await chat(messages, { jsonSchema: STRICT_PLAN_REQUEST, model });
    } catch (error) {
      errors = [String((error as Error).message ?? error)];
      continue;
    }

    // The model answers in the flattened shape; the contract is still what a
    // plan has to satisfy before anything is computed from it.
    const plan = normalisePlan(parse(raw)) as QueryPlan | null;
    if (!plan) {
      errors = ["the answer was not JSON"];
      continue;
    }
    if (check(plan)) return { plan, errors: [] };
    errors = (check.errors ?? []).slice(0, 4).map((e) => `${e.instancePath || "plan"} ${e.message}`);
  }
  return { plan: null, errors };
}
