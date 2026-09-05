"""FastAPI entry point for the Veritas query service."""
from __future__ import annotations

import time
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Query

from app import db, evidence, queries
from app.catalog import catalog
from app.meta import read_meta
from app.resolver import explain
from app.validate import plan_errors

app = FastAPI(
    title="Veritas query service",
    version="1.0.0",
    description="Deterministic computation over the bank, account and transaction tables.",
)

RESOLVER_SAMPLES = 3


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


@app.post("/query")
def run_query(plan: Any = Body(default=None)) -> dict:
    """Compute one QueryPlan. An invalid plan is a 422, never a 500."""
    errors = plan_errors(plan)
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    started = time.perf_counter()
    try:
        sql, params = queries.build(plan)
        rows = db.rows(sql, params)
    except db.DataNotLoaded as missing:
        raise HTTPException(status_code=503, detail=str(missing)) from missing
    except (KeyError, ValueError) as bad:
        raise HTTPException(status_code=422, detail=[str(bad)]) from bad

    grouped = queries.is_grouped(plan)
    limit = int(plan.get("limit") or 10)
    result_rows = [{"key": str(key), "value": round(float(value or 0), 2), "count": int(count)}
                   for key, value, count in rows]
    if plan["intent"] == "period_compare":
        result_rows = result_rows[:max(2, limit)]

    if grouped:
        primary_value = result_rows[0]["value"] if plan["intent"] == "period_compare" \
            else round(sum(row["value"] for row in result_rows), 2)
    else:
        primary_value = result_rows[0]["value"] if result_rows else 0.0
        result_rows = []

    ref = evidence.remember(plan)
    meta = read_meta()
    return {
        "primary": {"value": primary_value, "rows": result_rows,
                    "row_count": evidence.total(plan), "sql": " ".join(sql.split())},
        "alternatives": [],
        "evidence": {"ref": ref, "page": 1, "page_size": evidence.PAGE_SIZE,
                     "total": evidence.total(plan), "records": evidence.page(plan, 1)},
        "anomalies": [],
        "resolver_samples": _samples(plan),
        "data_bounds": {"min_date": meta.min_date, "max_date": meta.max_date},
        "timing_ms": round((time.perf_counter() - started) * 1000, 2),
    }


def _samples(plan: dict) -> list[dict]:
    """For counterparty questions, show how the top rows were decoded."""
    if plan.get("intent") not in queries.COUNTERPARTY_INTENTS:
        return []
    records = evidence.page(plan, 1)[:RESOLVER_SAMPLES]
    return [{"description": record["description"], "channel": record["channel"],
             "counterparty": record["counterparty"], "tokens": explain(record["description"])}
            for record in records]


@app.get("/evidence")
def get_evidence(ref: str, page: int = Query(1, ge=1)) -> dict:
    """A further page of records for a previous result."""
    plan = evidence.recall(ref)
    if plan is None:
        raise HTTPException(status_code=404, detail="unknown or expired evidence ref")
    return {"ref": ref, "page": page, "page_size": evidence.PAGE_SIZE,
            "total": evidence.total(plan), "records": evidence.page(plan, page)}


@app.get("/catalog")
def get_catalog() -> dict:
    """Entities, masked accounts, banks, channels, top counterparties and the data bounds."""
    try:
        return catalog()
    except db.DataNotLoaded as missing:
        raise HTTPException(status_code=503, detail=str(missing)) from missing
