"""FastAPI entry point for the TBX query service."""
from __future__ import annotations

from fastapi import FastAPI

from app.meta import read_meta

app = FastAPI(
    title="TBX query service",
    version="1.0.0",
    description="Deterministic computation over the bank, account and transaction tables.",
)


@app.get("/health")
def health() -> dict[str, object]:
    """Readiness, loaded row count and Counterparty Resolver coverage."""
    meta = read_meta()
    return {
        "ok": True,
        "service": "query",
        "rows": meta.rows,
        "resolver_coverage": meta.resolver_coverage,
    }
