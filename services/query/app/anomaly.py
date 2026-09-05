"""Proactive checks over a computed period.

A spike is judged against the counterparty's own history, not against other
counterparties, so a consistently large supplier is never flagged.
"""
from __future__ import annotations

import copy

from app import db, periods
from app.queries.common import clause, conditions

SPIKE_RATIO = 2.5
BASELINE_PERIODS = 3
MIN_NON_ZERO_BASELINES = 2

TOTALS_SQL = ("SELECT coalesce(counterparty_canonical, 'UNKNOWN') AS key, "
              "sum(transaction_amount) AS value FROM transactions {where} GROUP BY key")


def _totals(plan: dict, period: dict) -> dict[str, float]:
    """Debit totals per counterparty for one window, under the plan's own filters."""
    scoped = copy.deepcopy(plan)
    scoped["filters"]["period"] = period
    transfers_only = plan.get("intent") in ("spend_by_counterparty", "counterparty_ranking")
    where, params = conditions(scoped, transaction_type="debit", transfers_only=transfers_only)
    return {key: float(value or 0) for key, value in db.rows(TOTALS_SQL.format(where=clause(where)), params)}


def counterparty_spikes(plan: dict) -> list[dict]:
    """Counterparties whose spend in this period stands clear of their own recent history."""
    period = (plan.get("filters") or {}).get("period")
    if not period or not period.get("start"):
        return []

    latest = _totals(plan, period)
    if not latest:
        return []

    baselines: list[dict[str, float]] = []
    window = period
    for _ in range(BASELINE_PERIODS):
        window = periods.previous(window)
        baselines.append(_totals(plan, window))

    found: list[dict] = []
    for subject, current in latest.items():
        history = [baseline.get(subject, 0.0) for baseline in baselines]
        non_zero = sum(1 for amount in history if amount > 0)
        mean = sum(history) / len(history)
        if non_zero < MIN_NON_ZERO_BASELINES or mean <= 0:
            continue
        ratio = current / mean
        if ratio >= SPIKE_RATIO:
            found.append({"kind": "counterparty_spike", "subject": subject,
                          "ratio": round(ratio, 2), "baseline_periods": non_zero})
    return sorted(found, key=lambda item: item["ratio"], reverse=True)
