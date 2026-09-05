"""R2: transfer debits with no answering credit elsewhere in the same entity.

A matched pair is a debit in one account and a credit in another account of the
same entity, for the same amount, within a day. What is left is listed largest
first, because that is the order a person would work through it in.
"""
from __future__ import annotations

from app.queries.common import TRANSFER_CHANNELS, clause, conditions

# Both sides are ranked inside the entity and amount they would pair on, so a
# credit answers at most one debit and the whole pairing is one pass over the
# table rather than a lookup for every debit.
RANK = ("row_number() OVER (PARTITION BY entity_id, transaction_amount "
        "ORDER BY transaction_date, transaction_id) AS pair_rank")

UNMATCHED = f"""
WITH ranked_debits AS (
    SELECT *, {RANK} FROM ({{debits}})
),
ranked_credits AS (
    SELECT entity_id, account_id, transaction_amount, transaction_date, {RANK}
    FROM transactions WHERE transaction_type = 'credit'
)
SELECT d.* EXCLUDE (pair_rank)
FROM ranked_debits d
LEFT JOIN ranked_credits c
       ON c.entity_id = d.entity_id
      AND c.transaction_amount = d.transaction_amount
      AND c.pair_rank = d.pair_rank
      AND c.account_id <> d.account_id
      AND c.transaction_date BETWEEN d.transaction_date - INTERVAL 1 DAY
                                AND d.transaction_date + INTERVAL 1 DAY
WHERE c.entity_id IS NULL
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
