#!/usr/bin/env python3
"""Stream a delivered MySQL ledger into the CSVs the loader reads.

The connection is taken from the environment so no credential is ever written
into the repository:

    SOURCE_MYSQL_HOST=... SOURCE_MYSQL_PORT=... SOURCE_MYSQL_DB=... \
    SOURCE_MYSQL_USER=... SOURCE_MYSQL_PASSWORD=... \
    python scripts/pull_mysql.py --out services/query/data/real

Rows are fetched unbuffered and written in blocks, so a ten million row table
streams through in constant memory. Load the result with:

    cd services/query && PYTHONPATH=. python -m app.loader --data data/real
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from pathlib import Path

TABLES: dict[str, list[str]] = {
    "bank": ["bank_code", "bank_name"],
    "account": ["account_id", "entity_id", "account_number", "program_id",
                "available_balance", "bank_code"],
    "transaction": ["transaction_id", "account_id", "transaction_date", "transaction_type",
                    "description", "transaction_amount", "transaction_reference_id",
                    "utr_number"],
}
CHUNK = 200_000


def connect():
    try:
        import pymysql
    except ModuleNotFoundError:
        sys.exit("pymysql is not installed. pip install pymysql")
    missing = [k for k in ("SOURCE_MYSQL_HOST", "SOURCE_MYSQL_DB", "SOURCE_MYSQL_USER")
               if not os.environ.get(k)]
    if missing:
        sys.exit(f"set {', '.join(missing)} in the environment")
    return pymysql.connect(
        host=os.environ["SOURCE_MYSQL_HOST"],
        port=int(os.environ.get("SOURCE_MYSQL_PORT", "3306")),
        user=os.environ["SOURCE_MYSQL_USER"],
        password=os.environ.get("SOURCE_MYSQL_PASSWORD", ""),
        database=os.environ["SOURCE_MYSQL_DB"],
        connect_timeout=30,
        cursorclass=__import__("pymysql").cursors.SSCursor,
    )


def pull(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        for table, columns in TABLES.items():
            cur = conn.cursor()
            cur.execute(f"SELECT {','.join(columns)} FROM `{table}`")
            start, written = time.time(), 0
            with (out / f"{table}.csv").open("w", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(columns)
                while True:
                    rows = cur.fetchmany(CHUNK)
                    if not rows:
                        break
                    writer.writerows(rows)
                    written += len(rows)
            cur.close()
            print(f"{table}.csv: {written:,} rows in {time.time() - start:.1f}s")
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("services/query/data/real"),
                        help="directory to write the CSVs into")
    pull(parser.parse_args().out)
