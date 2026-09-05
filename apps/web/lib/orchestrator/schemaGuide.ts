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

intent must be one of: spend_total, spend_by_channel, spend_by_counterparty, counterparty_ranking,
receipts_total, balance, reconciliation_balance, reconciliation_transfers, unreferenced,
lookup_reference, period_compare.
metric: sum_amount | count | avg_amount | balance. group_by: none | channel | counterparty | account | month.
channels: NEFT, IMPS, UPI, RTGS, FT, Charges, Cheque, Disbursement, Other.
interpretation defaults: spend=debits, charges=include, scope=entity.

Vocabulary: vendor, supplier, party, payee and beneficiary all mean counterparty. Payout, payment,
transfer and sent mean a debit on a transfer channel. Receipts, inflow, collections and received mean
credit. Spend and paid out mean debits. Reference and ref no mean transaction_reference_id; only the
word UTR means utr_number.

Periods resolve against the latest transaction date in the data, never against today.
If the question cannot be answered from these tables, return {"refusal": {"reason": "...", "can_do": [...]}}.
If it is genuinely ambiguous, return {"clarification": {"question": "...", "options": [{"label": "..."}]}}.
Otherwise return only the QueryPlan JSON.`;
