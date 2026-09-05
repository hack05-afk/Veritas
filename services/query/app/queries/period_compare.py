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
        # Each window is one row keyed by its own start day, so the two windows
        # cannot collide on a shared key when they are not calendar months.
        window = one["filters"]["period"]
        where, where_params = conditions(one, transaction_type=one.get("filters", {}).get("transaction_type", "debit"))
        parts.append("SELECT ? AS key, round(coalesce(sum(transaction_amount), 0), 2) AS value, "
                     f"count(*) AS count FROM transactions {clause(where)}")
        params.append(periods.parse_day(window["start"]).isoformat())
        params.extend(where_params)
    return f"SELECT * FROM ({' UNION ALL '.join(parts)}) ORDER BY key DESC", params
