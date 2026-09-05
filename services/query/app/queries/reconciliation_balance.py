"""R1: available_balance against the net of an account's transactions.

The difference is reported as a gap, never as an error. A gap can be an opening
balance, a timing difference or a missing row, and only a person can say which.
"""
from __future__ import annotations

NET_SQL = """
SELECT a.account_id AS key,
       round(a.available_balance - coalesce(t.net, 0), 2) AS value,
       coalesce(t.n, 0) AS count
FROM accounts a
LEFT JOIN (
    SELECT account_id,
           sum(CASE WHEN transaction_type = 'credit' THEN transaction_amount ELSE -transaction_amount END) AS net,
           count(*) AS n
    FROM transactions GROUP BY account_id
) t ON t.account_id = a.account_id
{where}
ORDER BY abs(a.available_balance - coalesce(t.net, 0)) DESC, a.account_id
"""


def build(plan: dict) -> tuple[str, list]:
    filters = plan.get("filters") or {}
    where: list[str] = []
    params: list = []
    if filters.get("entity_id"):
        where.append("a.entity_id = ?")
        params.append(filters["entity_id"])
    account_ids = filters.get("account_ids")
    if account_ids:
        where.append(f"a.account_id IN ({', '.join('?' * len(account_ids))})")
        params.extend(account_ids)
    return NET_SQL.format(where=f"WHERE {' AND '.join(where)}" if where else ""), params
