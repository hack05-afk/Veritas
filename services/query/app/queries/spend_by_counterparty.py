"""Spend paid to a named counterparty. Payouts only: charges and cheques are not payouts."""
from __future__ import annotations

from app.queries.common import GROUP_COLUMN, clause, conditions


def build(plan: dict) -> tuple[str, list]:
    where, params = conditions(plan, transaction_type="debit", transfers_only=True)
    group_by = plan.get("group_by", "none")
    if group_by in GROUP_COLUMN:
        return (f"SELECT {GROUP_COLUMN[group_by]} AS key, round(sum(transaction_amount), 2) AS value, "
                f"count(*) AS count FROM transactions {clause(where)} GROUP BY key ORDER BY value DESC"), params
    return (f"SELECT 'total' AS key, round(coalesce(sum(transaction_amount), 0), 2) AS value, "
            f"count(*) AS count FROM transactions {clause(where)}"), params
