"""Money received: the sum of credits over a period."""
from __future__ import annotations

from app.queries.common import GROUP_COLUMN, clause, conditions, group_limit


def build(plan: dict) -> tuple[str, list]:
    where, params = conditions(plan, transaction_type="credit")
    group_by = plan.get("group_by", "none")
    if group_by in GROUP_COLUMN:
        column = GROUP_COLUMN[group_by]
        return (f"SELECT {column} AS key, round(sum(transaction_amount), 2) AS value, count(*) AS count "
                f"FROM transactions {clause(where)} GROUP BY key ORDER BY value DESC LIMIT ?"
                ), params + [group_limit(plan)]
    return (f"SELECT 'total' AS key, round(coalesce(sum(transaction_amount), 0), 2) AS value, "
            f"count(*) AS count FROM transactions {clause(where)}"), params
