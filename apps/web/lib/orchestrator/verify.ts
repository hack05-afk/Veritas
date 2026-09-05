/**
 * The Verify stage.
 *
 * A plan is checked against what the ledger actually holds before anything is
 * computed from it, so a plan that names a period, a counterparty, an entity or
 * an account the data does not have becomes a question back rather than a
 * confident zero.
 */
import type { Catalog } from "./extract";
import { SUPPORTED_INTENTS } from "./planSchema";
import type { Clarification, QueryPlan } from "./types";

export interface Check {
  check: string;
  ok: boolean;
  reason?: string;
}

const SENSITIVE = ["account_number", "utr_number", "description"];

function intentCheck(plan: QueryPlan): Check {
  const intent = plan.intent ?? "";
  const ok = SUPPORTED_INTENTS.includes(intent);
  return {
    check: "intent is one the query service can compute",
    ok,
    ...(ok ? {} : { reason: `${intent || "no intent"} is not a question this data answers` }),
  };
}

function periodCheck(plan: QueryPlan, catalog: Catalog): Check {
  const check = "period resolves inside the data bounds";
  const period = plan.filters?.period;
  if (!period?.start || !period?.end) {
    // Balances, lookups and the reconciliation checks read the whole ledger.
    return { check, ok: true };
  }
  const { min_date: min, max_date: max } = catalog.data_bounds;
  // ISO dates compare correctly as strings. A period is accepted when it
  // overlaps the data at all; one that lies wholly outside it cannot be answered.
  if (period.start > max || period.end < min) {
    return { check, ok: false, reason: `the data covers ${min} to ${max}, not ${period.start} to ${period.end}` };
  }
  if (period.start > period.end) {
    return { check, ok: false, reason: "the period starts after it ends" };
  }
  return { check, ok: true };
}

function counterpartyCheck(plan: QueryPlan, catalog: Catalog): Check {
  const check = "counterparty names exist in the catalog";
  const wanted = plan.filters?.counterparty?.canonical;
  if (!wanted) return { check, ok: true };

  const needle = wanted.trim().toUpperCase();
  const known = catalog.counterparties.some(
    (c) => c.canonical.toUpperCase() === needle
      || c.family.toUpperCase() === needle
      || c.canonical.toUpperCase().startsWith(needle)
      || c.canonical.toUpperCase().includes(needle),
  );
  return known ? { check, ok: true }
               : { check, ok: false, reason: `no counterparty in this ledger matches ${wanted}` };
}

function scopeCheck(plan: QueryPlan, catalog: Catalog): Check {
  const check = "entity and account ids are known";
  const entity = plan.filters?.entity_id;
  if (entity && !catalog.entities.includes(entity)) {
    return { check, ok: false, reason: `${entity} is not an entity in this ledger` };
  }
  const wanted: string[] = plan.filters?.account_ids ?? [];
  if (wanted.length) {
    const known = new Set((catalog.accounts ?? []).map((a) => a.account_id));
    // An empty account list in the catalog means the check cannot be made, so
    // it is not treated as a failure.
    const missing = known.size ? wanted.filter((id) => !known.has(id)) : [];
    if (missing.length) {
      return { check, ok: false, reason: `unknown account ${missing[0]}` };
    }
  }
  return { check, ok: true };
}

function sensitiveCheck(plan: QueryPlan): Check {
  const check = "no sensitive column is requested";
  // The contract has no field for choosing columns, so this only catches a plan
  // that smuggles a raw column name in as a value.
  const serialised = JSON.stringify(plan);
  const found = SENSITIVE.find((column) => serialised.includes(`"${column}"`));
  return found ? { check, ok: false, reason: `${found} is never returned` } : { check, ok: true };
}

/** Every verification check for one plan, in the order the theatre shows them. */
export function verifyPlan(plan: QueryPlan, catalog: Catalog): Check[] {
  return [intentCheck(plan), periodCheck(plan, catalog),
          counterpartyCheck(plan, catalog), scopeCheck(plan, catalog),
          sensitiveCheck(plan)];
}

/** The question to ask when a check fails, so a bad plan never reaches the data. */
export function clarificationFor(failed: Check[], catalog: Catalog): Clarification {
  const reason = failed[0]?.reason ?? failed[0]?.check ?? "the plan did not check out";
  return {
    question: `I could not run that as asked: ${reason}. What would you like instead?`,
    options: [
      { label: `The latest month, ending ${catalog.data_bounds.max_date}` },
      { label: `The latest quarter, ending ${catalog.data_bounds.max_date}` },
    ],
  };
}
