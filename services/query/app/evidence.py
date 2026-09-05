"""Row level evidence for a result, paginated and masked.

The plan behind a result is kept in a small cache so a later page can be
recomputed without the caller resending it.
"""
from __future__ import annotations

import hashlib
import json
from collections import OrderedDict

from app import db
from app.masking import mask, mask_narration
from app.queries import lookup_reference, reconciliation_transfers, unreferenced
from app.queries.common import clause, conditions

PAGE_SIZE = 50
CACHE_LIMIT = 200

# Intents whose answer comes from the account table, so there are no rows behind it.
NO_ROW_EVIDENCE = {"balance", "reconciliation_balance"}

# Unmatched transfers are read largest first: that is the order a person works
# through a reconciliation in. Everything else reads newest first.
ORDER_BY = {"reconciliation_transfers": "t.transaction_amount DESC, t.transaction_id"}
DEFAULT_ORDER = "t.transaction_date DESC, t.transaction_id"

_plans: OrderedDict[str, dict] = OrderedDict()

RECORD_SQL = """
SELECT t.transaction_id, t.transaction_date, t.transaction_type, t.transaction_amount,
       t.channel, t.counterparty_canonical, a.account_number, t.transaction_reference_id,
       t.utr_number, t.description, t.confidence
FROM ({inner}) t
LEFT JOIN accounts a ON a.account_id = t.account_id
ORDER BY {order}
LIMIT ? OFFSET ?
"""


def remember(plan: dict) -> str:
    """Store a plan under a short id and return it."""
    canonical = json.dumps(plan, sort_keys=True, separators=(",", ":"))
    ref = hashlib.blake2s(canonical.encode(), digest_size=6).hexdigest()
    _plans[ref] = plan
    _plans.move_to_end(ref)
    while len(_plans) > CACHE_LIMIT:
        _plans.popitem(last=False)
    return ref


def recall(ref: str) -> dict | None:
    plan = _plans.get(ref)
    if plan is not None:
        _plans.move_to_end(ref)
    return plan


def _inner(plan: dict) -> tuple[str, list]:
    """A SELECT over the rows the answer was computed from."""
    intent = plan.get("intent")
    if intent == "reconciliation_transfers":
        return reconciliation_transfers.unmatched_sql(plan)

    transfers_only = intent in ("spend_by_counterparty", "counterparty_ranking")
    kind = {"receipts_total": "credit", "lookup_reference": "both", "unreferenced": "both"}.get(intent)
    if kind is None:
        kind = "both" if (plan.get("interpretation") or {}).get("spend") == "net" else "debit"

    if intent == "lookup_reference":
        where, params = conditions(plan)
        column, forms = lookup_reference.reference_condition(plan)
        where.append(f"{column} IN ({', '.join('?' * len(forms))})")
        params.extend(forms)
    else:
        where, params = conditions(plan, transaction_type=kind, transfers_only=transfers_only)
        if intent == "unreferenced":
            where.append(unreferenced.NO_REFERENCE)
    return f"SELECT * FROM transactions {clause(where)}", params


def total(plan: dict) -> int:
    """How many rows sit behind this answer."""
    if plan.get("intent") in NO_ROW_EVIDENCE:
        return 0
    inner, params = _inner(plan)
    return int(db.rows(f"SELECT count(*) FROM ({inner})", params)[0][0])


def page(plan: dict, number: int = 1) -> list[dict]:
    """One page of masked records."""
    if plan.get("intent") in NO_ROW_EVIDENCE:
        return []
    inner, params = _inner(plan)
    sql = RECORD_SQL.format(inner=inner, order=ORDER_BY.get(plan.get("intent"), DEFAULT_ORDER))
    rows = db.rows(sql, params + [PAGE_SIZE, max(0, (number - 1) * PAGE_SIZE)])
    return [_record(row) for row in rows]


def _record(row: tuple) -> dict:
    (transaction_id, when, kind, amount, channel, counterparty,
     account_number, reference_id, utr, description, confidence) = row
    return {
        "transaction_id": transaction_id,
        "date": when.isoformat(),
        "type": kind,
        "amount": round(float(amount), 2),
        "channel": channel,
        "counterparty": counterparty,
        "account_masked": mask(account_number),
        "reference_id": None if reference_id is None else str(reference_id),
        "utr_masked": mask(utr),
        "description": mask_narration(description),
        "parse_confidence": float(confidence),
    }
