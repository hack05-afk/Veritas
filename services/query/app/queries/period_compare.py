"""One period beside the one before it, of the same shape and length."""
from __future__ import annotations

import copy

from app import periods
from app.queries.common import clause, conditions


def build(plan: dict) -> tuple[str, list]:
    period = (plan.get("filters") or {}).get("period")
    if not period:
        raise ValueError("period_compare needs a period to compare against")

    earlier = copy.deepcopy(plan)
    earlier.setdefault("filters", {})["period"] = periods.previous(period)

    parts: list[str] = []
    params: list = []
    for one in (plan, earlier):
        where, where_params = conditions(one, transaction_type=one.get("filters", {}).get("transaction_type", "debit"))
        parts.append("SELECT strftime(date_trunc('month', transaction_date), '%Y-%m-01') AS key, "
                     "round(sum(transaction_amount), 2) AS value, count(*) AS count "
                     f"FROM transactions {clause(where)} GROUP BY key")
        params.extend(where_params)
    return f"SELECT * FROM ({' UNION ALL '.join(parts)}) ORDER BY key DESC", params
