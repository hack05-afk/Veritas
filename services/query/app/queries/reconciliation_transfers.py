"""R2: transfer debits with no answering credit elsewhere in the same entity.

A matched pair is a debit in one account and a credit in another account of the
same entity, for the same amount, within a day. What is left is listed largest
first, because that is the order a person would work through it in.
"""
from __future__ import annotations

from app.queries.common import TRANSFER_CHANNELS, clause, conditions

UNMATCHED = """
SELECT d.* FROM ({debits}) d
WHERE NOT EXISTS (
    SELECT 1 FROM transactions c
    WHERE c.transaction_type = 'credit'
      AND c.entity_id = d.entity_id
      AND c.account_id <> d.account_id
      AND c.transaction_amount = d.transaction_amount
      AND c.transaction_date BETWEEN d.transaction_date - INTERVAL 1 DAY
                                AND d.transaction_date + INTERVAL 1 DAY
)
"""


def unmatched_sql(plan: dict) -> tuple[str, list]:
    """The transfer debits left unmatched, as a full SELECT."""
    where, params = conditions(plan, transaction_type="debit")
    where.append(f"channel IN ({', '.join('?' * len(TRANSFER_CHANNELS))})")
    params.extend(TRANSFER_CHANNELS)
    debits = f"SELECT * FROM transactions {clause(where)}"
    return UNMATCHED.format(debits=debits), params


def build(plan: dict) -> tuple[str, list]:
    sql, params = unmatched_sql(plan)
    return f"SELECT 'total' AS key, count(*) AS value, count(*) AS count FROM ({sql})", params
