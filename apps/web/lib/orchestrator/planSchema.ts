/**
 * The query plan contract, inlined.
 *
 * PLAN_CONTRACT is a copy of contracts/query_plan.schema.json. It is inlined so
 * the /api/ask path performs no filesystem read at runtime, which a serverless
 * deployment cannot be relied on to allow. When the contract changes, this file
 * changes with it in the same commit.
 *
 * STRICT_PLAN_REQUEST is a second, flattened view of the same contract, sent to
 * providers that implement OpenAI structured outputs. Those reject a root-level
 * oneOf and require every property to appear in "required", so clarification and
 * refusal become nullable siblings of the computable fields instead of separate
 * branches. normalisePlan() turns a flattened answer back into a document the
 * contract accepts.
 */

const INTENTS = [
  "spend_total",
  "spend_by_channel",
  "spend_by_counterparty",
  "counterparty_ranking",
  "receipts_total",
  "balance",
  "reconciliation_balance",
  "reconciliation_transfers",
  "unreferenced",
  "lookup_reference",
  "period_compare",
] as const;

const CHANNELS = [
  "NEFT", "IMPS", "UPI", "RTGS", "FT", "Charges", "Cheque", "Disbursement", "Other",
] as const;

export const SUPPORTED_INTENTS: readonly string[] = INTENTS;

export const PLAN_CONTRACT: Record<string, unknown> = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://veritas.local/contracts/query_plan.schema.json",
  title: "QueryPlan",
  description:
    "The structured plan produced by the language model. A plan is one of: a computable query, a clarification request, or a refusal.",
  oneOf: [
    { $ref: "#/$defs/computable_plan" },
    { $ref: "#/$defs/clarification_plan" },
    { $ref: "#/$defs/refusal_plan" },
  ],
  $defs: {
    computable_plan: {
      type: "object",
      additionalProperties: false,
      required: ["intent", "metric", "filters", "group_by"],
      properties: {
        intent: { type: "string", enum: [...INTENTS] },
        metric: { type: "string", enum: ["sum_amount", "count", "avg_amount", "balance"] },
        filters: { $ref: "#/$defs/filters" },
        group_by: { type: "string", enum: ["none", "channel", "counterparty", "account", "month"] },
        sort: { type: "string", enum: ["desc", "asc"] },
        limit: { type: "integer", minimum: 1, maximum: 1000 },
        interpretation: { $ref: "#/$defs/interpretation" },
        run_alternatives: { type: "boolean" },
        run_anomaly: { type: "boolean" },
        conversation_id: { type: "string" },
        turn: { type: "integer", minimum: 0 },
      },
    },
    clarification_plan: {
      type: "object",
      additionalProperties: false,
      required: ["clarification"],
      properties: {
        clarification: { $ref: "#/$defs/clarification" },
        conversation_id: { type: "string" },
        turn: { type: "integer", minimum: 0 },
      },
    },
    refusal_plan: {
      type: "object",
      additionalProperties: false,
      required: ["refusal"],
      properties: {
        refusal: { $ref: "#/$defs/refusal" },
        conversation_id: { type: "string" },
        turn: { type: "integer", minimum: 0 },
      },
    },
    filters: {
      type: "object",
      additionalProperties: false,
      required: ["transaction_type", "period"],
      properties: {
        entity_id: { type: ["string", "null"] },
        account_ids: {
          anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
        },
        transaction_type: { type: "string", enum: ["debit", "credit", "both"] },
        channels: {
          anyOf: [
            { type: "array", items: { type: "string", enum: [...CHANNELS] } },
            { type: "null" },
          ],
        },
        counterparty: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["canonical", "match"],
              properties: {
                canonical: { type: "string" },
                match: { type: "string", enum: ["exact", "family"] },
              },
            },
            { type: "null" },
          ],
        },
        reference: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["value", "column"],
              properties: {
                value: { type: "string" },
                column: { type: "string", enum: ["reference_id", "utr"] },
              },
            },
            { type: "null" },
          ],
        },
        period: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["kind", "start", "end", "label"],
              properties: {
                kind: { type: "string", enum: ["calendar", "trailing"] },
                start: { type: "string", format: "date" },
                end: { type: "string", format: "date" },
                label: { type: "string" },
              },
            },
            { type: "null" },
          ],
        },
      },
    },
    interpretation: {
      type: "object",
      additionalProperties: false,
      properties: {
        spend: { type: "string", enum: ["debits", "net"] },
        charges: { type: "string", enum: ["include", "exclude"] },
        scope: { type: "string", enum: ["entity", "account"] },
      },
    },
    clarification: {
      type: "object",
      additionalProperties: false,
      required: ["question", "options"],
      properties: {
        question: { type: "string" },
        options: {
          type: "array",
          minItems: 2,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label"],
            properties: {
              label: { type: "string" },
              plan_patch: { type: ["object", "null"] },
            },
          },
        },
      },
    },
    refusal: {
      type: "object",
      additionalProperties: false,
      required: ["reason", "can_do"],
      properties: {
        reason: { type: "string" },
        can_do: { type: "array", items: { type: "string" } },
      },
    },
  },
};

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

/**
 * The same plan as one flat object, with every property required and every
 * optional property nullable, which is what strict structured outputs demand.
 */
export const STRICT_PLAN_REQUEST: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent", "metric", "filters", "group_by", "sort", "limit",
    "interpretation", "run_alternatives", "run_anomaly", "clarification", "refusal",
  ],
  properties: {
    intent: nullable({ type: "string", enum: [...INTENTS] }),
    metric: nullable({ type: "string", enum: ["sum_amount", "count", "avg_amount", "balance"] }),
    group_by: nullable({ type: "string", enum: ["none", "channel", "counterparty", "account", "month"] }),
    sort: nullable({ type: "string", enum: ["desc", "asc"] }),
    limit: nullable({ type: "integer" }),
    run_alternatives: nullable({ type: "boolean" }),
    run_anomaly: nullable({ type: "boolean" }),
    filters: nullable({
      type: "object",
      additionalProperties: false,
      required: ["entity_id", "account_ids", "transaction_type", "channels",
                 "counterparty", "reference", "period"],
      properties: {
        entity_id: nullable({ type: "string" }),
        account_ids: nullable({ type: "array", items: { type: "string" } }),
        transaction_type: { type: "string", enum: ["debit", "credit", "both"] },
        channels: nullable({ type: "array", items: { type: "string", enum: [...CHANNELS] } }),
        counterparty: nullable({
          type: "object",
          additionalProperties: false,
          required: ["canonical", "match"],
          properties: {
            canonical: { type: "string" },
            match: { type: "string", enum: ["exact", "family"] },
          },
        }),
        reference: nullable({
          type: "object",
          additionalProperties: false,
          required: ["value", "column"],
          properties: {
            value: { type: "string" },
            column: { type: "string", enum: ["reference_id", "utr"] },
          },
        }),
        period: nullable({
          type: "object",
          additionalProperties: false,
          required: ["kind", "start", "end", "label"],
          properties: {
            kind: { type: "string", enum: ["calendar", "trailing"] },
            start: { type: "string", description: "ISO date, YYYY-MM-DD" },
            end: { type: "string", description: "ISO date, YYYY-MM-DD" },
            label: { type: "string" },
          },
        }),
      },
    }),
    interpretation: nullable({
      type: "object",
      additionalProperties: false,
      required: ["spend", "charges", "scope"],
      properties: {
        spend: nullable({ type: "string", enum: ["debits", "net"] }),
        charges: nullable({ type: "string", enum: ["include", "exclude"] }),
        scope: nullable({ type: "string", enum: ["entity", "account"] }),
      },
    }),
    clarification: nullable({
      type: "object",
      additionalProperties: false,
      required: ["question", "options"],
      properties: {
        question: { type: "string" },
        options: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "plan_patch"],
            properties: {
              label: { type: "string" },
              plan_patch: nullable({ type: "object", additionalProperties: true, properties: {} }),
            },
          },
        },
      },
    }),
    refusal: nullable({
      type: "object",
      additionalProperties: false,
      required: ["reason", "can_do"],
      properties: {
        reason: { type: "string" },
        can_do: { type: "array", items: { type: "string" } },
      },
    }),
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withoutNulls(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || entry === undefined) continue;
    out[key] = isPlainObject(entry) ? withoutNulls(entry) : entry;
  }
  return out;
}

/**
 * Turn a flattened answer back into one of the three documents the contract
 * allows. A refusal or a clarification wins over the computable fields, and
 * nulls the model filled in for absent optional fields are dropped.
 */
export function normalisePlan(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;

  if (isPlainObject(raw.refusal)) return { refusal: withoutNulls(raw.refusal) };
  if (isPlainObject(raw.clarification)) return { clarification: withoutNulls(raw.clarification) };

  const { clarification, refusal, ...rest } = raw;
  const plan = withoutNulls(rest);

  // The contract keeps the nullable filter fields, so restore the ones the
  // contract expects to be present even when empty.
  if (isPlainObject(rest.filters)) {
    const filters = plan.filters as Record<string, unknown> | undefined;
    if (filters && !("period" in filters)) filters.period = null;
  }
  return plan;
}
