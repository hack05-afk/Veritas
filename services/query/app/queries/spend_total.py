"""Total spend for a period. Spend is debits by default, net of credits as an alternative."""
from __future__ import annotations

from app.queries.common import GROUP_COLUMN, clause, conditions


def build(plan: dict) -> tuple[str, list]:
    """Sum the debits in the period, grouped as the plan asks."""
    net = (plan.get("interpretation") or {}).get("spend") == "net"
    group_by = plan.get("group_by", "none")
    amount = ("sum(CASE WHEN transaction_type = 'debit' THEN transaction_amount ELSE -transaction_amount END)"
              if net else "sum(transaction_amount)")
    where, params = conditions(plan, transaction_type="both" if net else "debit")
    if group_by in GROUP_COLUMN:
        column = GROUP_COLUMN[group_by]
        return (f"SELECT {column} AS key, round({amount}, 2) AS value, count(*) AS count "
                f"FROM transactions {clause(where)} GROUP BY key ORDER BY value DESC"), params
    return (f"SELECT 'total' AS key, round(coalesce({amount}, 0), 2) AS value, count(*) AS count "
            f"FROM transactions {clause(where)}"), params
