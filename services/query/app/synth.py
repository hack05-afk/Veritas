"""Synthetic ledger generator.

Writes bank.csv, account.csv and transaction.csv shaped exactly like the real
schema, plus planted.json recording the facts the tests check: the accounts
carrying a balance gap, the matched internal transfer pairs, the transfers left
unmatched, and the counterparty whose spend spikes in the latest month.

Rows are produced in two passes over the same seeded stream. The first pass
only accumulates totals, the second writes the file, so twenty million rows
cost no more memory than one hundred thousand.

Usage: python -m app.synth --rows 100000 --seed 42 --out services/query/data/test_100k
"""
from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterator

import numpy as np

BANKS = [
    ("HDFC", "HDFC Bank"),
    ("ICIC", "ICICI Bank"),
    ("SBIN", "State Bank of India"),
    ("UTIB", "Axis Bank"),
    ("KKBK", "Kotak Mahindra Bank"),
    ("YESB", "Yes Bank"),
    ("IDFB", "IDFC First Bank"),
    ("INDB", "IndusInd Bank"),
    ("BARB", "Bank of Baroda"),
    ("PUNB", "Punjab National Bank"),
]

# Forty counterparties. Six of them share the first word SELECTION, so exact
# and family matching give genuinely different answers.
NAMES = [
    "SELECTION ELECTRONICS", "SELECTION MOBILE", "SELECTION MALIGAI",
    "SELECTION TRADERS", "SELECTION HARDWARE", "SELECTION AGENCIES",
    "NAVYUG SELECTION", "UMANG SELECTIONHAPURBPES DPF10129",
    "RELIANCEDIGITAL RETAIL", "PARESH VIKRANT GHASE", "GAUTAM SINGH",
    "SELECTRICITY TWO", "ARIHANT ENTERPRISES", "BALAJI TRADING COMPANY",
    "CHETAK LOGISTICS", "DEEPAK PACKAGING", "EVEREST STATIONERS",
    "FORTUNE METALS", "GANESH TRANSPORT", "HARIOM PLASTICS",
    "INDUS CABLE WORKS", "JAYSHREE TEXTILES", "KAVERI FOODS",
    "LAXMI ENGINEERING", "MAHAVIR PAPER MILLS", "NANDINI DAIRY SUPPLIES",
    "OMKAR CHEMICALS", "PRAGATI PRINTERS", "QUALITY TOOLS",
    "RAJDHANI COURIERS", "SAGAR MARINE EXPORTS", "TIRUPATI GRANITES",
    "UNIQUE AUTO PARTS", "VARDHMAN THREADS", "WESTERN CARGO MOVERS",
    "YASHODA HEALTHCARE", "ZENITH INSTRUMENTS", "ANAND SHARMA",
    "MEENAKSHI RAO", "SURESH KUMAR PATEL",
]

LOCATIONS = [
    "DAHISAR EAST", "SELECT CITY SAKET DELHI", "ANDHERI WEST", "T NAGAR CHENNAI",
    "KORAMANGALA BENGALURU", "SALT LAKE KOLKATA", "HADAPSAR PUNE", "GOTA AHMEDABAD",
]

START = datetime(2025, 11, 1)
END = datetime(2026, 6, 30, 23, 59, 59)
SPAN_SECONDS = int((END - START).total_seconds())

TX_COLUMNS = ["transaction_id", "account_id", "transaction_date", "transaction_type",
              "description", "transaction_amount", "transaction_reference_id", "utr_number"]
ACCOUNT_COLUMNS = ["account_id", "entity_id", "account_number", "program_id",
                   "available_balance", "bank_code"]
BANK_COLUMNS = ["bank_code", "bank_name"]

# Category weights. The seven narration templates are in equal proportion; the
# charge, cheque and undecodable rows make up the rest.
TEMPLATE_COUNT = 7
TEMPLATE_SHARE = 0.92 / TEMPLATE_COUNT
CATEGORY_P = [TEMPLATE_SHARE] * TEMPLATE_COUNT + [0.035, 0.015, 0.03]
DISBURSEMENT, CHARGES, CHEQUE, OTHER = 6, 7, 8, 9
DEBIT_TARGET = 0.70
BLOCK = 200_000

PLANTED_PAIRS = 20
PLANTED_UNMATCHED = 5
GAPS = {1: 12500.00, 5: -4750.25, 8: 88000.00}
SPIKE_NAME = "NAVYUG SELECTION"
SPIKE_RATIO = 6.0
SPIKE_MONTH = "2026-06"
BASELINE_MONTHS = ("2026-03", "2026-04", "2026-05")
MIN_PAISE = 10_000


def _pool_debit_probability() -> float:
    """The debit rate for the rows whose direction is not fixed by their template."""
    fixed_debit = CATEGORY_P[CHARGES]
    fixed_credit = TEMPLATE_SHARE + CATEGORY_P[CHEQUE]
    pool = 1.0 - fixed_debit - fixed_credit
    return (DEBIT_TARGET - fixed_debit) / pool


def build_banks() -> list[dict[str, str]]:
    return [{"bank_code": code, "bank_name": name} for code, name in BANKS]


def build_accounts(seed: int) -> list[dict[str, object]]:
    """Twelve accounts, three for each of four entities."""
    rng = np.random.default_rng(seed + 2)
    return [{
        "account_id": f"acc-{i + 1:04d}",
        "entity_id": f"ent-{i // 3 + 1:04d}",
        "account_number": str(int(rng.integers(10 ** 10, 10 ** 15))),
        "program_id": "PRG-PAYOUT" if i % 3 else "PRG-COLLECT",
        "available_balance": 0.0,
        "bank_code": BANKS[i % len(BANKS)][0],
    } for i in range(12)]


def _ifsc(rng: np.random.Generator, bank_code: str) -> str:
    return f"{bank_code}0{int(rng.integers(0, 10 ** 6)):06d}"


def _code(rng: np.random.Generator, prefix: str) -> str:
    return f"{prefix}{int(rng.integers(10 ** 9, 10 ** 10))}"


def _utr(rng: np.random.Generator) -> str:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    return "".join(alphabet[i] for i in rng.integers(0, len(alphabet), size=16))


def _describe(rng: np.random.Generator, category: int, name: str, bank_code: str) -> str:
    """Render one narration in the template for this category."""
    ref8 = int(rng.integers(10 ** 7, 10 ** 8))
    ref12 = int(rng.integers(10 ** 11, 10 ** 12))
    acct15 = int(rng.integers(10 ** 14, 10 ** 15))
    if category == 0:
        return f"NEFT  - {_ifsc(rng, bank_code)} - {ref8} - {acct15} - {name}"
    if category == 1:
        return f"NEFT/{ref12:012d}/{bank_code}/{name}"
    if category == 2:
        return (f"IMPS/P2A/{ref12}/{bank_code}/{acct15}/00/INET/"
                f"{int(rng.integers(1000, 10000))}/{name.replace(' ', '')}/"
                f"{_code(rng, 'ZBFLCTP')}PBL/INWD48")
    if category == 3:
        acct11 = int(rng.integers(10 ** 10, 10 ** 11))
        return f"IMPS OW/{ref12}/{name.title()}/{bank_code}/{acct11}"
    if category == 4:
        return (f"UPI-{name}-XXXXXX{int(rng.integers(1000, 10000))}-"
                f"{_ifsc(rng, bank_code)}-{ref12}-{int(rng.integers(10 ** 14, 10 ** 15))}")
    if category == 5:
        acct14 = int(rng.integers(10 ** 13, 10 ** 14))
        return f"FT -  {ref8} -  {acct14} - {name}   {LOCATIONS[int(rng.integers(0, len(LOCATIONS)))]}"
    if category == DISBURSEMENT:
        ref = _code(rng, "RATNR")
        return f"R/{ref}/{_code(rng, 'ZBFLCTP')}PBL//{name} PRIVATE LIMITED/{ref} /{name} PRIVATE LIMITED"
    if category == CHARGES:
        return ("IMPS charges", "NEFT charges")[int(rng.integers(0, 2))]
    if category == CHEQUE:
        return "Cheque Deposits"
    return f"MISC ADJ {int(rng.integers(1000, 10000))}"


def base_rows(seed: int, accounts: list[dict], n_base: int) -> Iterator[dict]:
    """Yield the base transactions. Two calls with the same seed yield the same rows."""
    rng = np.random.default_rng(seed)
    p_debit = _pool_debit_probability()
    produced = 0
    while produced < n_base:
        size = min(BLOCK, n_base - produced)
        categories = rng.choice(len(CATEGORY_P), size=size, p=CATEGORY_P)
        name_idx = rng.integers(0, len(NAMES), size=size)
        account_idx = rng.integers(0, len(accounts), size=size)
        offsets = rng.integers(0, SPAN_SECONDS, size=size)
        raw = rng.lognormal(mean=10.4, sigma=1.35, size=size)
        amounts = np.clip(np.round(raw * 100), MIN_PAISE, 500_000_000).astype(np.int64)
        pool_debit = rng.random(size) < p_debit
        ref_null = rng.random(size) < 0.08
        utr_null = rng.random(size) < 0.40

        for i in range(size):
            category = int(categories[i])
            account = accounts[int(account_idx[i])]
            name = NAMES[int(name_idx[i])]
            if category in (DISBURSEMENT, CHEQUE):
                kind = "credit"
            elif category == CHARGES:
                kind = "debit"
            else:
                kind = "debit" if pool_debit[i] else "credit"
            date = START + timedelta(seconds=int(offsets[i]))
            yield {
                "transaction_id": f"txn-{produced + i + 1:09d}",
                "account_id": account["account_id"],
                "transaction_date": date.strftime("%Y-%m-%d %H:%M:%S"),
                "transaction_type": kind,
                "description": _describe(rng, category, name, str(account["bank_code"])),
                "transaction_amount": int(amounts[i]),
                "transaction_reference_id": None if ref_null[i] else str(int(rng.integers(10 ** 9, 10 ** 10))),
                "utr_number": None if utr_null[i] else _utr(rng),
                "name": name if category < CHARGES else None,
            }
        produced += size


def planted_rows(seed: int, accounts: list[dict], n_base: int) -> tuple[list[dict], dict]:
    """The matched transfer pairs and the unmatched transfers, plus what was planted."""
    rng = np.random.default_rng(seed + 1)
    by_entity: dict[str, list[dict]] = {}
    for account in accounts:
        by_entity.setdefault(str(account["entity_id"]), []).append(account)
    entities = sorted(by_entity)

    rows: list[dict] = []
    matched_pairs: list[list[str]] = []
    next_id = n_base + 1

    for p in range(PLANTED_PAIRS):
        payer, payee = by_entity[entities[p % len(entities)]][:2]
        amount = int(rng.integers(50_000_00, 900_000_00))
        date = START + timedelta(seconds=int(rng.integers(0, SPAN_SECONDS)))
        ref = str(int(rng.integers(10 ** 11, 10 ** 12)))
        debit_id, credit_id = f"txn-{next_id:09d}", f"txn-{next_id + 1:09d}"
        next_id += 2
        for txn_id, account, kind, when in (
            (debit_id, payer, "debit", date),
            (credit_id, payee, "credit", date + timedelta(hours=6)),
        ):
            rows.append({
                "transaction_id": txn_id,
                "account_id": account["account_id"],
                "transaction_date": when.strftime("%Y-%m-%d %H:%M:%S"),
                "transaction_type": kind,
                "description": f"NEFT/{ref}/{account['bank_code']}/SELECTION TRADERS",
                "transaction_amount": amount,
                "transaction_reference_id": ref,
                "utr_number": _utr(rng),
                "name": "SELECTION TRADERS",
            })
        matched_pairs.append([debit_id, credit_id])

    unmatched: list[str] = []
    for u in range(PLANTED_UNMATCHED):
        account = by_entity[entities[u % len(entities)]][2]
        date = START + timedelta(seconds=int(rng.integers(0, SPAN_SECONDS)))
        ref = str(int(rng.integers(10 ** 11, 10 ** 12)))
        txn_id = f"txn-{next_id:09d}"
        next_id += 1
        rows.append({
            "transaction_id": txn_id,
            "account_id": account["account_id"],
            "transaction_date": date.strftime("%Y-%m-%d %H:%M:%S"),
            "transaction_type": "debit",
            "description": f"NEFT/{ref}/{account['bank_code']}/FORTUNE METALS",
            "transaction_amount": 400_000_000 + u * 111_111,
            "transaction_reference_id": ref,
            "utr_number": _utr(rng),
            "name": "FORTUNE METALS",
        })
        unmatched.append(txn_id)

    return rows, {"matched_pairs": matched_pairs, "unmatched_transfers": unmatched,
                  "spike_counterparty": SPIKE_NAME, "gap_accounts": {}}


def _is_baseline_spike_row(row: dict) -> bool:
    return (row["name"] == SPIKE_NAME and row["transaction_type"] == "debit"
            and str(row["transaction_date"])[:7] in BASELINE_MONTHS)


def survey(seed: int, accounts: list[dict], n_base: int, planted: list[dict]) -> tuple[float, dict[str, int]]:
    """First pass: the spike scale factor and each account's net, without storing a row."""
    latest = 0
    baseline = 0
    net = {str(a["account_id"]): 0 for a in accounts}
    # The rows the spike rescales are a fraction of a percent of the ledger, so
    # holding them lets the net be corrected without a second pass over it all.
    to_rescale: list[tuple[str, int]] = []
    for row in base_rows(seed, accounts, n_base):
        amount = int(row["transaction_amount"])
        net[str(row["account_id"])] += amount if row["transaction_type"] == "credit" else -amount
        if row["name"] != SPIKE_NAME or row["transaction_type"] != "debit":
            continue
        month = str(row["transaction_date"])[:7]
        if month == SPIKE_MONTH:
            latest += amount
        elif month in BASELINE_MONTHS:
            baseline += amount
            to_rescale.append((str(row["account_id"]), amount))
    if not latest or not baseline:
        raise ValueError(f"{SPIKE_NAME} has no debits to build a spike from")

    # Scale the three months before the latest down, never the latest up, so no
    # amount can leave the generator's range.
    factor = min(1.0, (latest / SPIKE_RATIO * len(BASELINE_MONTHS)) / baseline)
    if factor < 1.0:
        for account_id, amount in to_rescale:
            net[account_id] += amount - max(MIN_PAISE, int(amount * factor))
    for row in planted:
        amount = int(row["transaction_amount"])
        net[str(row["account_id"])] += amount if row["transaction_type"] == "credit" else -amount
    return factor, net


def write(out: Path, rows: int, seed: int) -> dict:
    """Generate and write the three CSVs and planted.json. Returns the planted facts."""
    n_base = rows - PLANTED_PAIRS * 2 - PLANTED_UNMATCHED
    if n_base < 1:
        raise ValueError(f"--rows must be at least {PLANTED_PAIRS * 2 + PLANTED_UNMATCHED + 1}")

    out.mkdir(parents=True, exist_ok=True)
    accounts = build_accounts(seed)
    planted_transactions, planted = planted_rows(seed, accounts, n_base)
    factor, net = survey(seed, accounts, n_base, planted_transactions)

    for index, account in enumerate(accounts):
        gap = GAPS.get(index, 0.0)
        account["available_balance"] = round(net[str(account["account_id"])] / 100 + gap, 2)
        if gap:
            planted["gap_accounts"][str(account["account_id"])] = gap

    _write_csv(out / "bank.csv", BANK_COLUMNS, build_banks())
    _write_csv(out / "account.csv", ACCOUNT_COLUMNS, accounts)

    with (out / "transaction.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(TX_COLUMNS)
        for row in base_rows(seed, accounts, n_base):
            amount = int(row["transaction_amount"])
            if factor < 1.0 and _is_baseline_spike_row(row):
                amount = max(MIN_PAISE, int(amount * factor))
            writer.writerow(_csv_row(row, amount))
        for row in planted_transactions:
            writer.writerow(_csv_row(row, int(row["transaction_amount"])))

    (out / "planted.json").write_text(json.dumps(planted, indent=2) + "\n")
    return planted


def _csv_row(row: dict, amount_paise: int) -> list[str]:
    return [row["transaction_id"], row["account_id"], row["transaction_date"],
            row["transaction_type"], row["description"], f"{amount_paise / 100:.2f}",
            row["transaction_reference_id"] or "", row["utr_number"] or ""]


def _write_csv(path: Path, columns: list[str], records: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a synthetic ledger.")
    parser.add_argument("--rows", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    write(args.out, args.rows, args.seed)
    print(f"wrote {args.rows} transactions, 12 accounts, {len(BANKS)} banks to {args.out}")


if __name__ == "__main__":
    main()
