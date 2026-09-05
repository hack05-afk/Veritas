"""The outbound filter every response passes through.

Per-field masking already happens where each response is built. This is the
layer behind it: one filter, applied to the finished payload, that walks every
leaf and removes anything shaped like an account number or a UTR. It exists so
that a new field, a new endpoint or a mistake in a template cannot leak a
sensitive value by a route nobody thought to mask.

It never touches numbers. A computed figure is a number in the payload, not a
string, so scrubbing cannot move a total, a count or a ratio.
"""
from __future__ import annotations

import re
from typing import Any

# Names that must never carry a value out, whatever is in them.
DROP_KEYS = {"account_number", "utr_number", "account_no", "accountnumber", "utr"}
DROP_SUFFIXES = ("_plain", "_raw")

# Values the product generates for itself rather than reads from the ledger: an
# evidence handle and the parameterised SQL. Both can look like a reference by
# accident, and neither can carry one, because the SQL binds its values.
STRUCTURAL_KEYS = {"ref", "evidence_ref", "sql"}

# Eleven digits is the shortest account number this dataset produces. A shorter
# run is a transaction reference, which the product shows on purpose, so the
# guard stops above it and narration text is masked at its own lower threshold
# where it is built.
LONG_DIGITS = re.compile(r"\d{11,}")

# A UTR is a long mixed run of letters and digits with no separator.
UTR_SHAPE = re.compile(r"\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{12,24}\b")

# Column names a plan must never ask to group by or filter on.
SENSITIVE_COLUMNS = ("account_number", "utr_number")


class Leak(AssertionError):
    """Raised by assert_clean when a payload still carries a sensitive value."""


def _drop(key: str) -> bool:
    lowered = key.lower()
    return lowered in DROP_KEYS or lowered.endswith(DROP_SUFFIXES)


def _keep_last_four(match: re.Match) -> str:
    text = match.group()
    return "*" * (len(text) - 4) + text[-4:]


def _clean_text(text: str) -> tuple[str, int]:
    out, digits = LONG_DIGITS.subn(_keep_last_four, text)
    out, mixed = UTR_SHAPE.subn(_keep_last_four, out)
    return out, digits + mixed


class _Walk:
    """One pass over a payload, collecting what it changed."""

    def __init__(self) -> None:
        self.redactions = 0
        self.paths: list[str] = []

    def note(self, path: str, count: int = 1) -> None:
        self.redactions += count
        if len(self.paths) < 20:
            self.paths.append(path)

    def value(self, node: Any, path: str, exempt: bool) -> Any:
        if isinstance(node, dict):
            out = {}
            for key, child in node.items():
                child_path = f"{path}.{key}" if path else key
                if _drop(key):
                    self.note(child_path)
                    continue
                out[key] = self.value(child, child_path, key.lower() in STRUCTURAL_KEYS)
            return out
        if isinstance(node, (list, tuple)):
            return [self.value(child, f"{path}[{i}]", exempt) for i, child in enumerate(node)]
        if isinstance(node, str) and not exempt:
            cleaned, count = _clean_text(node)
            if count:
                self.note(path, count)
            return cleaned
        return node


def scrub(payload: Any) -> tuple[Any, int]:
    """Return the payload with every sensitive value removed, and how many were removed."""
    walk = _Walk()
    return walk.value(payload, "", False), walk.redactions


def clean(payload: Any) -> Any:
    """The scrubbed payload, for a caller that does not need the count."""
    return scrub(payload)[0]


def assert_clean(payload: Any) -> None:
    """Raise if anything in this payload would have been redacted. Used by the tests."""
    walk = _Walk()
    walk.value(payload, "", False)
    if walk.redactions:
        raise Leak(f"{walk.redactions} sensitive value(s) in payload at: {', '.join(walk.paths)}")


def plan_uses_sensitive_column(plan: object) -> str | None:
    """The sensitive column a plan names, or None.

    A plan is a small JSON object with no field for choosing columns, so a plan
    that names one is trying to smuggle it in as a value. The name is looked for
    in the serialised plan rather than in one field, because there is no field
    it would legitimately appear in.
    """
    if not isinstance(plan, (dict, list)):
        return None
    import json

    serialised = json.dumps(plan, default=str).lower()
    for column in SENSITIVE_COLUMNS:
        if column in serialised:
            return column
    return None
