"""Approved SQL templates. One module per intent; no user input is ever concatenated into SQL."""
from __future__ import annotations

from app.queries import (balance, common, counterparty_ranking, lookup_reference, period_compare,
                         receipts_total, reconciliation_balance, reconciliation_transfers,
                         spend_by_channel, spend_by_counterparty, spend_total, unreferenced)

BUILDERS = {
    "spend_total": spend_total.build,
    "spend_by_channel": spend_by_channel.build,
    "spend_by_counterparty": spend_by_counterparty.build,
    "counterparty_ranking": counterparty_ranking.build,
    "receipts_total": receipts_total.build,
    "balance": balance.build,
    "lookup_reference": lookup_reference.build,
    "period_compare": period_compare.build,
    "reconciliation_balance": reconciliation_balance.build,
    "reconciliation_transfers": reconciliation_transfers.build,
    "unreferenced": unreferenced.build,
}

# Intents whose result is always a set of rows, whatever the plan asks for.
ALWAYS_GROUPED = {"spend_by_channel", "counterparty_ranking", "balance", "period_compare",
                  "reconciliation_balance"}
# Intents that return one number unless the plan asks for a grouping.
GROUPABLE = {"spend_total", "receipts_total", "spend_by_counterparty"}
COUNTERPARTY_INTENTS = {"spend_by_counterparty", "counterparty_ranking"}


def is_grouped(plan: dict) -> bool:
    """Whether this plan's result is a set of rows rather than a single number."""
    intent = plan.get("intent")
    if intent in ALWAYS_GROUPED:
        return True
    return intent in GROUPABLE and plan.get("group_by", "none") in common.GROUP_COLUMN


def build(plan: dict) -> tuple[str, list]:
    """Build the SQL for a plan's intent."""
    intent = plan.get("intent")
    if intent not in BUILDERS:
        raise KeyError(intent)
    return BUILDERS[intent](plan)
