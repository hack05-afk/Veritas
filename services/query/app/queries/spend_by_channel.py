"""Spend split by the channel the Counterparty Resolver decoded."""
from __future__ import annotations

from app.queries.common import clause, conditions


def build(plan: dict) -> tuple[str, list]:
    where, params = conditions(plan, transaction_type="debit")
    return (f"SELECT channel AS key, round(sum(transaction_amount), 2) AS value, count(*) AS count "
            f"FROM transactions {clause(where)} GROUP BY channel ORDER BY value DESC"), params
