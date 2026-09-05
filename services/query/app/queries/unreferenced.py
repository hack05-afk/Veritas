"""R3: transactions that are still unreconciled.

When the delivered dataset carries a reconciliation status, that column is the
answer. When it does not, the derived check stands in: a row carrying neither a
reference number nor a UTR cannot be traced to anything.
"""
from __future__ import annotations

from app import db
from app.queries.common import clause, conditions

NO_REFERENCE = "transaction_reference_id IS NULL AND utr_number IS NULL"

STATUS_COLUMN = "reconciliation_status"

# Every spelling of "this row is settled" seen in bank and payout exports.
# A row with any other status, or none, is counted as still unreconciled.
SETTLED = ("reconciled", "matched", "settled", "cleared", "closed", "complete",
           "completed", "success", "ok", "yes", "true", "y", "1")


def unreconciled() -> str:
    """The SQL fragment for an unreconciled row, from the column when there is one."""
    if STATUS_COLUMN not in db.view_columns("transactions"):
        return NO_REFERENCE
    values = ", ".join(f"'{value}'" for value in SETTLED)
    return f"({STATUS_COLUMN} IS NULL OR lower(trim({STATUS_COLUMN})) NOT IN ({values}))"


def build(plan: dict) -> tuple[str, list]:
    where, params = conditions(plan)
    where.append(unreconciled())
    return (f"SELECT 'total' AS key, count(*) AS value, count(*) AS count "
            f"FROM transactions {clause(where)}"), params
