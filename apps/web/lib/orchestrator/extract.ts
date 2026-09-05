/**
 * Question in, validated QueryPlan out.
 *
 * The plan is validated against the frozen contract itself rather than a
 * hand-written copy of it, so the two can never drift apart. One retry is
 * allowed, with the validation errors fed back to the model.
 */
import fs from "fs";
import path from "path";
import Ajv2020 from "ajv/dist/2020";

import { chat, type Message } from "../llm/provider";
import { SCHEMA_GUIDE } from "./schemaGuide";
import type { QueryPlan } from "./types";

const REPO_ROOT = path.resolve(process.cwd(), process.cwd().endsWith("apps/web") ? "../.." : ".");
const CONTRACT = path.join(REPO_ROOT, "contracts/query_plan.schema.json");

let validator: ReturnType<Ajv2020["compile"]> | null = null;
let planSchema: Record<string, unknown> | null = null;

function validate() {
  if (!validator) {
    planSchema = JSON.parse(fs.readFileSync(CONTRACT, "utf8"));
    validator = new Ajv2020({ strict: false, allErrors: true }).compile(planSchema as object);
  }
  return validator;
}

export interface Catalog {
  entities: string[];
  channels: string[];
  counterparties: { canonical: string; family: string; count: number }[];
  data_bounds: { min_date: string; max_date: string };
}

let cached: { at: number; catalog: Catalog } | null = null;
const CATALOG_TTL_MS = 5 * 60 * 1000;

/** The catalog, refreshed at most every five minutes. */
export async function getCatalog(): Promise<Catalog> {
  if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.catalog;
  const base = process.env.QUERY_SERVICE_URL || "http://localhost:8000";
  const response = await fetch(`${base}/catalog`);
  if (!response.ok) throw new Error(`catalog unavailable: ${response.status}`);
  const catalog = (await response.json()) as Catalog;
  cached = { at: Date.now(), catalog };
  return catalog;
}

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
                                  previous: QueryPlan | null): Promise<Extraction> {
  const check = validate();
  let errors: string[] = [];

  for (const attempt of [0, 1]) {
    const messages = buildPrompt(question, catalog, previous, attempt ? errors.join("; ") : undefined);
    const raw = await chat(messages, { jsonSchema: planSchema ?? undefined });
    const plan = parse(raw);
    if (!plan) {
      errors = ["the answer was not JSON"];
      continue;
    }
    if (check(plan)) return { plan, errors: [] };
    errors = (check.errors ?? []).slice(0, 4).map((e) => `${e.instancePath || "plan"} ${e.message}`);
  }
  return { plan: null, errors };
}
