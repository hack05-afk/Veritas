"""Ledger Pulse: five things worth knowing before you ask anything.

Each tile carries the plain-language question that reproduces it, so a tile is
a shortcut into the conversation rather than a dead end.
"""
from __future__ import annotations

from app import anomaly, db, periods
from app.masking import mask
from app.meta import read_meta

_cache: dict[tuple[str, str | None], dict] = {}

QUESTIONS = {
    "accounts": "How many accounts do we have, and with which banks?",
    "balance_check": "Does our available balance match the transactions?",
    "largest_debits": "What were our largest payments last month?",
    "unreferenced": "How many transactions have no reference number or UTR?",
    "spikes": "Which counterparty did we pay much more than usual last month?",
}


def _entity_clause(entity_id: str | None, column: str = "entity_id") -> tuple[str, list]:
    return (f"WHERE {column} = ?", [entity_id]) if entity_id else ("", [])


def _accounts(entity_id: str | None) -> dict:
    where, params = _entity_clause(entity_id, "a.entity_id")
    rows = db.rows(f"SELECT count(*), list(DISTINCT b.bank_name) FROM accounts a "
                   f"LEFT JOIN banks b ON b.bank_code = a.bank_code {where}", params)
    count, banks = rows[0]
    return {"count": int(count), "banks": sorted(banks or []), "question": QUESTIONS["accounts"]}


def _balance_check(entity_id: str | None) -> dict:
    where, params = _entity_clause(entity_id, "a.entity_id")
    rows = db.rows(
        "SELECT a.account_number, round(a.available_balance - coalesce(t.net, 0), 2) AS gap FROM accounts a "
        "LEFT JOIN (SELECT account_id, sum(CASE WHEN transaction_type = 'credit' THEN transaction_amount "
        "ELSE -transaction_amount END) AS net FROM transactions GROUP BY account_id) t "
        f"ON t.account_id = a.account_id {where} "
        "ORDER BY abs(a.available_balance - coalesce(t.net, 0)) DESC", params)
    return {"accounts": [{"account_masked": mask(number), "gap": float(gap)}
                         for number, gap in rows if abs(float(gap)) > 0.005],
            "question": QUESTIONS["balance_check"]}


def _largest_debits(entity_id: str | None, month: dict) -> dict:
    where, params = _entity_clause(entity_id)
    window = periods.bounds(month)
    clause = f"{where} AND " if where else "WHERE "
    rows = db.rows(
        "SELECT transaction_amount, counterparty_canonical, transaction_date FROM transactions "
        f"{clause} transaction_type = 'debit' AND transaction_date BETWEEN ? AND ? "
        "ORDER BY transaction_amount DESC LIMIT 3", params + list(window))
    return {"items": [{"amount": round(float(amount), 2), "counterparty": counterparty,
                       "date": when.isoformat()} for amount, counterparty, when in rows],
            "question": QUESTIONS["largest_debits"]}


def _unreferenced(entity_id: str | None) -> dict:
    where, params = _entity_clause(entity_id)
    clause = f"{where} AND " if where else "WHERE "
    rows = db.rows("SELECT count(*) FROM transactions "
                   f"{clause} transaction_reference_id IS NULL AND utr_number IS NULL", params)
    return {"count": int(rows[0][0]), "question": QUESTIONS["unreferenced"]}


def _spikes(entity_id: str | None, month: dict) -> dict:
    plan = {"intent": "counterparty_ranking",
            "filters": {"entity_id": entity_id, "account_ids": None, "transaction_type": "debit",
                        "channels": None, "counterparty": None, "reference": None, "period": month},
            "interpretation": {"spend": "debits", "charges": "include", "scope": "entity"}}
    found = anomaly.counterparty_spikes(plan)[:3]
    return {"items": [{"subject": item["subject"], "ratio": item["ratio"]} for item in found],
            "question": QUESTIONS["spikes"]}


def pulse(entity_id: str | None) -> dict:
    """The five tiles for one entity, computed once and kept."""
    meta = read_meta()
    key = (str(meta.max_date), entity_id)
    if key in _cache:
        return _cache[key]

    month = periods.calendar_month(periods.parse_day(meta.max_date))
    tiles = {
        "accounts": _accounts(entity_id),
        "balance_check": _balance_check(entity_id),
        "largest_debits": _largest_debits(entity_id, month),
        "unreferenced": _unreferenced(entity_id),
        "spikes": _spikes(entity_id, month),
    }
    _cache[key] = tiles
    return tiles
