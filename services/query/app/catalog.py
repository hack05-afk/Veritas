"""What the ledger contains, for plan validation and the synonym map.

Only masked account numbers leave this endpoint.
"""
from __future__ import annotations

from app import db
from app.masking import mask
from app.meta import read_meta
from app.resolver import CHANNELS

TOP_COUNTERPARTIES = 200


def catalog() -> dict:
    """Entities, masked accounts, banks, channels, top counterparties and the data bounds."""
    accounts = db.rows("SELECT account_id, entity_id, account_number, bank_code FROM accounts ORDER BY account_id")
    banks = db.rows("SELECT bank_code, bank_name FROM banks ORDER BY bank_code")
    counterparties = db.rows(
        "SELECT counterparty_canonical, any_value(counterparty_family), count(*) AS n "
        "FROM transactions WHERE counterparty_canonical IS NOT NULL "
        "GROUP BY counterparty_canonical ORDER BY n DESC, counterparty_canonical LIMIT ?",
        [TOP_COUNTERPARTIES])
    meta = read_meta()
    return {
        "entities": sorted({row[1] for row in accounts}),
        "accounts": [{"account_id": a, "entity_id": e, "account_masked": mask(n), "bank_code": b}
                     for a, e, n, b in accounts],
        "banks": [{"bank_code": code, "bank_name": name} for code, name in banks],
        "channels": list(CHANNELS),
        "counterparties": [{"canonical": c, "family": f, "count": int(n)} for c, f, n in counterparties],
        "data_bounds": {"min_date": meta.min_date, "max_date": meta.max_date},
    }
