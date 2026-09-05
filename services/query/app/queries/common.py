"""Filter fragments shared by the intent templates.

Everything here returns a SQL fragment plus its bound parameters. No value from
a plan is ever put into a SQL string.
"""
from __future__ import annotations

from app import periods

TRANSFER_CHANNELS = ("NEFT", "IMPS", "UPI", "RTGS", "FT")

# The column each group_by aggregates on. An intent that offers no grouping
# simply never looks here.
GROUP_COLUMN = {
    "channel": "channel",
    "counterparty": "coalesce(counterparty_canonical, 'UNKNOWN')",
    "account": "account_id",
    "month": "strftime(date_trunc('month', transaction_date), '%Y-%m-01')",
}
UNKNOWN = "UNKNOWN"

# How many groups a grouped answer returns when the plan does not say.
DEFAULT_GROUP_LIMIT = 200


def group_limit(plan: dict) -> int:
    """The row cap for a grouped result, so a wide grouping cannot run away."""
    limit = plan.get("limit")
    return int(limit) if limit else DEFAULT_GROUP_LIMIT


def counterparty_key(counterparty: dict) -> tuple[str, str]:
    """The column to match on and the value to match, for exact or family matching."""
    name = str(counterparty.get("canonical", "")).upper()
    if counterparty.get("match") == "family":
        return "counterparty_family", " ".join(name.split()[:2])
    return "counterparty_canonical", name


def conditions(plan: dict, *, transaction_type: str | None = None,
               transfers_only: bool = False) -> tuple[list[str], list]:
    """Build the WHERE fragments for a plan. Returns (fragments, params)."""
    filters = plan.get("filters") or {}
    interpretation = plan.get("interpretation") or {}
    where: list[str] = []
    params: list = []

    kind = transaction_type or filters.get("transaction_type") or "both"
    if kind in ("debit", "credit"):
        where.append("transaction_type = ?")
        params.append(kind)

    if filters.get("entity_id"):
        where.append("entity_id = ?")
        params.append(filters["entity_id"])

    account_ids = filters.get("account_ids")
    if account_ids:
        where.append(f"account_id IN ({', '.join('?' * len(account_ids))})")
        params.extend(account_ids)

    channels = filters.get("channels")
    if transfers_only:
        channels = [c for c in (channels or TRANSFER_CHANNELS) if c in TRANSFER_CHANNELS] or list(TRANSFER_CHANNELS)
    if channels:
        where.append(f"channel IN ({', '.join('?' * len(channels))})")
        params.extend(channels)

    if interpretation.get("charges") == "exclude":
        where.append("channel <> 'Charges'")

    counterparty = filters.get("counterparty")
    if counterparty:
        column, value = counterparty_key(counterparty)
        where.append(f"coalesce({column}, '{UNKNOWN}') = ?")
        params.append(value)

    window = periods.bounds(filters.get("period"))
    if window:
        where.append("transaction_date BETWEEN ? AND ?")
        params.extend(window)

    return where, params


def clause(where: list[str]) -> str:
    return f"WHERE {' AND '.join(where)}" if where else ""
