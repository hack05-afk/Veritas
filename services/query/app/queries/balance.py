"""Available balance, per account or summed for the entity."""
from __future__ import annotations


def build(plan: dict) -> tuple[str, list]:
    filters = plan.get("filters") or {}
    where: list[str] = []
    params: list = []
    if filters.get("entity_id"):
        where.append("entity_id = ?")
        params.append(filters["entity_id"])
    account_ids = filters.get("account_ids")
    if account_ids:
        where.append(f"account_id IN ({', '.join('?' * len(account_ids))})")
        params.extend(account_ids)
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    if plan.get("group_by") == "account":
        return (f"SELECT account_id AS key, round(available_balance, 2) AS value, 1 AS count "
                f"FROM accounts {clause} ORDER BY value DESC"), params
    return (f"SELECT coalesce(entity_id, 'all') AS key, round(sum(available_balance), 2) AS value, "
            f"count(*) AS count FROM accounts {clause} GROUP BY key ORDER BY value DESC"), params
