"""DuckDB access to the loaded Parquet files.

The connection is in memory and reads the Parquet files through read_parquet,
so the data on disk is never written. Every query is a template from
app/queries with bound parameters; user text is never concatenated into SQL.
"""
from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path

import duckdb

from app.meta import data_dir

DEFAULT_MEMORY_LIMIT = "1GB"
_MEMORY_LIMIT = re.compile(r"^\d+(MB|GB)$")

VIEWS = {
    "transactions": "transactions.parquet",
    "accounts": "accounts.parquet",
    "banks": "banks.parquet",
}

# Written by the loader. A data directory from an older load will not have it,
# and the service falls back to reading the rows.
OPTIONAL_VIEWS = {"rollups": "rollups.parquet"}


def memory_limit() -> str:
    """The configured DuckDB memory limit, or the default when it is not a size."""
    configured = os.environ.get("DUCKDB_MEMORY_LIMIT", DEFAULT_MEMORY_LIMIT)
    return configured if _MEMORY_LIMIT.match(configured) else DEFAULT_MEMORY_LIMIT


class DataNotLoaded(RuntimeError):
    """Raised when the Parquet files are missing, so the caller can answer 503."""


@lru_cache(maxsize=4)
def _connect(directory: str, limit: str) -> duckdb.DuckDBPyConnection:
    base = Path(directory)
    missing = [name for name in VIEWS.values() if not (base / name).is_file()]
    if missing:
        raise DataNotLoaded(f"missing in {base}: {', '.join(missing)}. Run python -m app.loader --data {base}")
    con = duckdb.connect(database=":memory:")
    con.execute(f"SET memory_limit='{limit}'")
    for view, filename in {**VIEWS, **OPTIONAL_VIEWS}.items():
        if not (base / filename).is_file():
            continue
        path = str((base / filename).resolve()).replace("'", "''")
        con.execute(f"CREATE OR REPLACE VIEW {view} AS SELECT * FROM read_parquet('{path}')")
    return con


@lru_cache(maxsize=16)
def _view_columns(directory: str, view: str) -> frozenset[str]:
    return frozenset(row[0] for row in connection().execute(f"DESCRIBE {view}").fetchall())


def view_columns(view: str) -> frozenset[str]:
    """The columns a loaded view actually has, so an optional one can be used when present."""
    if view not in VIEWS and view not in OPTIONAL_VIEWS:
        raise KeyError(view)
    return _view_columns(str(data_dir().resolve()), view)


def has_rollups() -> bool:
    """Whether the pre-aggregated table is available for this dataset."""
    return (data_dir() / OPTIONAL_VIEWS["rollups"]).is_file()


def connection() -> duckdb.DuckDBPyConnection:
    """A connection over the currently configured DATA_DIR."""
    return _connect(str(data_dir().resolve()), memory_limit())


def rows(sql: str, params: list | None = None) -> list[tuple]:
    """Run one approved template and return its rows."""
    return connection().execute(sql, params or []).fetchall()


def columns(sql: str, params: list | None = None) -> tuple[list[tuple], list[str]]:
    """Run one approved template and return its rows and column names."""
    cursor = connection().execute(sql, params or [])
    return cursor.fetchall(), [d[0] for d in cursor.description]
