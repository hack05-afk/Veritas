"""Reads the dataset metadata written by the loader."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel


class Meta(BaseModel):
    """Row counts and date bounds for the currently loaded dataset."""

    rows: int = 0
    accounts: int = 0
    banks: int = 0
    min_date: str | None = None
    max_date: str | None = None
    resolver_coverage: float | None = None


def data_dir() -> Path:
    """The directory holding the Parquet files and meta.json.

    The default is resolved from this file rather than the working directory,
    so the service finds its data whichever directory it was started from, and
    falls back to the synthetic set when no real data has been loaded.
    """
    configured = os.environ.get("DATA_DIR")
    if configured:
        return Path(configured)
    base = Path(__file__).resolve().parents[1] / "data"
    synthetic = base / "test_100k"
    return synthetic if (synthetic / "meta.json").is_file() else base


def read_meta() -> Meta:
    """Return the loaded dataset's metadata, or empty defaults when nothing is loaded yet."""
    path = data_dir() / "meta.json"
    if not path.is_file():
        return Meta()
    raw: dict[str, Any] = json.loads(path.read_text())
    return Meta(**{k: v for k, v in raw.items() if k in Meta.model_fields})
