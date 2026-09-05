/**
 * What the model is allowed to know about the schema, and the vocabulary map.
 *
 * Finance teams do not speak in column names. This maps the words they do use
 * onto the concepts the query service understands, so the model never has to
 * invent a mapping of its own.
 */

export type Concept = "counterparty" | "debit_transfer" | "credit" | "spend" | "reference_id" | "utr";

const SYNONYMS: Record<Concept, string[]> = {
  counterparty: ["vendor", "vendors", "supplier", "suppliers", "party", "parties", "payee", "payees",
    "beneficiary", "beneficiaries", "counterparty", "counterparties"],
  debit_transfer: ["payout", "payouts", "payment", "payments", "transfer", "transfers", "sent", "paid to"],
  credit: ["receipts", "receipt", "inflow", "inflows", "collections", "collection", "received", "credits"],
  spend: ["spend", "spent", "spending", "paid out", "outflow", "outgoings"],
  reference_id: ["ref no", "ref number", "reference", "reference number", "receipt number", "ref"],
  utr: ["utr", "utr number", "unique transaction reference"],
};

/** The schema concept a word refers to, or null when it is not finance vocabulary. */
export function resolveSynonym(word: string): Concept | null {
  const needle = word.trim().toLowerCase();
  if (!needle) return null;
  // utr before reference: a bare reference means the plaintext column, UTR is asked for by name.
  const order: Concept[] = ["utr", "counterparty", "debit_transfer", "credit", "spend", "reference_id"];
  for (const concept of order) {
    if (SYNONYMS[concept].includes(needle)) return concept;
  }
  return null;
}

export const SCHEMA_GUIDE = `You turn a finance question into a JSON QueryPlan. You never compute a number
and you never write SQL.

Tables: bank(bank_code, bank_name); account(account_id, entity_id, program_id, available_balance,
bank_code); transaction(transaction_id, account_id, transaction_date, transaction_type debit|credit,
description, transaction_amount, transaction_reference_id, utr_number).
There is no category column and no vendor table. A counterparty is decoded from the description.

intent must be one of these, and each answers exactly one kind of question:
  spend_total               money out over a period, as one number
  spend_by_channel          money out over a period, split by channel
  spend_by_counterparty     money out over a period for a counterparty, or the largest payments made
  counterparty_ranking      the counterparties that received the most over a period
  receipts_total            money in over a period
  balance                   available balance, per account or across the entity; also how many
                            accounts there are and which banks hold them (group_by account)
  reconciliation_balance    accounts whose available balance does not match their transactions
  reconciliation_transfers  internal transfers with no matching pair
  unreferenced              transactions carrying neither a reference number nor a UTR
  lookup_reference          a single transaction found by its reference number or UTR
  period_compare            one period measured against another
metric: sum_amount | count | avg_amount | balance. group_by: none | channel | counterparty | account | month.
Use metric=count when the question asks how many rows rather than how much money.
channels: NEFT, IMPS, UPI, RTGS, FT, Charges, Cheque, Disbursement, Other.
interpretation defaults: spend=debits, charges=include, scope=entity.

Vocabulary: vendor, supplier, party, payee and beneficiary all mean counterparty. Payout, payment,
transfer and sent mean a debit on a transfer channel. Receipts, inflow, collections and received mean
credit. Spend and paid out mean debits. Reference and ref no mean transaction_reference_id; only the
word UTR means utr_number.

Periods resolve against the latest transaction date in the data, never against today.
A question about an unusual, unexpected or larger than normal amount is still one of the intents
above. The anomaly scan runs on its own, so plan the plain question and let it report the spike.

Prefer a plan. Refuse only when the answer is not in these tables at all, for example anything
needing a category, a budget or a vendor master: {"refusal": {"reason": "...", "can_do": [...]}}.
Ask a clarifying question only when two readings would give materially different numbers and
nothing in the question chooses between them, for example a counterparty name that matches
several: {"clarification": {"question": "...", "options": [{"label": "..."}]}}. Do not ask which
grouping or which wording was meant; choose the more useful one and set group_by.
Otherwise return only the QueryPlan JSON.`;
