"""R3: rows carrying neither a reference number nor a UTR, so nothing can be traced."""
from __future__ import annotations

from app.queries.common import clause, conditions

NO_REFERENCE = "transaction_reference_id IS NULL AND utr_number IS NULL"


def build(plan: dict) -> tuple[str, list]:
    where, params = conditions(plan)
    where.append(NO_REFERENCE)
    return (f"SELECT 'total' AS key, count(*) AS value, count(*) AS count "
            f"FROM transactions {clause(where)}"), params
