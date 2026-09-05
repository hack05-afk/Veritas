"""Running one plan and shaping its primary result.

Alternatives re-run the same code with one axis flipped, so the primary and
every alternative are computed by exactly the same path.
"""
from __future__ import annotations

from app import db, queries

# Intents whose headline number is the sum of the absolute row values, because
# a gap of minus five thousand is as much of a gap as plus five thousand.
ABSOLUTE_SUM = {"reconciliation_balance"}


def primary(plan: dict) -> dict:
    """The value, the rows behind it and the SQL that produced them."""
    sql, params = queries.build(plan)
    rows = [{"key": str(key), "value": round(float(value or 0), 2), "count": int(count)}
            for key, value, count in db.rows(sql, params)]

    intent = plan.get("intent")
    if intent == "period_compare":
        rows = rows[:max(2, int(plan.get("limit") or 2))]

    if queries.is_grouped(plan):
        if intent == "period_compare":
            value = rows[0]["value"] if rows else 0.0
        elif intent in ABSOLUTE_SUM:
            value = round(sum(abs(row["value"]) for row in rows), 2)
        else:
            value = round(sum(row["value"] for row in rows), 2)
    else:
        value = rows[0]["value"] if rows else 0.0
        rows = []

    return {"value": value, "rows": rows, "sql": " ".join(sql.split())}
