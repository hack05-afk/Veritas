"""Masking of the two sensitive columns.

account_number and utr_number are never shown raw: not in a response, a table,
an export or a spoken sentence, and never in a prompt.
"""
from __future__ import annotations

import re

MASK = "••••"
_LONG_DIGIT_RUN = re.compile(r"\d{9,}")


def mask(value: object) -> str | None:
    """Return the last four characters behind a mask. Null stays null."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    return MASK + text[-4:]


def mask_narration(description: object) -> str:
    """Hide the account numbers a bank narration carries in its own text."""
    if description is None:
        return ""
    return _LONG_DIGIT_RUN.sub(lambda m: "*" * (len(m.group()) - 4) + m.group()[-4:], str(description))
