"""Ingest a delivered dataset into the Parquet files the service reads.

app/loader.py reads the synthetic CSVs, whose columns are already canonical.
This module reads what an organiser actually sends: JSON Lines or CSV, under
file names that say nothing useful, with renamed columns, mixed date and amount
formats, and columns the base schema has no place for. Files are routed to a
table by their keys, columns are resolved through the alias table in
schema.yaml, values are normalised, and everything unrecognised is kept as a
passthrough column rather than dropped.

Usage: python -m app.ingest --input delivery/ --out services/query/data/real
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Iterator

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import yaml

from app import crypto, loader, resolver

TABLES = ("bank", "account", "transaction")
PARQUET_NAME = {"bank": "banks.parquet", "account": "accounts.parquet",
                "transaction": "transactions.parquet"}

DATA_EXTENSIONS = {".jsonl", ".ndjson", ".csv", ".json"}
DICTIONARY_HINTS = ("dictionary", "glossary", "readme", "schema")
DICTIONARY_EXTENSIONS = {".md", ".csv", ".json", ".yaml", ".yml", ".txt"}

CHUNK_ROWS = 200_000
PEEK_ROWS = 1000
DRY_RUN_ROWS = 1000
MAX_REJECT_RATE = 0.01

# A file must reach this share of a table's required columns to be routed to
# it, and beat the runner up by this margin, or it is called ambiguous.
ROUTE_THRESHOLD = 0.6
ROUTE_MARGIN = 0.15

# Names the enrichment step owns. A delivered column of the same name is kept
# under a source_ prefix so it cannot overwrite a derived one.
RESERVED = set(loader.RESOLVER_COLUMNS) | {"entity_id", "bank_code"}

TEXT_COLUMNS = {"transaction_id", "account_id", "description", "transaction_reference_id",
                "utr_number", "entity_id", "bank_code", "bank_name", "account_number",
                "program_id", "reconciliation_status", "vendor_name"}

_CAMEL = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_NON_WORD = re.compile(r"[^0-9a-z]+")
_CURRENCY_WORD = re.compile(r"(?i)\b(?:rs|inr|rupees|usd)\b\.?")
_AMOUNT_KEEP = re.compile(r"[^0-9.,+\-()]")
_MD_ROW = re.compile(r"^\s*\|(.+)\|\s*$")
_MD_BULLET = re.compile(r"^\s*[-*]\s+`?([A-Za-z_][\w .]*)`?\s*[:—-]\s+(.+)$")

CREDIT_DEBIT = {
    "credit": "credit", "cr": "credit", "c": "credit", "+": "credit",
    "deposit": "credit", "inward": "credit", "in": "credit", "receipt": "credit",
    "debit": "debit", "dr": "debit", "d": "debit", "-": "debit",
    "withdrawal": "debit", "outward": "debit", "out": "debit", "payment": "debit",
}

# Day first. Indian bank exports write 03/04/2026 as the third of April, so
# every day-first form is tried before the month-first fallback below.
DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
    "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y",
    "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%d-%m-%Y",
    "%d-%b-%Y", "%d %b %Y", "%d-%b-%y", "%Y/%m/%d",
)
FALLBACK_DATE_FORMATS = ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y")


class Unroutable(ValueError):
    """Raised when a file's keys do not identify one table."""


# ---------------------------------------------------------------- key mapping


def normalise_key(key: str) -> str:
    """Reduce a source key to a comparable form: lower case, words joined by _."""
    text = _CAMEL.sub("_", str(key).strip())
    return _NON_WORD.sub("_", text.lower()).strip("_")


def alias_index(schema: dict, table: str, override: dict | None = None) -> dict[str, str]:
    """Normalised source key to canonical column, for one table."""
    index: dict[str, str] = {}
    for canonical in schema[table]["columns"]:
        index[normalise_key(canonical)] = canonical
    for group in ("aliases", "extras"):
        for canonical, sources in (schema.get(group, {}).get(table) or {}).items():
            index.setdefault(normalise_key(canonical), canonical)
            for source in sources:
                index.setdefault(normalise_key(source), canonical)
    for canonical, source in (override or {}).items():
        index[normalise_key(source)] = canonical
    return index


def extra_names(schema: dict, table: str) -> set[str]:
    """The known-but-not-core columns for a table, such as reconciliation_status."""
    return set(schema.get("extras", {}).get(table) or {})


def map_columns(keys: list[str], schema: dict, table: str,
                override: dict | None = None) -> tuple[dict[str, str], list[str]]:
    """Map each source key to a canonical name. Returns the map and the unmapped keys."""
    index = alias_index(schema, table, override)
    mapped: dict[str, str] = {}
    unmapped: list[str] = []
    for key in keys:
        canonical = index.get(normalise_key(key))
        if canonical is None or canonical in mapped.values():
            unmapped.append(key)
        else:
            mapped[key] = canonical
    return mapped, unmapped


# -------------------------------------------------------------------- routing


def score_table(keys: list[str], schema: dict, table: str, override: dict | None) -> float:
    """How well a file's keys fit one table. Zero when the identity column is absent."""
    rules = schema["routing"][table]
    mapped, _ = map_columns(keys, schema, table, override)
    found = set(mapped.values())
    if rules["identity"] not in found:
        return 0.0
    required = rules["required"]
    covered = sum(1 for column in required if column in found) / len(required)
    if covered < ROUTE_THRESHOLD:
        return 0.0
    known = set(schema[table]["columns"]) | extra_names(schema, table)
    breadth = len(found & known) / len(known)
    return covered + 0.5 * breadth


def route(keys: list[str], schema: dict, overrides: dict | None = None) -> str:
    """Decide which table a file belongs to from its keys alone."""
    overrides = overrides or {}
    scores = {table: score_table(keys, schema, table, overrides.get(table)) for table in TABLES}
    ranked = sorted(scores.items(), key=lambda pair: pair[1], reverse=True)
    best, best_score = ranked[0]
    if best_score == 0.0:
        raise Unroutable(f"no table matched. Keys seen: {', '.join(map(str, keys))}")
    if ranked[1][1] > 0.0 and best_score - ranked[1][1] < ROUTE_MARGIN:
        raise Unroutable(f"{best} and {ranked[1][0]} match equally well. "
                         f"Keys seen: {', '.join(map(str, keys))}. "
                         f"Use --map to say which table this file is.")
    return best


# ------------------------------------------------------------- value handling


def blank_to_none(value: object) -> object:
    """Empty strings and pandas nulls become None, everything else keeps its value."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def to_amount(value: object) -> float | None:
    """Read an amount written with currency words, symbols, commas or brackets."""
    value = blank_to_none(value)
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = _AMOUNT_KEEP.sub("", _CURRENCY_WORD.sub("", str(value)))
    if not cleaned:
        return None
    negative = cleaned.startswith("(") or cleaned.startswith("-") or cleaned.endswith("-")
    core = cleaned.strip("()+-").replace(",", "")
    try:
        number = float(core)
    except ValueError:
        return None
    return -number if negative else number


def to_date(value: object) -> datetime | None:
    """Read a date in any of the formats an export is likely to use."""
    value = blank_to_none(value)
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    text = str(value).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        pass
    for fmt in FALLBACK_DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def to_type(value: object, amount: float | None) -> str | None:
    """Resolve the direction. The sign of the amount decides when the column cannot."""
    token = blank_to_none(value)
    kind = CREDIT_DEBIT.get(str(token).strip().lower()) if token is not None else None
    if kind is not None:
        return kind
    if amount is None or amount == 0:
        return None
    return "debit" if amount < 0 else "credit"


def to_text(value: object) -> str | None:
    value = blank_to_none(value)
    return None if value is None else str(value).strip() or None


def infer_type(samples: list[object]) -> str:
    """The passthrough type for an unrecognised column: integer, number or text."""
    seen = [blank_to_none(v) for v in samples]
    seen = [v for v in seen if v is not None]
    if not seen:
        return "text"
    numbers = [to_amount(v) for v in seen]
    if any(n is None for n in numbers):
        return "text"
    return "integer" if all(float(n).is_integer() for n in numbers) else "number"


PANDAS_TYPE = {"integer": "Int64", "number": "float64", "text": "string"}


# --------------------------------------------------------------- file reading


def classify(path: Path) -> str:
    """data, dictionary or ignore."""
    suffix = path.suffix.lower()
    stem = path.stem.lower()
    if any(hint in stem for hint in DICTIONARY_HINTS) and suffix in DICTIONARY_EXTENSIONS:
        return "dictionary"
    return "data" if suffix in DATA_EXTENSIONS else "ignore"


def collect_inputs(source: Path, workspace: Path) -> list[Path]:
    """Every candidate file under a directory, a single file, or inside a zip."""
    if source.is_dir():
        return sorted(p for p in source.rglob("*") if p.is_file())
    if source.suffix.lower() == ".zip":
        target = workspace / "unzipped"
        with zipfile.ZipFile(source) as archive:
            archive.extractall(target)
        return sorted(p for p in target.rglob("*") if p.is_file())
    return [source]


def _json_batches(path: Path, size: int, limit: int | None,
                  rejects: "Rejects") -> Iterator[list[dict]]:
    """Read JSON Lines, or a whole JSON array, in batches."""
    text_head = path.open("r", encoding="utf-8", errors="replace")
    first = text_head.read(1)
    text_head.close()
    if first == "[":
        records = json.loads(path.read_text(encoding="utf-8"))
        records = records[:limit] if limit else records
        for start in range(0, len(records), size):
            yield [r for r in records[start:start + size] if isinstance(r, dict)]
        return
    batch: list[dict] = []
    produced = 0
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if limit is not None and produced >= limit:
                break
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                rejects.add_line("line is not valid JSON", line)
                continue
            if not isinstance(record, dict):
                rejects.add_line("line is not a JSON object", line)
                continue
            batch.append(record)
            produced += 1
            if len(batch) >= size:
                yield batch
                batch = []
    if batch:
        yield batch


def read_batches(path: Path, size: int, limit: int | None,
                 rejects: "Rejects") -> Iterator[list[dict]]:
    """Yield batches of raw records from one file, without holding the file in memory."""
    if path.suffix.lower() == ".csv":
        reader = pd.read_csv(path, dtype=str, keep_default_na=False,
                             chunksize=size, nrows=limit)
        for frame in reader:
            yield frame.to_dict("records")
        return
    yield from _json_batches(path, size, limit, rejects)


def peek(path: Path) -> tuple[list[str], list[dict]]:
    """The keys and a sample of rows from the head of a file, for routing and typing."""
    rejects = Rejects()
    sample: list[dict] = []
    for batch in read_batches(path, PEEK_ROWS, PEEK_ROWS, rejects):
        sample.extend(batch)
        break
    keys: list[str] = []
    for record in sample:
        for key in record:
            if key not in keys:
                keys.append(key)
    return keys, sample


# ------------------------------------------------------------ data dictionary


def read_dictionary(path: Path) -> dict[str, str]:
    """Column name to description, from whatever shape the dictionary is in."""
    suffix = path.suffix.lower()
    if suffix in (".yaml", ".yml"):
        return _from_object(yaml.safe_load(path.read_text(encoding="utf-8")))
    if suffix == ".json":
        return _from_object(json.loads(path.read_text(encoding="utf-8")))
    if suffix == ".csv":
        return _from_object(pd.read_csv(path, dtype=str, keep_default_na=False).to_dict("records"))
    return _from_markdown(path.read_text(encoding="utf-8"))


NAME_KEYS = ("column", "column_name", "field", "field_name", "name", "attribute")
DESCRIPTION_KEYS = ("description", "definition", "meaning", "notes", "comment", "details")


def _pick(record: dict, wanted: tuple[str, ...]) -> str | None:
    for key, value in record.items():
        if normalise_key(key) in wanted and str(value).strip():
            return str(value).strip()
    return None


def _from_object(parsed: object) -> dict[str, str]:
    """Read a mapping, a list of records, or a nested mapping of tables."""
    out: dict[str, str] = {}
    if isinstance(parsed, dict):
        for key, value in parsed.items():
            if isinstance(value, str):
                out[str(key)] = value
            elif isinstance(value, dict):
                described = _pick(value, DESCRIPTION_KEYS)
                if described:
                    out[str(key)] = described
                else:
                    out.update(_from_object(value))
            elif isinstance(value, list):
                out.update(_from_object(value))
    elif isinstance(parsed, list):
        for item in parsed:
            if not isinstance(item, dict):
                continue
            name = _pick(item, NAME_KEYS)
            description = _pick(item, DESCRIPTION_KEYS)
            if name and description:
                out[name] = description
    return out


def _from_markdown(text: str) -> dict[str, str]:
    """Read pipe tables and 'name - description' bullets out of a markdown file."""
    out: dict[str, str] = {}
    for line in text.splitlines():
        bullet = _MD_BULLET.match(line)
        if bullet:
            out.setdefault(bullet.group(1).strip(), bullet.group(2).strip())
            continue
        row = _MD_ROW.match(line)
        if not row:
            continue
        cells = [cell.strip().strip("`") for cell in row.group(1).split("|")]
        if len(cells) < 2 or not cells[0] or set(cells[0]) <= set("-: "):
            continue
        if normalise_key(cells[0]) in NAME_KEYS or normalise_key(cells[1]) in DESCRIPTION_KEYS:
            continue
        out.setdefault(cells[0], cells[-1] if len(cells) == 2 else cells[1])
    return out


# --------------------------------------------------------------------- report


def jsonable(value: object) -> object:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    return str(value)


class Rejects:
    """Rejected rows, counted by reason, with the first example of each."""

    def __init__(self) -> None:
        self.counts: Counter = Counter()
        self.examples: dict[str, dict] = {}
        # Lines that never became a row. Counted separately so they can still be
        # added to the rows read, and the rejection rate keeps its denominator.
        self.unreadable = 0

    def add(self, reason: str, example: dict, count: int = 1) -> None:
        self.counts[reason] += count
        self.examples.setdefault(reason, {k: jsonable(v) for k, v in list(example.items())[:12]})

    def add_line(self, reason: str, line: str) -> None:
        self.unreadable += 1
        self.add(reason, {"line": line[:200]})

    @property
    def total(self) -> int:
        return sum(self.counts.values())

    def top(self, limit: int = 5) -> list[dict]:
        return [{"reason": reason, "rows": rows, "example": self.examples.get(reason)}
                for reason, rows in self.counts.most_common(limit)]


@dataclass
class TableReport:
    """What happened to one table during a run."""

    files: list[str] = field(default_factory=list)
    rows_read: int = 0
    rows_written: int = 0
    matched: dict[str, str] = field(default_factory=dict)
    aliased: dict[str, str] = field(default_factory=dict)
    extra: dict[str, str] = field(default_factory=dict)
    missing: list[str] = field(default_factory=list)
    rejects: Rejects = field(default_factory=Rejects)

    def as_dict(self) -> dict:
        return {
            "files": self.files,
            "rows_read": self.rows_read,
            "rows_written": self.rows_written,
            "columns": {"matched": self.matched, "aliased": self.aliased,
                        "kept_as_extra": self.extra, "missing": sorted(self.missing)},
            "rejected": {"rows": self.rejects.total,
                         "rate": round(self.rejects.total / self.rows_read, 4) if self.rows_read else 0.0,
                         "top_reasons": self.rejects.top()},
        }


# ------------------------------------------------------------------ normalise


def _rename(frame: pd.DataFrame, mapping: dict[str, str]) -> pd.DataFrame:
    """Keep only mapped columns and give them their canonical names."""
    present = {source: canonical for source, canonical in mapping.items() if source in frame.columns}
    return frame[list(present)].rename(columns=present)


def _typed_extras(frame: pd.DataFrame, types: dict[str, str]) -> pd.DataFrame:
    """Coerce every passthrough column to the type inferred from the head of the file."""
    for column, kind in types.items():
        if column not in frame.columns:
            frame[column] = pd.Series([None] * len(frame), dtype=PANDAS_TYPE[kind])
        elif kind == "text":
            frame[column] = frame[column].map(to_text).astype("string")
        else:
            numbers = frame[column].map(to_amount)
            frame[column] = pd.to_numeric(numbers, errors="coerce").astype(PANDAS_TYPE[kind])
    return frame


def _clean_text(frame: pd.DataFrame) -> None:
    """Trim every text column in place, turning blanks into nulls."""
    for column in TEXT_COLUMNS.intersection(frame.columns):
        frame[column] = frame[column].map(to_text)


def normalise_transactions(frame: pd.DataFrame, rejects: Rejects) -> pd.DataFrame:
    """Normalise values, drop the rows that cannot be trusted, and record why."""
    raw = frame.copy()
    frame["transaction_amount"] = frame["transaction_amount"].map(to_amount)
    frame["transaction_date"] = frame["transaction_date"].map(to_date)
    kinds = [to_type(kind, amount) for kind, amount
             in zip(frame["transaction_type"].tolist(), frame["transaction_amount"].tolist())]
    frame["transaction_type"] = kinds
    frame["transaction_amount"] = frame["transaction_amount"].map(
        lambda a: None if a is None or pd.isna(a) else round(abs(float(a)), 2))
    _clean_text(frame)

    checks = (
        ("transaction_id is missing", frame["transaction_id"].isna()),
        ("account_id is missing", frame["account_id"].isna()),
        ("transaction_date could not be read", frame["transaction_date"].isna()),
        ("transaction_amount could not be read", frame["transaction_amount"].isna()),
        ("transaction_type could not be read", pd.isna(pd.Series(kinds, index=frame.index))),
    )
    return _reject(frame, raw, checks, rejects)


def normalise_accounts(frame: pd.DataFrame, rejects: Rejects) -> pd.DataFrame:
    raw = frame.copy()
    if "available_balance" in frame:
        frame["available_balance"] = pd.to_numeric(frame["available_balance"].map(to_amount),
                                                   errors="coerce")
    _clean_text(frame)
    return _reject(frame, raw, (("account_id is missing", frame["account_id"].isna()),), rejects)


def normalise_banks(frame: pd.DataFrame, rejects: Rejects) -> pd.DataFrame:
    raw = frame.copy()
    _clean_text(frame)
    return _reject(frame, raw, (("bank_code is missing", frame["bank_code"].isna()),), rejects)


def _reject(frame: pd.DataFrame, raw: pd.DataFrame,
            checks: tuple, rejects: Rejects) -> pd.DataFrame:
    """Drop failing rows, attributing each to the first check it failed."""
    bad = pd.Series(False, index=frame.index)
    for reason, mask in checks:
        mask = mask.fillna(True) & ~bad
        count = int(mask.sum())
        if count:
            rejects.add(reason, raw.loc[mask].iloc[0].to_dict(), count)
            bad = bad | mask
    return frame.loc[~bad]


NORMALISERS = {"bank": normalise_banks, "account": normalise_accounts,
               "transaction": normalise_transactions}


# ------------------------------------------------------------------ ingestion


@dataclass
class Plan:
    """One file, the table it belongs to and how its keys map."""

    path: Path
    table: str
    mapping: dict[str, str]
    extras: dict[str, str]
    extra_types: dict[str, str]


def plan_files(paths: list[Path], schema: dict, overrides: dict,
               report: dict) -> tuple[list[Plan], list[Path]]:
    """Route every data file and work out its column map. Dictionaries are set aside."""
    plans: list[Plan] = []
    dictionaries: list[Path] = []
    for path in paths:
        kind = classify(path)
        if kind == "ignore":
            continue
        if kind == "dictionary":
            dictionaries.append(path)
            continue
        keys, sample = peek(path)
        if not keys:
            report["unrouted_files"].append({"file": path.name, "keys": [], "reason": "file is empty"})
            continue
        try:
            table = route(keys, schema, overrides)
        except Unroutable as error:
            report["unrouted_files"].append({"file": path.name, "keys": [str(k) for k in keys],
                                             "reason": str(error)})
            continue
        mapping, unmapped = map_columns(keys, schema, table, overrides.get(table))
        extras = {key: _extra_name(key, mapping) for key in unmapped}
        types = {name: infer_type([row.get(key) for row in sample])
                 for key, name in extras.items()}
        plans.append(Plan(path, table, mapping, extras, types))
    return plans, dictionaries


def _extra_name(key: str, mapping: dict[str, str]) -> str:
    """The output name for an unrecognised column, kept clear of the derived ones."""
    name = normalise_key(key) or "column"
    if name in RESERVED or name in mapping.values():
        name = f"source_{name}"
    return name


def record_columns(plan: Plan, schema: dict, table_report: TableReport) -> None:
    """Note which columns were found under their own name, under an alias, or not at all."""
    table_report.files.append(plan.path.name)
    known_extras = extra_names(schema, plan.table)
    for source, canonical in plan.mapping.items():
        table_report.matched[canonical] = source
        if normalise_key(source) != normalise_key(canonical):
            table_report.aliased[canonical] = source
        if canonical in known_extras:
            table_report.extra[canonical] = source
    for source, name in plan.extras.items():
        table_report.extra[name] = source
    found = set(plan.mapping.values())
    for canonical in schema[plan.table]["columns"]:
        if canonical not in found and canonical not in table_report.missing:
            table_report.missing.append(canonical)


def _frame_for(plan: Plan, batch: list[dict]) -> pd.DataFrame:
    """One batch as a frame with canonical names, extras included."""
    frame = pd.DataFrame(batch, dtype=object)
    for source in list(plan.mapping) + list(plan.extras):
        if source not in frame.columns:
            frame[source] = None
    core = _rename(frame, plan.mapping)
    for source, name in plan.extras.items():
        core[name] = frame[source]
    return core


def read_table(plans: list[Plan], table: str, schema: dict, reports: dict[str, TableReport],
               limit: int | None) -> Iterator[pd.DataFrame]:
    """Yield normalised chunks of one table, across every file routed to it."""
    normalise = NORMALISERS[table]
    for plan in (p for p in plans if p.table == table):
        record_columns(plan, schema, reports[table])
        unreadable = reports[table].rejects.unreadable
        for batch in read_batches(plan.path, CHUNK_ROWS, limit, reports[table].rejects):
            frame = _frame_for(plan, batch)
            reports[table].rows_read += len(frame)
            for canonical in schema[table]["columns"]:
                if canonical not in frame.columns:
                    frame[canonical] = None
            frame = normalise(frame, reports[table].rejects)
            frame = _typed_extras(frame, plan.extra_types)
            reports[table].rows_written += len(frame)
            yield frame
        reports[table].rows_read += reports[table].rejects.unreadable - unreadable


def _apply_vendor(chunk: pd.DataFrame) -> pd.DataFrame:
    """A delivered vendor column wins; the resolver's decode is kept beside it.

    The resolver reads a counterparty out of the narration. When the dataset
    already names the vendor, that name is the counterparty and the decode
    becomes a cross-check, so the two can be compared rather than one quietly
    replacing the other.
    """
    if "vendor_name" not in chunk.columns:
        return chunk
    chunk["counterparty_resolved"] = chunk["counterparty_canonical"]
    vendor = chunk["vendor_name"].map(
        lambda v: resolver.canonicalise(str(v)) if to_text(v) else None)
    chunk["counterparty_canonical"] = vendor.where(vendor.notna(), chunk["counterparty_resolved"])
    chunk["counterparty_family"] = chunk["counterparty_canonical"].map(
        lambda c: resolver.family_of(c) if isinstance(c, str) and c else None)
    return chunk


def write_dimension(plans: list[Plan], table: str, schema: dict,
                    reports: dict[str, TableReport], out: Path, limit: int | None) -> pd.DataFrame | None:
    """Read a small table whole and write its Parquet file."""
    chunks = list(read_table(plans, table, schema, reports, limit))
    if not chunks:
        existing = out / PARQUET_NAME[table]
        return pd.read_parquet(existing) if existing.is_file() else None
    frame = pd.concat(chunks, ignore_index=True)
    if table == "account":
        frame = loader.protect_accounts(frame)
    frame.to_parquet(out / PARQUET_NAME[table], index=False)
    return frame


def write_transactions(plans: list[Plan], schema: dict, reports: dict[str, TableReport],
                       accounts: pd.DataFrame, out: Path, limit: int | None) -> int:
    """Enrich and stream the ledger to Parquet, one chunk at a time."""
    owner = accounts.set_index("account_id")[["entity_id", "bank_code"]] \
        if accounts is not None and "entity_id" in accounts.columns else None
    entity_of = owner["entity_id"].to_dict() if owner is not None else {}
    bank_of = owner["bank_code"].to_dict() if owner is not None else {}

    writer: pq.ParquetWriter | None = None
    columns: list[str] | None = None
    rows = 0
    try:
        for chunk in read_table(plans, "transaction", schema, reports, limit):
            if chunk.empty:
                continue
            chunk = chunk.reset_index(drop=True)
            chunk["transaction_date"] = pd.to_datetime(chunk["transaction_date"])
            chunk = loader.enrich(chunk)
            chunk = _apply_vendor(chunk)
            chunk = loader.protect_transactions(chunk)
            chunk["entity_id"] = chunk["account_id"].map(entity_of)
            chunk["bank_code"] = chunk["account_id"].map(bank_of)
            for column in TEXT_COLUMNS & set(chunk.columns):
                chunk[column] = chunk[column].astype("string")
            if columns is None:
                columns = list(chunk.columns)
            chunk = chunk.reindex(columns=columns)
            table = pa.Table.from_pandas(chunk, preserve_index=False)
            if writer is None:
                writer = pq.ParquetWriter(out / PARQUET_NAME["transaction"],
                                          table.schema, compression="zstd")
            writer.write_table(table)
            rows += len(chunk)
    finally:
        if writer is not None:
            writer.close()
    return rows


# --------------------------------------------------------------- verification


def _scalar(connection, sql: str) -> object:
    return connection.execute(sql).fetchone()[0]


def verify(out: Path, has_recon: bool, has_vendor: bool) -> dict:
    """Read the written Parquet back and check what the streaming pass cannot.

    Duplicate keys, unresolved foreign keys and the split of the ledger are all
    whole-table questions, so they are asked of the database rather than held in
    Python while the rows go past.
    """
    import duckdb

    from app import db

    def parquet(name: str) -> str:
        return str((out / name).resolve()).replace("'", "''")

    connection = duckdb.connect(database=":memory:")
    connection.execute(f"SET memory_limit='{db.memory_limit()}'")
    connection.execute(f"CREATE VIEW t AS SELECT * FROM read_parquet('{parquet('transactions.parquet')}')")
    views = {"t"}
    for view, name in (("a", "accounts.parquet"), ("b", "banks.parquet")):
        if (out / name).is_file():
            connection.execute(f"CREATE VIEW {view} AS SELECT * FROM read_parquet('{parquet(name)}')")
            views.add(view)

    result: dict = {
        "duplicate_primary_keys": {
            "transaction": int(_scalar(connection,
                "SELECT count(*) FROM (SELECT transaction_id FROM t GROUP BY 1 HAVING count(*) > 1)")),
        },
        "foreign_keys": {},
        "date_range": {},
        "credit_debit": {},
        "resolver": {},
    }
    if "a" in views:
        result["duplicate_primary_keys"]["account"] = int(_scalar(connection,
            "SELECT count(*) FROM (SELECT account_id FROM a GROUP BY 1 HAVING count(*) > 1)"))
        result["foreign_keys"]["transactions_without_an_account"] = int(_scalar(connection,
            "SELECT count(*) FROM t LEFT JOIN a ON t.account_id = a.account_id WHERE a.account_id IS NULL"))
        result["foreign_keys"]["example_missing_account_ids"] = [row[0] for row in connection.execute(
            "SELECT DISTINCT t.account_id FROM t LEFT JOIN a ON t.account_id = a.account_id "
            "WHERE a.account_id IS NULL LIMIT 5").fetchall()]
    if "a" in views and "b" in views:
        result["duplicate_primary_keys"]["bank"] = int(_scalar(connection,
            "SELECT count(*) FROM (SELECT bank_code FROM b GROUP BY 1 HAVING count(*) > 1)"))
        result["foreign_keys"]["accounts_without_a_bank"] = int(_scalar(connection,
            "SELECT count(*) FROM a LEFT JOIN b ON a.bank_code = b.bank_code WHERE b.bank_code IS NULL"))
        result["foreign_keys"]["example_missing_bank_codes"] = [row[0] for row in connection.execute(
            "SELECT DISTINCT a.bank_code FROM a LEFT JOIN b ON a.bank_code = b.bank_code "
            "WHERE b.bank_code IS NULL LIMIT 5").fetchall()]

    low, high = connection.execute("SELECT min(transaction_date), max(transaction_date) FROM t").fetchone()
    result["date_range"] = {"min": low.strftime("%Y-%m-%d") if low else None,
                            "max": high.strftime("%Y-%m-%d") if high else None}
    split = dict(connection.execute(
        "SELECT transaction_type, count(*) FROM t GROUP BY 1").fetchall())
    total = sum(split.values()) or 1
    result["credit_debit"] = {"credit": int(split.get("credit", 0)), "debit": int(split.get("debit", 0)),
                              "debit_share": round(int(split.get("debit", 0)) / total, 4)}
    decoded = int(_scalar(connection, "SELECT count(*) FROM t WHERE confidence > 0"))
    result["resolver"] = {"decoded_rows": decoded, "coverage": round(decoded / total, 4)}

    if has_recon:
        result["reconciliation_status"] = {
            "values": {str(k): int(v) for k, v in connection.execute(
                "SELECT reconciliation_status, count(*) FROM t GROUP BY 1 ORDER BY 2 DESC LIMIT 20").fetchall()}}
    if has_vendor:
        compared = int(_scalar(connection, "SELECT count(*) FROM t WHERE vendor_name IS NOT NULL "
                                           "AND counterparty_resolved IS NOT NULL"))
        disagree = int(_scalar(connection, "SELECT count(*) FROM t WHERE vendor_name IS NOT NULL "
                                           "AND counterparty_resolved IS NOT NULL "
                                           "AND counterparty_canonical <> counterparty_resolved"))
        result["vendor_column"] = {
            "rows_compared": compared, "disagreements": disagree,
            "disagreement_rate": round(disagree / compared, 4) if compared else 0.0,
            "examples": [{"vendor": v, "resolver": r} for v, r in connection.execute(
                "SELECT DISTINCT counterparty_canonical, counterparty_resolved FROM t "
                "WHERE vendor_name IS NOT NULL AND counterparty_resolved IS NOT NULL "
                "AND counterparty_canonical <> counterparty_resolved LIMIT 5").fetchall()]}
    connection.close()
    return result


# ---------------------------------------------------------------- orchestrate

# Passthrough columns the service already knows how to use. Everything else is
# stored and catalogued but no query template reads it yet.
CONSUMED_EXTRAS = {"reconciliation_status", "vendor_name"}


def load_mapping(path: Path | None) -> dict:
    """The optional {table: {canonical_column: source_key}} override file."""
    if path is None:
        return {}
    parsed = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return {table: dict(columns) for table, columns in parsed.items() if table in TABLES}


def collect_dictionary(paths: list[Path], report: dict) -> dict[str, str]:
    """Read every data dictionary found. A dictionary that cannot be read is noted, not fatal."""
    descriptions: dict[str, str] = {}
    for path in paths:
        entry = {"file": path.name, "entries": 0, "error": None}
        try:
            parsed = read_dictionary(path)
            descriptions.update(parsed)
            entry["entries"] = len(parsed)
            if not parsed:
                entry["error"] = "no column descriptions recognised in this file"
        except Exception as error:  # a dictionary must never stop an ingest
            entry["error"] = f"{type(error).__name__}: {error}"
        report["data_dictionary"].append(entry)
    return descriptions


def write_catalog_columns(out: Path, reports: dict[str, TableReport],
                          descriptions: dict[str, str]) -> None:
    """Register every column, with its description when the dictionary gave one."""
    lookup = {normalise_key(name): text for name, text in descriptions.items()}
    entries = []
    for table, table_report in reports.items():
        for canonical, source in sorted({**table_report.matched, **table_report.extra}.items()):
            entries.append({
                "table": table,
                "column": canonical,
                "source": source,
                "extra": canonical in table_report.extra,
                "description": lookup.get(normalise_key(canonical)) or lookup.get(normalise_key(source)),
            })
    (out / "catalog_columns.json").write_text(json.dumps({"columns": entries}, indent=2) + "\n")


def unused_columns(reports: dict[str, TableReport]) -> list[str]:
    """Passthrough columns no query template reads yet."""
    return sorted({name for table_report in reports.values() for name in table_report.extra
                   if name not in CONSUMED_EXTRAS})


def ingest(source: Path, out: Path, dry_run: bool = False,
           mapping_file: Path | None = None) -> dict:
    """Run one ingestion. Returns the report; writes it unless this is a dry run."""
    crypto.require_ready()
    schema = loader.read_schema()
    overrides = load_mapping(mapping_file)
    reports = {table: TableReport() for table in TABLES}
    report: dict = {
        "input": str(source), "out": str(out), "dry_run": dry_run,
        "generated_at": datetime.now().replace(microsecond=0).isoformat(),
        "unrouted_files": [], "data_dictionary": [], "tables": {},
    }

    with tempfile.TemporaryDirectory() as workspace:
        work = Path(workspace)
        paths = collect_inputs(source, work)
        plans, dictionaries = plan_files(paths, schema, overrides, report)
        descriptions = collect_dictionary(dictionaries, report)

        if not any(plan.table == "transaction" for plan in plans):
            seen = "; ".join(f"{entry['file']}: {entry['reason']}"
                             for entry in report["unrouted_files"]) or "no data files were found"
            raise ValueError(f"no file in {source} could be routed to the transaction table. "
                             f"{seen}. Pass --map to say which file is which.")

        target = Path(work / "out") if dry_run else out
        target.mkdir(parents=True, exist_ok=True)
        limit = DRY_RUN_ROWS if dry_run else None

        banks = write_dimension(plans, "bank", schema, reports, target, limit)
        accounts = write_dimension(plans, "account", schema, reports, target, limit)
        if banks is not None:
            resolver.set_bank_codes(set(banks["bank_code"].dropna().astype(str)))
        rows = write_transactions(plans, schema, reports, accounts, target, limit)
        if rows == 0:
            raise ValueError(f"every transaction row in {source} was rejected. See the report.")

        extras_seen = {name for table_report in reports.values() for name in table_report.extra}
        report.update(verify(target, "reconciliation_status" in extras_seen,
                             "vendor_name" in extras_seen))
        report["tables"] = {table: reports[table].as_dict() for table in TABLES}
        report["columns_not_used_by_any_query"] = unused_columns(reports)

        read = sum(reports[table].rows_read for table in TABLES)
        rejected = sum(reports[table].rejects.total for table in TABLES)
        report["rows_read"] = read
        report["rows_rejected"] = rejected
        report["rejection_rate"] = round(rejected / read, 4) if read else 0.0
        report["ok"] = report["rejection_rate"] <= MAX_REJECT_RATE

        if not dry_run:
            report["rollup_rows"] = loader.build_rollups(target)
            write_catalog_columns(target, reports, descriptions)
            _write_meta(target, report, reports)
            (target / "ingest_report.json").write_text(json.dumps(report, indent=2, default=str) + "\n")
    return report


def _write_meta(out: Path, report: dict, reports: dict[str, TableReport]) -> None:
    """The metadata the service reads, in the shape the loader writes it."""
    meta = {
        "rows": reports["transaction"].rows_written,
        "accounts": reports["account"].rows_written,
        "banks": reports["bank"].rows_written,
        "min_date": report["date_range"]["min"],
        "max_date": report["date_range"]["max"],
        "resolver_coverage": report["resolver"]["coverage"],
        "rollup_rows": report.get("rollup_rows", 0),
        "source": "ingest",
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")


# ------------------------------------------------------------------- printing


def summarise(report: dict) -> str:
    """The readable version of the report, printed at the end of every run."""
    lines = [f"input: {report['input']}", f"out:   {report['out']}"]
    if report["dry_run"]:
        lines.append("dry run: at most 1000 rows per file were read and nothing was written")
    for table, table_report in report["tables"].items():
        if not table_report["files"]:
            continue
        columns = table_report["columns"]
        lines.append(f"\n{table}: {table_report['rows_written']} of {table_report['rows_read']} rows written "
                     f"from {', '.join(table_report['files'])}")
        if columns["aliased"]:
            lines.append("  renamed: " + ", ".join(f"{v} -> {k}" for k, v in sorted(columns["aliased"].items())))
        if columns["kept_as_extra"]:
            lines.append("  kept as extra: " + ", ".join(sorted(columns["kept_as_extra"])))
        if columns["missing"]:
            lines.append("  missing: " + ", ".join(columns["missing"]))
        for reason in table_report["rejected"]["top_reasons"]:
            lines.append(f"  rejected {reason['rows']}: {reason['reason']}")
    for entry in report["unrouted_files"]:
        lines.append(f"\nnot ingested: {entry['file']}. {entry['reason']}")
    for entry in report["data_dictionary"]:
        note = entry["error"] or f"{entry['entries']} column descriptions"
        lines.append(f"\ndata dictionary {entry['file']}: {note}")

    lines.append(f"\ndates {report['date_range']['min']} to {report['date_range']['max']}, "
                 f"{report['credit_debit']['credit']} credits and {report['credit_debit']['debit']} debits, "
                 f"resolver coverage {report['resolver']['coverage']}")
    fk = report["foreign_keys"]
    if fk.get("transactions_without_an_account"):
        lines.append(f"{fk['transactions_without_an_account']} transactions name an account that is not in the "
                     f"account table: {', '.join(map(str, fk.get('example_missing_account_ids', [])))}")
    if fk.get("accounts_without_a_bank"):
        lines.append(f"{fk['accounts_without_a_bank']} accounts name a bank that is not in the bank table")
    duplicates = {k: v for k, v in report["duplicate_primary_keys"].items() if v}
    if duplicates:
        lines.append("duplicate keys: " + ", ".join(f"{k} {v}" for k, v in duplicates.items()))
    if "vendor_column" in report:
        vendor = report["vendor_column"]
        lines.append(f"vendor column used as the counterparty. The resolver disagreed on "
                     f"{vendor['disagreements']} of {vendor['rows_compared']} rows "
                     f"({vendor['disagreement_rate']})")
    if "reconciliation_status" in report:
        values = report["reconciliation_status"]["values"]
        lines.append("reconciliation_status found: " + ", ".join(f"{k} {v}" for k, v in values.items()))

    unused = report["columns_not_used_by_any_query"]
    if unused:
        lines.append(f"\n{len(unused)} columns were kept but no query template uses them yet: "
                     + ", ".join(unused))
    lines.append(f"\n{report['rows_rejected']} of {report['rows_read']} rows rejected "
                 f"({report['rejection_rate']})")
    if not report["ok"]:
        lines.append(f"more than {MAX_REJECT_RATE:.0%} of rows were rejected. This dataset is not fit to demo.")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest a delivered dataset into Parquet.")
    parser.add_argument("--input", type=Path, required=True,
                        help="a directory, a single .jsonl/.ndjson/.csv/.json file, or a .zip of them")
    parser.add_argument("--out", type=Path, required=True, help="the DATA_DIR to write")
    parser.add_argument("--dry-run", action="store_true",
                        help="read at most 1000 rows per file, print the report, write nothing")
    parser.add_argument("--map", dest="mapping", type=Path,
                        help="a YAML file of {table: {canonical_column: source_key}} overrides")
    args = parser.parse_args()

    try:
        report = ingest(args.input, args.out, dry_run=args.dry_run, mapping_file=args.mapping)
    except ValueError as error:
        print(f"ingest failed: {error}", file=sys.stderr)
        return 2
    print(summarise(report))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
