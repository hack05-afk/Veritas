"""The other reasonable readings of the same question.

One axis is flipped at a time and the primary is recomputed, so every
alternative is comparable with the number it sits beside.
"""
from __future__ import annotations

import copy

from app import compute, periods

# Intents whose number is about money going out, so the spend and charges axes apply.
SPEND_INTENTS = {"spend_total", "spend_by_channel", "spend_by_counterparty",
                 "counterparty_ranking", "period_compare"}


def _flip_spend(plan: dict) -> dict:
    plan.setdefault("interpretation", {})["spend"] = "net"
    return plan


def _flip_charges(plan: dict) -> dict:
    plan.setdefault("interpretation", {})["charges"] = "exclude"
    return plan


def _flip_counterparty(plan: dict) -> dict:
    plan["filters"]["counterparty"]["match"] = "family"
    return plan


def _flip_period(plan: dict) -> dict:
    period = plan["filters"]["period"]
    plan["filters"]["period"] = (periods.as_calendar(period) if period.get("kind") == "trailing"
                                 else periods.as_trailing(period))
    return plan


def _flip_scope(plan: dict) -> dict:
    plan.setdefault("interpretation", {})["scope"] = "account"
    return plan


def _flip_reference(plan: dict) -> dict:
    plan["filters"]["reference"]["column"] = "utr"
    return plan


def applicable(plan: dict) -> list[tuple[str, str, object]]:
    """The axes worth flipping for this plan, with the reading each flip produces."""
    filters = plan.get("filters") or {}
    interpretation = plan.get("interpretation") or {}
    intent = plan.get("intent")
    axes: list[tuple[str, str, object]] = []

    if intent in SPEND_INTENTS:
        if interpretation.get("spend", "debits") == "debits":
            axes.append(("spend", "net", _flip_spend))
        if interpretation.get("charges", "include") == "include":
            axes.append(("charges", "exclude", _flip_charges))
    if filters.get("counterparty") and filters["counterparty"].get("match") == "exact":
        axes.append(("counterparty_match", "family", _flip_counterparty))
    period = filters.get("period")
    if period and period.get("start"):
        reading = "calendar" if period.get("kind") == "trailing" else "trailing"
        axes.append(("period", reading, _flip_period))
    if filters.get("account_ids") and interpretation.get("scope", "entity") == "entity":
        axes.append(("scope", "account", _flip_scope))
    if intent == "lookup_reference" and (filters.get("reference") or {}).get("column") == "reference_id":
        axes.append(("reference", "utr", _flip_reference))
    return axes


def compute_all(plan: dict) -> list[dict]:
    """Recompute the answer under each applicable reading."""
    readings = []
    for axis, reading, flip in applicable(plan):
        flipped = flip(copy.deepcopy(plan))
        flipped["run_alternatives"] = False
        flipped["run_anomaly"] = False
        readings.append({"axis": axis, "reading": reading, "value": compute.primary(flipped)["value"]})
    return readings
