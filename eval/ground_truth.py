"""Independent ground truth for the evaluation set.

Computed with pandas straight from the delivered files. It never calls the
query service and never shares its code, so an answer and its expected value
are worked out twice by two different routes.

Usage: python eval/ground_truth.py --data services/query/data/test_100k
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from app.resolver import resolve

ROOT = Path(__file__).resolve().parents[1]
TRANSFER = {"NEFT", "IMPS", "UPI", "RTGS", "FT"}
UNKNOWN = "UNKNOWN"


def load(data: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The transaction and account tables, enriched exactly as the loader enriches them."""
    transactions = pd.read_csv(
        data / "transaction.csv", parse_dates=["transaction_date"],
        dtype={"transaction_reference_id": "string", "utr_number": "string"})
    accounts = pd.read_csv(data / "account.csv", dtype={"account_number": "string"})

    decoded = transactions.description.fillna("").map(resolve)
    transactions["channel"] = [d.channel for d in decoded]
    transactions["counterparty"] = [d.counterparty_canonical or UNKNOWN for d in decoded]
    transactions["family"] = [d.counterparty_family or UNKNOWN for d in decoded]
    return transactions.merge(accounts[["account_id", "entity_id"]], on="account_id", how="left"), accounts


def window(transactions: pd.DataFrame, period: dict | None) -> pd.DataFrame:
    """Rows inside a period, with the end date counting the whole day."""
    if not period:
        return transactions
    start = pd.Timestamp(period["start"])
    end = pd.Timestamp(period["end"]) + pd.Timedelta(hours=23, minutes=59, seconds=59, microseconds=999999)
    return transactions[(transactions.transaction_date >= start) & (transactions.transaction_date <= end)]


def _scope(rows: pd.DataFrame, spec: dict) -> pd.DataFrame:
    if spec.get("entity_id"):
        rows = rows[rows.entity_id == spec["entity_id"]]
    if spec.get("channels"):
        rows = rows[rows.channel.isin(spec["channels"])]
    if spec.get("transfers_only"):
        rows = rows[rows.channel.isin(TRANSFER)]
    if spec.get("exclude_charges"):
        rows = rows[rows.channel != "Charges"]
    return rows


def compute(spec: dict, transactions: pd.DataFrame, accounts: pd.DataFrame) -> float:
    """The expected value for one test item, from its truth specification."""
    operation = spec["op"]

    if operation == "balance_total":
        rows = accounts if not spec.get("entity_id") else accounts[accounts.entity_id == spec["entity_id"]]
        return round(float(rows.available_balance.sum()), 2)

    if operation == "balance_gap_total":
        net = transactions.assign(
            signed=transactions.transaction_amount.where(
                transactions.transaction_type == "credit", -transactions.transaction_amount)
        ).groupby("account_id").signed.sum()
        indexed = accounts.set_index("account_id")
        if spec.get("entity_id"):
            indexed = indexed[indexed.entity_id == spec["entity_id"]]
        gaps = (indexed.available_balance - net.reindex(indexed.index).fillna(0)).round(2)
        return round(float(gaps.abs().sum()), 2)

    if operation == "unreferenced_count":
        rows = _scope(window(transactions, spec.get("period")), spec)
        return float((rows.transaction_reference_id.isna() & rows.utr_number.isna()).sum())

    if operation == "unmatched_transfers_count":
        return float(len(unmatched_transfers(transactions, spec)))

    if operation == "lookup_sum":
        column = "transaction_reference_id" if spec["column"] == "reference_id" else "utr_number"
        rows = transactions[transactions[column] == spec["value"]]
        return round(float(rows.transaction_amount.sum()), 2)

    rows = _scope(window(transactions, spec.get("period")), spec)

    if operation == "receipts":
        return round(float(rows[rows.transaction_type == "credit"].transaction_amount.sum()), 2)

    if operation == "spend":
        debits = rows[rows.transaction_type == "debit"].transaction_amount.sum()
        if spec.get("net"):
            debits -= rows[rows.transaction_type == "credit"].transaction_amount.sum()
        return round(float(debits), 2)

    if operation == "counterparty_spend":
        debits = rows[rows.transaction_type == "debit"]
        column = "family" if spec.get("match") == "family" else "counterparty"
        key = " ".join(spec["counterparty"].upper().split()[:2]) if spec.get("match") == "family" \
            else spec["counterparty"].upper()
        return round(float(debits[debits[column] == key].transaction_amount.sum()), 2)

    if operation == "counterparty_top_sum":
        debits = rows[rows.transaction_type == "debit"]
        totals = debits.groupby("counterparty").transaction_amount.sum().round(2).sort_values(ascending=False)
        return round(float(totals.head(spec.get("limit", 5)).sum()), 2)

    raise ValueError(f"unknown truth operation: {operation}")


def unmatched_transfers(transactions: pd.DataFrame, spec: dict) -> pd.DataFrame:
    """Transfer debits with no answering credit elsewhere in the same entity within a day."""
    debits = _scope(window(transactions, spec.get("period")), {**spec, "transfers_only": True})
    debits = debits[debits.transaction_type == "debit"]
    credits = transactions[transactions.transaction_type == "credit"]

    paired = debits.merge(credits, on=["entity_id", "transaction_amount"], suffixes=("", "_c"))
    paired = paired[(paired.account_id != paired.account_id_c)
                    & ((paired.transaction_date - paired.transaction_date_c).abs() <= pd.Timedelta(days=1))]
    return debits[~debits.transaction_id.isin(set(paired.transaction_id))]


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute expected values for the evaluation set.")
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--test-set", type=Path, default=ROOT / "eval" / "test_set.json")
    parser.add_argument("--out", type=Path, default=ROOT / "eval" / "expected.json")
    args = parser.parse_args()

    transactions, accounts = load(args.data)
    test_set = json.loads(args.test_set.read_text())

    expected = {}
    for item in test_set:
        if item.get("truth"):
            expected[item["id"]] = compute(item["truth"], transactions, accounts)
        else:
            expected[item["id"]] = {"behaviour": item.get("expected_behaviour")}
    args.out.write_text(json.dumps(expected, indent=2) + "\n")
    print(f"wrote {len(expected)} expected values to {args.out}")


if __name__ == "__main__":
    main()
