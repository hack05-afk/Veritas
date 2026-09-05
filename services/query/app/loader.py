"""Loads the ledger into Parquet and enriches it with the Counterparty Resolver.

The resolver runs once here, at load time, so every later query is an aggregate
over pre-resolved columns and never re-parses a narration.

Usage: python -m app.loader --data services/query/data/test_100k
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Iterator

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import yaml

from app import resolver

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schema.yaml"

TABLES = {
    "bank": "bank.csv",
    "account": "account.csv",
    "transaction": "transaction.csv",
}

RESOLVER_COLUMNS = ["channel", "counterparty_raw", "counterparty_canonical",
                    "counterparty_family", "ifsc", "counterparty_bank_code",
                    "extracted_reference", "confidence"]

CHUNK_ROWS = 500_000

_INSERT = re.compile(r"INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*(.+?);", re.IGNORECASE | re.DOTALL)


def read_schema() -> dict:
    """The logical to physical column map. Editing it is how the real data is swapped in."""
    return yaml.safe_load(SCHEMA_PATH.read_text())


def _rename_to_logical(frame: pd.DataFrame, mapping: dict[str, str]) -> pd.DataFrame:
    """Rename physical columns to the logical names the rest of the service uses."""
    physical_to_logical = {physical: logical for logical, physical in mapping.items()}
    return frame.rename(columns=physical_to_logical)


def _read_sql_dump(path: Path) -> dict[str, pd.DataFrame]:
    """Parse a dump of INSERT statements into one frame per table."""
    text = path.read_text()
    frames: dict[str, pd.DataFrame] = {}
    for table, columns, values in _INSERT.findall(text):
        names = [c.strip() for c in columns.split(",")]
        rows = [_split_values(tuple_text) for tuple_text in re.findall(r"\(([^()]*)\)", values)]
        frames[table.lower()] = pd.DataFrame(rows, columns=names)
    return frames


def _split_values(tuple_text: str) -> list[object]:
    """Split one VALUES tuple, respecting quoted strings."""
    out: list[object] = []
    current: list[str] = []
    quoted = False
    for char in tuple_text:
        if char == "'":
            quoted = not quoted
        elif char == "," and not quoted:
            out.append(_cast(("".join(current)).strip()))
            current = []
        else:
            current.append(char)
    out.append(_cast(("".join(current)).strip()))
    return out


def _cast(token: str) -> object:
    if token.upper() == "NULL" or token == "":
        return None
    try:
        return float(token) if "." in token else int(token)
    except ValueError:
        return token


def read_tables(data: Path, schema: dict) -> dict[str, pd.DataFrame]:
    """Read the small tables from CSVs, or from a SQL dump when no CSVs are present."""
    frames: dict[str, pd.DataFrame] = {}
    for logical in ("bank", "account"):
        physical_file = data / TABLES[logical]
        if physical_file.is_file():
            frames[logical] = pd.read_csv(physical_file, dtype={"account_number": "string"})
    if len(frames) < 2:
        dumps = sorted(data.glob("*.sql"))
        if not dumps:
            missing = sorted({"bank", "account"} - set(frames))
            raise FileNotFoundError(f"no CSV or SQL dump in {data} for: {', '.join(missing)}")
        parsed = _read_sql_dump(dumps[0])
        for logical in ("bank", "account"):
            if logical not in frames:
                frames[logical] = parsed[schema[logical]["table"]]
    return {logical: _rename_to_logical(frame, schema[logical]["columns"])
            for logical, frame in frames.items()}


def transaction_chunks(data: Path, schema: dict) -> Iterator[pd.DataFrame]:
    """Yield the transaction table in blocks, so row count does not set memory use."""
    dtypes = {"transaction_reference_id": "string", "utr_number": "string"}
    path = data / TABLES["transaction"]
    if path.is_file():
        reader = pd.read_csv(path, dtype=dtypes, chunksize=CHUNK_ROWS)
    else:
        dumps = sorted(data.glob("*.sql"))
        if not dumps:
            raise FileNotFoundError(f"no CSV or SQL dump in {data} for: transaction")
        reader = [_read_sql_dump(dumps[0])[schema["transaction"]["table"]]]
    for chunk in reader:
        yield _rename_to_logical(chunk, schema["transaction"]["columns"])


def enrich(transactions: pd.DataFrame) -> pd.DataFrame:
    """Add the resolver columns.

    Each decode is unpacked into its column immediately rather than held in a
    map of every distinct narration, because at twenty million rows almost
    every narration is distinct and such a map would not fit in memory.
    """
    columns: dict[str, list] = {name: [] for name in RESOLVER_COLUMNS}
    appenders = [columns[name].append for name in RESOLVER_COLUMNS]
    for text in transactions["description"].fillna("").astype(str):
        r = resolver.resolve(text)
        appenders[0](r.channel)
        appenders[1](r.counterparty_raw)
        appenders[2](r.counterparty_canonical)
        appenders[3](r.counterparty_family)
        appenders[4](r.ifsc)
        appenders[5](r.bank_code)
        appenders[6](r.reference)
        appenders[7](r.confidence)
    for name, values in columns.items():
        transactions[name] = values
    return transactions


def load(data: Path) -> dict:
    """Read, enrich and write the Parquet files and meta.json. Returns the metadata."""
    schema = read_schema()
    frames = read_tables(data, schema)
    banks, accounts = frames["bank"], frames["account"]
    resolver.set_bank_codes(set(banks["bank_code"].astype(str)))

    owner = accounts.set_index("account_id")[["entity_id", "bank_code"]]
    entity_of = owner["entity_id"].to_dict()
    bank_of = owner["bank_code"].to_dict()

    rows = 0
    decoded = 0
    min_date: pd.Timestamp | None = None
    max_date: pd.Timestamp | None = None
    writer: pq.ParquetWriter | None = None
    target = data / "transactions.parquet"

    try:
        for chunk in transaction_chunks(data, schema):
            chunk["transaction_date"] = pd.to_datetime(chunk["transaction_date"])
            chunk["transaction_amount"] = chunk["transaction_amount"].astype(float).round(2)
            chunk = enrich(chunk)
            chunk["entity_id"] = chunk["account_id"].map(entity_of)
            chunk["bank_code"] = chunk["account_id"].map(bank_of)

            rows += len(chunk)
            decoded += int((chunk["confidence"] > 0).sum())
            low, high = chunk["transaction_date"].min(), chunk["transaction_date"].max()
            min_date = low if min_date is None or low < min_date else min_date
            max_date = high if max_date is None or high > max_date else max_date

            table = pa.Table.from_pandas(chunk, preserve_index=False)
            if writer is None:
                writer = pq.ParquetWriter(target, table.schema, compression="zstd")
            writer.write_table(table)
    finally:
        if writer is not None:
            writer.close()

    if rows == 0:
        raise ValueError(f"no transactions found in {data}")

    accounts.to_parquet(data / "accounts.parquet", index=False)
    banks.to_parquet(data / "banks.parquet", index=False)

    meta = {
        "rows": rows,
        "accounts": int(len(accounts)),
        "banks": int(len(banks)),
        "min_date": min_date.strftime("%Y-%m-%d"),
        "max_date": max_date.strftime("%Y-%m-%d"),
        "resolver_coverage": round(decoded / rows, 4),
    }
    (data / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return meta


def main() -> None:
    parser = argparse.ArgumentParser(description="Load a ledger into Parquet.")
    parser.add_argument("--data", type=Path, required=True)
    args = parser.parse_args()
    meta = load(args.data)
    print(f"loaded {meta['rows']} rows, resolver coverage {meta['resolver_coverage']}")


if __name__ == "__main__":
    main()
