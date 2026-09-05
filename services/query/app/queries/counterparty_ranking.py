"""Counterparties ranked by the amount paid to them over a period."""
from __future__ import annotations

from app.queries.common import clause, conditions


def build(plan: dict) -> tuple[str, list]:
    where, params = conditions(plan, transaction_type="debit", transfers_only=True)
    limit = int(plan.get("limit") or 10)
    direction = "ASC" if plan.get("sort") == "asc" else "DESC"
    return (f"SELECT coalesce(counterparty_canonical, 'UNKNOWN') AS key, "
            f"round(sum(transaction_amount), 2) AS value, count(*) AS count "
            f"FROM transactions {clause(where)} GROUP BY key "
            f"ORDER BY value {direction}, key ASC LIMIT ?"), params + [limit]
