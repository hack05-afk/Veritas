"""Counterparty Resolver.

Bank narrations are machine generated strings in a small number of formats, so
the vendor table the schema does not have can be rebuilt without a model. This
module decodes one description into a channel, a counterparty, the bank
identifiers and a reference, with a confidence score. It never guesses: a
description it cannot decode returns no counterparty and confidence 0.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

CHANNELS = ("NEFT", "IMPS", "UPI", "RTGS", "FT", "Disbursement", "Charges", "Cheque", "Other")

# Bank codes seen in the dataset. The loader replaces this with the real bank
# table so a code is only ever recognised if the ledger actually contains it.
BANK_CODES: set[str] = {
    "HDFC", "ICIC", "SBIN", "UTIB", "KKBK", "YESB", "IDFB", "INDB", "BARB", "PUNB",
    "AUBL", "RATN", "CNRB", "UBIN", "IOBA", "MAHB", "FDRL", "BKID", "CBIN", "IDIB",
}

_IFSC = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
_MASKED_ACCOUNT = re.compile(r"^X{4,}\d{4}$", re.IGNORECASE)
_DIGITS = re.compile(r"^\d+$")
_LEADING_WORD = re.compile(r"^\s*([A-Za-z]+)")
_CHARGES = re.compile(r"\bcharges?\b", re.IGNORECASE)
_CHEQUE = re.compile(r"\bcheque\b|\bchq\b", re.IGNORECASE)
_DASH_DELIM = re.compile(r"\s+-\s+")
_TWO_SPACES = re.compile(r"\s{2,}")
_LEGAL_SUFFIX = re.compile(
    r"\s+(?:PRIVATE\s+LIMITED|PVT\.?\s*LTD\.?|PUBLIC\s+LIMITED|LIMITED|LTD\.?|PVT\.?|LLP|INC\.?|CO\.?)$"
)
_ALPHA = re.compile(r"[A-Za-z]")

# Channels that carry no counterparty: a bank charge or a cheque entry is a
# complete decode, it simply has no other party.
_NO_COUNTERPARTY = {"Charges", "Cheque", "Other"}

_LEADING_CHANNEL = {
    "NEFT": "NEFT",
    "IMPS": "IMPS",
    "UPI": "UPI",
    "RTGS": "RTGS",
    "FT": "FT",
    "R": "Disbursement",
}


@dataclass(frozen=True)
class Resolved:
    """The decode of one transaction description."""

    channel: str
    counterparty_raw: str | None
    counterparty_canonical: str | None
    counterparty_family: str | None
    ifsc: str | None
    bank_code: str | None
    reference: str | None
    confidence: float


def set_bank_codes(codes: set[str]) -> None:
    """Point the resolver at the bank table of the loaded dataset."""
    global BANK_CODES
    BANK_CODES = {c.strip().upper() for c in codes if c}


def detect_channel(text: str) -> str:
    """Return the channel implied by the leading token, or Other."""
    if _CHARGES.search(text):
        return "Charges"
    if _CHEQUE.search(text):
        return "Cheque"
    m = _LEADING_WORD.match(text)
    if not m:
        return "Other"
    return _LEADING_CHANNEL.get(m.group(1).upper(), "Other")


def _split(text: str) -> list[str]:
    """Split on the delimiter this format uses, keeping internal spacing intact."""
    if _DASH_DELIM.search(text):
        return _DASH_DELIM.split(text)
    if "/" in text:
        return text.split("/")
    if "-" in text:
        return text.split("-")
    return text.split()


def canonicalise(name: str) -> str:
    """Uppercase, drop trailing branch or location text, drop legal suffixes."""
    out = _TWO_SPACES.split(name.strip().upper(), 1)[0].strip()
    previous = None
    while out and out != previous:
        previous = out
        out = _LEGAL_SUFFIX.sub("", out).strip()
    return " ".join(out.split())


def family_of(canonical: str) -> str:
    """The first two words of a canonical name, used for family matching."""
    return " ".join(canonical.split()[:2])


def _alpha_count(token: str) -> int:
    return sum(1 for ch in token if ch.isalpha())


def resolve(description: str) -> Resolved:
    """Decode one description. Never raises: undecodable input returns channel Other."""
    text = (description or "").replace("\x00", " ")
    channel = detect_channel(text)
    if channel in _NO_COUNTERPARTY:
        return Resolved(channel, None, None, None, None, None, None,
                        0.0 if channel == "Other" else 0.5)

    ifsc: str | None = None
    bank_code: str | None = None
    account: str | None = None
    reference: str | None = None
    candidates: list[str] = []
    code_like: list[str] = []

    for token in _split(text)[1:]:
        token = token.strip()
        if not token:
            continue
        upper = token.upper()
        if _IFSC.match(upper):
            if ifsc is None:
                ifsc = upper
                bank_code = upper[:4]
            continue
        if _MASKED_ACCOUNT.match(token):
            continue
        if _DIGITS.match(token):
            if len(token) >= 13:
                account = account or token
            elif len(token) >= 8:
                if reference is None:
                    reference = token
                else:
                    account = account or token
            continue
        if len(upper) == 4 and upper.isalpha() and upper in BANK_CODES:
            if bank_code is None:
                bank_code = upper
            continue
        if len(token) >= 8 and any(ch.isdigit() for ch in token):
            code_like.append(token)
        candidates.append(token)

    counterparty_raw = None
    best = 2
    for token in candidates:
        score = _alpha_count(token)
        if score > best:
            best, counterparty_raw = score, token

    if reference is None:
        for token in code_like:
            if token != counterparty_raw:
                reference = token
                break

    if counterparty_raw is None:
        return Resolved(channel, None, None, None, ifsc, bank_code, reference, 0.5)

    canonical = canonicalise(counterparty_raw)
    if not canonical:
        return Resolved(channel, None, None, None, ifsc, bank_code, reference, 0.5)

    confidence = 1.0 if reference else 0.6
    return Resolved(channel, counterparty_raw, canonical, family_of(canonical),
                    ifsc, bank_code, reference, confidence)
