"""Masking of the two sensitive columns.

account_number and utr_number are never shown raw: not in a response, a table,
an export or a spoken sentence, and never in a prompt.
"""
from __future__ import annotations

import re

MASK = "••••"

# Six digits is the shortest run a bank uses for an account or reference
# number; anything shorter in a narration is a date part or a small code.
_LONG_DIGIT_RUN = re.compile(r"\d{6,}")

# A UTR is a long mixed run of letters and digits, so it carries no digit run
# of its own to catch.
_MIXED_REFERENCE = re.compile(
    r"\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{12,24}\b")


def mask(value: object) -> str | None:
    """Return the last four characters behind a mask. Null stays null."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    return MASK + text[-4:]


def _keep_last_four(match: re.Match) -> str:
    text = match.group()
    return "*" * (len(text) - 4) + text[-4:]


def mask_narration(description: object) -> str:
    """Hide the account and reference numbers a bank narration carries in its own text."""
    if description is None:
        return ""
    text = _MIXED_REFERENCE.sub(_keep_last_four, str(description))
    return _LONG_DIGIT_RUN.sub(_keep_last_four, text)
