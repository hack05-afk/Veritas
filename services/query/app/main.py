"""FastAPI entry point for the Veritas query service."""
from __future__ import annotations

import time
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Query

from app import alternatives, anomaly, compute, crypto, db, evidence, leakguard, pulse, queries
from app.catalog import catalog
from app.meta import read_meta
from app.resolver import explain
from app.validate import plan_errors

# Refuse to serve rather than quietly serve plaintext. VERITAS_ENCRYPTION=off is
# the explicit local-development opt-out, and it warns on every start.
crypto.require_ready()

app = FastAPI(
    title="Veritas query service",
    version="1.0.0",
    description="Deterministic computation over the bank, account and transaction tables.",
)

RESOLVER_SAMPLES = 3
MAX_EVIDENCE_PAGE = 10000


@app.get("/health")
def health() -> dict[str, object]:
    """Readiness, loaded row count and Counterparty Resolver coverage."""
    meta = read_meta()
    return {
        "ok": True,
        "service": "query",
        "rows": meta.rows,
        "resolver_coverage": meta.resolver_coverage,
        "encryption": crypto.scheme(),
    }


@app.post("/query")
def run_query(plan: Any = Body(default=None)) -> dict:
    """Compute one QueryPlan. An invalid plan is a 422, never a 500."""
    errors = plan_errors(plan)
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    smuggled = leakguard.plan_uses_sensitive_column(plan)
    if smuggled:
        raise HTTPException(status_code=422,
                            detail=[f"{smuggled} is a sensitive column and is never queried or returned"])

    started = time.perf_counter()
    try:
        result = compute.primary(plan)
        readings = alternatives.compute_all(plan) if plan.get("run_alternatives") else []
        spikes = anomaly.counterparty_spikes(plan) if plan.get("run_anomaly") else []
    except db.DataNotLoaded as missing:
        raise HTTPException(status_code=503, detail=str(missing)) from missing
    except (KeyError, ValueError) as bad:
        raise HTTPException(status_code=422, detail=[str(bad)]) from bad

    ref = evidence.remember(plan)
    rows_behind = evidence.total(plan)
    meta = read_meta()
    return leakguard.clean({
        "primary": {"value": result["value"], "rows": result["rows"],
                    "row_count": rows_behind, "sql": result["sql"]},
        "alternatives": readings,
        "evidence": {"ref": ref, "page": 1, "page_size": evidence.PAGE_SIZE,
                     "total": rows_behind, "records": evidence.page(plan, 1)},
        "anomalies": spikes,
        "resolver_samples": _samples(plan),
        "data_bounds": {"min_date": meta.min_date, "max_date": meta.max_date},
        "timing_ms": round((time.perf_counter() - started) * 1000, 2),
    })


def _samples(plan: dict) -> list[dict]:
    """For counterparty questions, show how the top rows were decoded."""
    if plan.get("intent") not in queries.COUNTERPARTY_INTENTS:
        return []
    records = evidence.page(plan, 1)[:RESOLVER_SAMPLES]
    return [{"description": record["description"], "channel": record["channel"],
             "counterparty": record["counterparty"], "tokens": explain(record["description"])}
            for record in records]


@app.get("/evidence")
def get_evidence(ref: str, page: int = Query(1, ge=1, le=MAX_EVIDENCE_PAGE)) -> dict:
    """A further page of records for a previous result."""
    plan = evidence.recall(ref)
    if plan is None:
        raise HTTPException(status_code=404, detail="unknown or expired evidence ref")
    try:
        return leakguard.clean({"ref": ref, "page": page, "page_size": evidence.PAGE_SIZE,
                                "total": evidence.total(plan), "records": evidence.page(plan, page)})
    except db.DataNotLoaded as missing:
        raise HTTPException(status_code=503, detail=str(missing)) from missing


@app.get("/catalog")
def get_catalog() -> dict:
    """Entities, masked accounts, banks, channels, top counterparties and the data bounds."""
    try:
        return leakguard.clean(catalog())
    except db.DataNotLoaded as missing:
        raise HTTPException(status_code=503, detail=str(missing)) from missing


@app.get("/pulse")
def get_pulse(entity_id: str | None = None) -> dict:
    """Five things worth knowing about this entity, cached after the first call."""
    try:
        return leakguard.clean(pulse.pulse(entity_id))
    except db.DataNotLoaded as missing:
        raise HTTPException(status_code=503, detail=str(missing)) from missing
