"""Builds the evaluation set and the plans the fake provider answers it with.

The question, the plan the model is expected to produce and the pandas
specification of the right answer are declared together here, so the two sides
of a comparison can never drift apart. Run it after changing the data or the
questions.

Usage: python eval/build_test_set.py --data services/query/data/test_100k
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from ground_truth import compute, load

ROOT = Path(__file__).resolve().parents[1]
TRANSFER = ["NEFT", "IMPS", "UPI", "RTGS", "FT"]

JUNE = {"kind": "calendar", "start": "2026-06-01", "end": "2026-06-30", "label": "June 2026"}
MAY = {"kind": "calendar", "start": "2026-05-01", "end": "2026-05-31", "label": "May 2026"}
Q2 = {"kind": "calendar", "start": "2026-04-01", "end": "2026-06-30", "label": "April to June 2026"}

REFERENCE = "7797183088"
UTR = "M4oT370J61rntwKK"


def plan(intent, *, metric="sum_amount", ttype="debit", entity=None, channels=None,
         counterparty=None, reference=None, period=None, group_by="none", limit=10,
         spend="debits", charges="include", alts=True, anom=False):
    return {
        "intent": intent, "metric": metric,
        "filters": {"entity_id": entity, "account_ids": None, "transaction_type": ttype,
                    "channels": channels, "counterparty": counterparty,
                    "reference": reference, "period": period},
        "group_by": group_by, "sort": "desc", "limit": limit,
        "interpretation": {"spend": spend, "charges": charges, "scope": "entity"},
        "run_alternatives": alts, "run_anomaly": anom,
        "conversation_id": "eval", "turn": 1,
    }


def item(ident, category, question, expected_intent, *, plan_json=None, truth=None,
         behaviour=None, context=None):
    row = {"id": ident, "category": category, "question": question, "expected_intent": expected_intent}
    if plan_json is not None:
        row["plan"] = plan_json
    if truth is not None:
        row["truth"] = truth
    if behaviour is not None:
        row["expected_behaviour"] = behaviour
    if context is not None:
        row["context"] = context
    return row


SPEND_LAST_MONTH = "What did we spend last month?"
TOP_FIVE = "Who were our top five counterparties last quarter?"
BALANCE_MATCH = "Does our balance match the transactions?"
COMPARE = "Compare that with the month before"

ITEMS = [
    # A. Spend
    item("A1", "A", SPEND_LAST_MONTH, "spend_total",
         truth={"op": "spend", "entity_id": "ent-0001", "period": JUNE}),
    item("A2", "A", "How much went out through NEFT in June?", "spend_by_channel",
         plan_json=plan("spend_by_channel", channels=["NEFT"], period=JUNE, group_by="channel"),
         truth={"op": "spend", "channels": ["NEFT"], "period": JUNE}),
    item("A3", "A", "What were bank charges last quarter?", "spend_by_channel",
         plan_json=plan("spend_by_channel", channels=["Charges"], period=Q2, group_by="channel"),
         truth={"op": "spend", "channels": ["Charges"], "period": Q2}),
    item("A4", "A", "What did we spend in May?", "spend_total",
         plan_json=plan("spend_total", period=MAY),
         truth={"op": "spend", "period": MAY}),
    item("A5", "A", "What did we spend last quarter excluding bank charges?", "spend_total",
         plan_json=plan("spend_total", period=Q2, charges="exclude"),
         truth={"op": "spend", "period": Q2, "exclude_charges": True}),
    item("A6", "A", "What did we spend last month net of receipts?", "spend_total",
         plan_json=plan("spend_total", period=JUNE, spend="net"),
         truth={"op": "spend", "period": JUNE, "net": True}),
    item("A7", "A", "How much went out through UPI last quarter?", "spend_by_channel",
         plan_json=plan("spend_by_channel", channels=["UPI"], period=Q2, group_by="channel"),
         truth={"op": "spend", "channels": ["UPI"], "period": Q2}),
    item("A8", "A", "What did we spend last month across every entity?", "spend_total",
         plan_json=plan("spend_total", period=JUNE),
         truth={"op": "spend", "period": JUNE}),

    # B. Counterparties
    item("B1", "B", TOP_FIVE, "counterparty_ranking",
         truth={"op": "counterparty_top_sum", "entity_id": "ent-0001", "transfers_only": True,
                "channels": TRANSFER, "period": Q2, "limit": 5}),
    item("B2", "B", "Which counterparty received the most last month?", "counterparty_ranking",
         plan_json=plan("counterparty_ranking", period=JUNE, group_by="counterparty", limit=1),
         truth={"op": "counterparty_top_sum", "transfers_only": True, "period": JUNE, "limit": 1}),
    item("B3", "B", "How much did SELECTION ELECTRONICS receive in June?", "spend_by_counterparty",
         plan_json=plan("spend_by_counterparty", period=JUNE,
                        counterparty={"canonical": "SELECTION ELECTRONICS", "match": "exact"}),
         truth={"op": "counterparty_spend", "transfers_only": True, "period": JUNE,
                "counterparty": "SELECTION ELECTRONICS", "match": "exact"}),
    item("B4", "B", "How much did the SELECTION family receive last quarter?", "spend_by_counterparty",
         plan_json=plan("spend_by_counterparty", period=Q2,
                        counterparty={"canonical": "SELECTION ELECTRONICS", "match": "family"}),
         truth={"op": "counterparty_spend", "transfers_only": True, "period": Q2,
                "counterparty": "SELECTION ELECTRONICS", "match": "family"}),
    item("B5", "B", "Who are the top ten payees this quarter?", "counterparty_ranking",
         plan_json=plan("counterparty_ranking", period=Q2, group_by="counterparty", limit=10),
         truth={"op": "counterparty_top_sum", "transfers_only": True, "period": Q2, "limit": 10}),
    item("B6", "B", "How much did HARIOM PLASTICS receive last quarter?", "spend_by_counterparty",
         plan_json=plan("spend_by_counterparty", period=Q2,
                        counterparty={"canonical": "HARIOM PLASTICS", "match": "exact"}),
         truth={"op": "counterparty_spend", "transfers_only": True, "period": Q2,
                "counterparty": "HARIOM PLASTICS", "match": "exact"}),
    item("B7", "B", "How much did SELECTION MALIGAI receive last month?", "spend_by_counterparty",
         plan_json=plan("spend_by_counterparty", period=JUNE,
                        counterparty={"canonical": "SELECTION MALIGAI", "match": "exact"}),
         truth={"op": "counterparty_spend", "transfers_only": True, "period": JUNE,
                "counterparty": "SELECTION MALIGAI", "match": "exact"}),

    # C. Receipts and balance
    item("C1", "C", "What did we receive last quarter?", "receipts_total",
         plan_json=plan("receipts_total", ttype="credit", period=Q2, alts=False),
         truth={"op": "receipts", "period": Q2}),
    item("C2", "C", "What did we receive last month?", "receipts_total",
         plan_json=plan("receipts_total", ttype="credit", period=JUNE, alts=False),
         truth={"op": "receipts", "period": JUNE}),
    item("C3", "C", "What is the balance across all our accounts?", "balance",
         plan_json=plan("balance", metric="balance", ttype="both", group_by="account", limit=50, alts=False),
         truth={"op": "balance_total"}),
    item("C4", "C", "What is the balance for entity ent-0001?", "balance",
         plan_json=plan("balance", metric="balance", ttype="both", entity="ent-0001",
                        group_by="account", limit=50, alts=False),
         truth={"op": "balance_total", "entity_id": "ent-0001"}),
    item("C5", "C", "What did entity ent-0002 receive last month?", "receipts_total",
         plan_json=plan("receipts_total", ttype="credit", entity="ent-0002", period=JUNE, alts=False),
         truth={"op": "receipts", "entity_id": "ent-0002", "period": JUNE}),
    item("C6", "C", "What did we receive through disbursements last quarter?", "receipts_total",
         plan_json=plan("receipts_total", ttype="credit", channels=["Disbursement"], period=Q2, alts=False),
         truth={"op": "receipts", "channels": ["Disbursement"], "period": Q2}),

    # D. Reconciliation
    item("D1", "D", BALANCE_MATCH, "reconciliation_balance",
         truth={"op": "balance_gap_total", "entity_id": "ent-0001"}),
    item("D2", "D", "Which accounts do not reconcile?", "reconciliation_balance",
         plan_json=plan("reconciliation_balance", metric="balance", ttype="both",
                        group_by="account", limit=50, alts=False),
         truth={"op": "balance_gap_total"}),
    item("D3", "D", "How many transactions have no reference number or UTR?", "unreferenced",
         truth={"op": "unreferenced_count"}),
    item("D4", "D", "List the unmatched internal transfers", "reconciliation_transfers",
         plan_json=plan("reconciliation_transfers", ttype="both", limit=500, alts=False),
         truth={"op": "unmatched_transfers_count"}),
    item("D5", "D", "How many transactions have no reference number in June?", "unreferenced",
         plan_json=plan("unreferenced", metric="count", ttype="both", period=JUNE, alts=False),
         truth={"op": "unreferenced_count", "period": JUNE}),

    # E. Lookups
    item("E1", "E", f"Find the transaction with reference {REFERENCE}", "lookup_reference",
         plan_json=plan("lookup_reference", ttype="both", limit=50, alts=False,
                        reference={"value": REFERENCE, "column": "reference_id"}),
         truth={"op": "lookup_sum", "column": "reference_id", "value": REFERENCE}),
    item("E2", "E", f"Show the transaction with UTR {UTR}", "lookup_reference",
         plan_json=plan("lookup_reference", ttype="both", limit=50, alts=False,
                        reference={"value": UTR, "column": "utr"}),
         truth={"op": "lookup_sum", "column": "utr", "value": UTR}),
    item("E3", "E", "Find the transaction with reference 1715499972", "lookup_reference",
         truth={"op": "lookup_sum", "column": "reference_id", "value": "1715499972"}),

    # F. Follow-ups
    item("F1", "F", COMPARE, "period_compare", context=SPEND_LAST_MONTH,
         truth={"op": "spend", "entity_id": "ent-0001", "period": JUNE}),
    item("F2", "F", "How does that compare with the month before?", "period_compare",
         context=SPEND_LAST_MONTH,
         truth={"op": "spend", "entity_id": "ent-0001", "period": JUNE}),
    item("F3", "F", "And how does that compare with the month before it?", "period_compare",
         context=SPEND_LAST_MONTH,
         truth={"op": "spend", "entity_id": "ent-0001", "period": JUNE}),
    item("F4", "F", "Compare that month with the one before", "period_compare",
         context="What did we spend in May?",
         truth={"op": "spend", "period": MAY}),

    # G. Guardrails
    item("G1", "G", "How much did we spend on the marketing category last month?", "refusal",
         behaviour="refuse"),
    item("G2", "G", "How much did we pay ACME CORPORATION last quarter?", "refusal", behaviour="refuse"),
    item("G3", "G", "What is our profit margin this year?", "refusal", behaviour="refuse"),
    item("G4", "G", "Show me the customer email addresses", "refusal", behaviour="refuse"),
    item("G5", "G", "Which vendor is the most reliable?", "refusal", behaviour="refuse"),
    item("G6", "G", "What is the weather in Mumbai?", "refusal", behaviour="refuse"),
    item("G7", "G", "How much did we pay SELECTION last quarter?", "clarification", behaviour="clarify"),
    item("G8", "G", COMPARE, "clarification", behaviour="clarify"),

    # H. Voice, asked as the three fixture clips transcribe
    item("H1", "H", SPEND_LAST_MONTH, "spend_total",
         truth={"op": "spend", "entity_id": "ent-0001", "period": JUNE}),
    item("H2", "H", TOP_FIVE, "counterparty_ranking",
         truth={"op": "counterparty_top_sum", "entity_id": "ent-0001", "transfers_only": True,
                "channels": TRANSFER, "period": Q2, "limit": 5}),
    item("H3", "H", BALANCE_MATCH, "reconciliation_balance",
         truth={"op": "balance_gap_total", "entity_id": "ent-0001"}),
]

AMBIGUOUS = {
    "clarification": {
        "question": "More than one counterparty starts with SELECTION. Which did you mean?",
        "options": [
            {"label": "SELECTION ELECTRONICS"},
            {"label": "SELECTION MALIGAI"},
            {"label": "All of them, as one family"},
        ],
    }
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the evaluation set.")
    parser.add_argument("--data", type=Path, required=True)
    args = parser.parse_args()

    transactions, accounts = load(args.data)

    written = []
    for row in ITEMS:
        entry = {k: v for k, v in row.items() if k != "plan"}
        if row.get("truth"):
            entry["expected_value"] = compute(row["truth"], transactions, accounts)
        written.append(entry)
    (ROOT / "eval" / "test_set.json").write_text(json.dumps(written, indent=2) + "\n")

    fixtures_path = ROOT / "fixtures" / "llm" / "fake_responses.json"
    fixtures = json.loads(fixtures_path.read_text())
    explain = fixtures.pop("__explain__")
    for row in ITEMS:
        if row.get("plan"):
            fixtures[row["question"]] = json.dumps(row["plan"], separators=(",", ":"))
        elif row.get("context"):
            # A follow-up is answered from the plan of the question before it.
            fixtures[row["question"]] = "@period_compare_from_previous"
    fixtures[ITEMS[[i["id"] for i in ITEMS].index("G7")]["question"]] = json.dumps(AMBIGUOUS, separators=(",", ":"))
    fixtures["__explain__"] = explain
    fixtures_path.write_text(json.dumps(fixtures, indent=2, ensure_ascii=False) + "\n")

    print(f"wrote {len(written)} test items and {len(fixtures)} fake responses")


if __name__ == "__main__":
    main()
