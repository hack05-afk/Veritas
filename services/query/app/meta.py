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
    """The directory holding the Parquet files and meta.json."""
    return Path(os.environ.get("DATA_DIR", "services/query/data"))


def read_meta() -> Meta:
    """Return the loaded dataset's metadata, or empty defaults when nothing is loaded yet."""
    path = data_dir() / "meta.json"
    if not path.is_file():
        return Meta()
    raw: dict[str, Any] = json.loads(path.read_text())
    return Meta(**{k: v for k, v in raw.items() if k in Meta.model_fields})
