"""Find a transaction by its reference number.

A bare reference matches transaction_reference_id. utr_number is used only when
the user says UTR, and the answer echoes the masked value.
"""
from __future__ import annotations

import re

from app.queries.common import clause, conditions

COLUMN = {"reference_id": "transaction_reference_id", "utr": "utr_number"}
_NUMBER_WITH_DECIMALS = re.compile(r"^(\d+)\.0+$")


def candidates(value: str) -> list[str]:
    """The forms a reference may arrive in.

    A reference is stored as text but is often all digits, so it comes back from
    a spreadsheet or a JSON number as 9891054276.0. Both forms are searched.
    """
    text = str(value).strip()
    forms = [text]
    decimal = _NUMBER_WITH_DECIMALS.match(text)
    if decimal:
        forms.append(decimal.group(1))
    elif text.isdigit():
        forms.append(f"{text}.0")
    return forms


def reference_condition(plan: dict) -> tuple[str, list[str]]:
    """The column to search and every form of the value worth searching for."""
    reference = (plan.get("filters") or {}).get("reference") or {}
    column = COLUMN.get(reference.get("column", "reference_id"), "transaction_reference_id")
    return column, candidates(reference.get("value", ""))


def build(plan: dict) -> tuple[str, list]:
    where, params = conditions(plan)
    column, forms = reference_condition(plan)
    where.append(f"{column} IN ({', '.join('?' * len(forms))})")
    params.extend(forms)
    return (f"SELECT 'total' AS key, round(coalesce(sum(transaction_amount), 0), 2) AS value, "
            f"count(*) AS count FROM transactions {clause(where)}"), params
