"""Answering aggregate questions from pre-aggregated monthly buckets.

The rollup table holds one row per month, account, direction, channel and
counterparty. Its size is bounded by how many distinct combinations exist, not
by how many transactions there are, so "what did we spend last month" costs the
same over twenty million rows as over one hundred thousand.

A rollup can only answer a question whose period covers whole months. Anything
narrower, or anything that needs a single row, falls back to the ledger itself.
"""
from __future__ import annotations

from datetime import date

from app import periods
from app.queries.common import TRANSFER_CHANNELS, group_limit

# Intents whose answer is a sum or a count over groups, and nothing else.
SUPPORTED = {"spend_total", "spend_by_channel", "spend_by_counterparty",
             "counterparty_ranking", "receipts_total"}

GROUP_COLUMN = {
    "channel": "channel",
    "counterparty": "counterparty",
    "account": "account_id",
    "month": "month",
}


def _whole_months(period: dict | None) -> bool:
    """Whether the period starts on the first of a month and ends on a month end."""
    if not period or not period.get("start") or not period.get("end"):
        return True
    start = periods.parse_day(period["start"])
    end = periods.parse_day(period["end"])
    return start.day == 1 and end == periods.month_end(end)


def can_use(plan: dict) -> bool:
    """Whether this plan can be answered from the rollup table."""
    if plan.get("intent") not in SUPPORTED:
        return False
    filters = plan.get("filters") or {}
    if filters.get("reference"):
        return False
    return _whole_months(filters.get("period"))


def _conditions(plan: dict, *, transaction_type: str, transfers_only: bool) -> tuple[list[str], list]:
    filters = plan.get("filters") or {}
    interpretation = plan.get("interpretation") or {}
    where: list[str] = []
    params: list = []

    if transaction_type in ("debit", "credit"):
        where.append("transaction_type = ?")
        params.append(transaction_type)

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
        column = "counterparty_family" if counterparty.get("match") == "family" else "counterparty"
        name = str(counterparty.get("canonical", "")).upper()
        value = " ".join(name.split()[:2]) if counterparty.get("match") == "family" else name
        where.append(f"{column} = ?")
        params.append(value)

    period = filters.get("period")
    if period and period.get("start"):
        start = periods.parse_day(period["start"])
        end = periods.parse_day(period["end"])
        where.append("month BETWEEN ? AND ?")
        params.extend([start.replace(day=1).isoformat(), date(end.year, end.month, 1).isoformat()])

    return where, params


def build(plan: dict) -> tuple[str, list]:
    """The rollup query for a plan. Only call when can_use is true."""
    intent = plan.get("intent")
    net = (plan.get("interpretation") or {}).get("spend") == "net" and intent != "receipts_total"
    transfers_only = intent in ("spend_by_counterparty", "counterparty_ranking")
    kind = "credit" if intent == "receipts_total" else ("both" if net else "debit")

    where, params = _conditions(plan, transaction_type=kind, transfers_only=transfers_only)
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    amount = ("sum(CASE WHEN transaction_type = 'debit' THEN total ELSE -total END)"
              if net else "sum(total)")

    group_by = plan.get("group_by", "none")
    if intent == "spend_by_channel":
        group_by = "channel"
    elif intent == "counterparty_ranking":
        group_by = "counterparty"

    if group_by in GROUP_COLUMN:
        column = GROUP_COLUMN[group_by]
        if intent == "counterparty_ranking":
            direction = "ASC" if plan.get("sort") == "asc" else "DESC"
            order = f"ORDER BY value {direction}, key ASC"
            limit = int(plan.get("limit") or 10)
        else:
            order = "ORDER BY value DESC"
            limit = group_limit(plan)
        sql = (f"SELECT {column} AS key, round({amount}, 2) AS value, sum(n) AS count "
               f"FROM rollups {clause} GROUP BY key {order} LIMIT ?")
        return sql, params + [limit]

    return (f"SELECT 'total' AS key, round(coalesce({amount}, 0), 2) AS value, "
            f"coalesce(sum(n), 0) AS count FROM rollups {clause}"), params
