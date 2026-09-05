"""Encryption at rest for the two sensitive columns.

account_number and utr_number are encrypted before they are written to Parquet,
so the files on disk hold no readable identifier. Beside each encrypted column
the loader writes a plaintext _last4 column, because the last four characters
are the only part the product ever displays. The hot path therefore never
decrypts: masking reads _last4 and the ciphertext is never touched.

The encryption is deterministic: the same plaintext always produces the same
ciphertext under the same key. That is a deliberate trade. Deterministic
encryption leaks equality, so an attacker holding the Parquet files can see
which rows share a UTR and can confirm a guessed value by encrypting it. What
it buys is that equality search and grouping still work on the stored column,
which is what the reference lookup and the null checks need. Randomised
encryption would close the equality leak and break both. For these two columns,
which are looked up by exact value, the trade is worth making; it would not be
worth making for a column an attacker could enumerate cheaply.

Nothing here logs a plaintext value, a key or a full ciphertext.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os

log = logging.getLogger("veritas.crypto")

KEY_VARIABLE = "VERITAS_ENCRYPTION_KEY"
SWITCH_VARIABLE = "VERITAS_ENCRYPTION"

KEY_BYTES = 32
NONCE_BYTES = 12

# The scheme that produced a token, so a value written by one build can still be
# read by another. s1 is AES-GCM-SIV, g1 is AES-GCM with a derived nonce.
SIV_TAG = "s1"
GCM_TAG = "g1"

MISSING_KEY_MESSAGE = (
    f"{KEY_VARIABLE} is not set, so account_number and utr_number would be written "
    f"to Parquet in plaintext. Generate a key with "
    f"python -c \"import os,base64;print(base64.b64encode(os.urandom(32)).decode())\" "
    f"and put it in .env, or set {SWITCH_VARIABLE}=off to run without encryption "
    f"for local development."
)

OFF_WARNING = (
    f"{SWITCH_VARIABLE}=off: account_number and utr_number are stored in plaintext. "
    f"This is for local development only."
)


class KeyMissing(RuntimeError):
    """Raised when encryption is on but no key is configured."""


def is_off() -> bool:
    """Whether the explicit local-development opt-out is set."""
    return os.environ.get(SWITCH_VARIABLE, "").strip().lower() == "off"


def _raw_key() -> bytes:
    configured = os.environ.get(KEY_VARIABLE, "").strip()
    if not configured:
        raise KeyMissing(MISSING_KEY_MESSAGE)
    try:
        key = base64.b64decode(configured, validate=True)
    except Exception as bad:
        raise KeyMissing(f"{KEY_VARIABLE} is not valid base64") from bad
    if len(key) != KEY_BYTES:
        raise KeyMissing(f"{KEY_VARIABLE} must decode to {KEY_BYTES} bytes, not {len(key)}")
    return key


def key_fingerprint() -> str:
    """Eight hex characters identifying the key in use, safe to log and to print."""
    return hashlib.sha256(b"veritas-key-id" + _raw_key()).hexdigest()[:8]


def _cipher(key: bytes):
    """The strongest deterministic AEAD this environment offers, and its tag."""
    from cryptography.hazmat.primitives.ciphers import aead

    siv = getattr(aead, "AESGCMSIV", None)
    if siv is not None:
        return siv(key), SIV_TAG
    return aead.AESGCM(key), GCM_TAG


class Cipher:
    """One key, bound to a scheme. Built per key so a rotation is a new instance."""

    def __init__(self, key: bytes) -> None:
        self._aead, self.tag = _cipher(key)
        # AES-GCM-SIV is nonce misuse resistant, so a constant nonce is a sound
        # way to get deterministic ciphertext from it. Plain AES-GCM is not, so
        # its nonce is derived from the plaintext instead: distinct plaintexts
        # get distinct nonces, and equal plaintexts get equal ciphertext.
        self._fixed_nonce = hmac.new(key, b"veritas-siv-nonce", hashlib.sha256).digest()[:NONCE_BYTES]
        self._nonce_key = key

    def _nonce(self, plaintext: bytes) -> bytes:
        if self.tag == SIV_TAG:
            return self._fixed_nonce
        return hmac.new(self._nonce_key, b"veritas-nonce" + plaintext,
                        hashlib.sha256).digest()[:NONCE_BYTES]

    def encrypt(self, text: str) -> str:
        plaintext = text.encode("utf-8")
        nonce = self._nonce(plaintext)
        sealed = self._aead.encrypt(nonce, plaintext, None)
        body = base64.urlsafe_b64encode(nonce + sealed).decode("ascii").rstrip("=")
        return f"{self.tag}:{body}"

    def decrypt(self, token: str) -> str:
        tag, _, body = token.partition(":")
        if tag not in (SIV_TAG, GCM_TAG):
            raise ValueError("not an encrypted value")
        padded = body + "=" * (-len(body) % 4)
        blob = base64.urlsafe_b64decode(padded.encode("ascii"))
        return self._aead.decrypt(blob[:NONCE_BYTES], blob[NONCE_BYTES:], None).decode("utf-8")


_cipher_cache: dict[str, Cipher] = {}


def cipher() -> Cipher:
    """The cipher for the configured key, built once per key."""
    key = _raw_key()
    fingerprint = hashlib.sha256(key).hexdigest()
    found = _cipher_cache.get(fingerprint)
    if found is None:
        found = Cipher(key)
        _cipher_cache[fingerprint] = found
    return found


def require_ready() -> None:
    """Fail loudly at start unless a key is configured or the opt-out is explicit.

    Called by the loader and by the service on import, so a misconfigured
    deployment never quietly writes or serves plaintext.
    """
    if is_off():
        log.warning(OFF_WARNING)
        return
    cipher()


def scheme() -> str:
    """The AEAD in use, for the health endpoint and the security document."""
    if is_off():
        return "off"
    return "AES-GCM-SIV" if cipher().tag == SIV_TAG else "AES-GCM (derived nonce)"


def _text(value: object) -> str | None:
    """The value as a non-empty string, or None for anything blank or null."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in ("nan", "none", "<na>"):
        return None
    return text


def last4(value: object) -> str | None:
    """The last four characters of a sensitive value. Null stays null."""
    text = _text(value)
    return None if text is None else text[-4:]


def encrypt(value: object) -> str | None:
    """One sensitive value, encrypted. Null stays null so counts do not move."""
    text = _text(value)
    if text is None:
        return None
    if is_off():
        return text
    return cipher().encrypt(text)


def encrypt_column(values: object) -> list:
    """A whole column, encrypted, reusing the ciphertext of repeated values."""
    seen: dict[str, str | None] = {}
    out: list = []
    for value in values:
        text = _text(value)
        if text is None:
            out.append(None)
            continue
        found = seen.get(text)
        if found is None:
            found = encrypt(text)
            seen[text] = found
        out.append(found)
    return out


def last4_column(values: object) -> list:
    return [last4(value) for value in values]


def is_ciphertext(value: object) -> bool:
    text = _text(value)
    return bool(text) and text.split(":", 1)[0] in (SIV_TAG, GCM_TAG)


def search_form(value: object) -> str | None:
    """The form to compare against a stored encrypted column.

    Deterministic encryption is what makes this possible: the plaintext the user
    asked about is encrypted with the same key and matched as an equality.
    """
    return encrypt(value)


def reveal(token: object, reason: str) -> str | None:
    """Decrypt one stored value, and record that it happened.

    This is the only path that turns a ciphertext back into a plaintext. Nothing
    in the request path calls it: every response is built from the _last4
    columns. It exists for a deliberate, audited disclosure, and the reason is
    written to the log so the disclosure is not silent. The value itself is
    never logged.
    """
    text = _text(token)
    if text is None:
        return None
    if is_off():
        return text
    log.warning("sensitive value revealed, key %s, reason: %s", key_fingerprint(), reason)
    return cipher().decrypt(text)
