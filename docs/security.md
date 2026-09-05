# Security of the sensitive columns

The dataset marks two columns sensitive: `account.account_number` and
`transaction.utr_number`. This document says exactly what is done with them,
what that protects against, and what it does not.

---

## What is encrypted

| Column | On disk | Beside it |
|---|---|---|
| `account.account_number` | ciphertext in `accounts.parquet` | `account_number_last4`, plaintext |
| `transaction.utr_number` | ciphertext in `transactions.parquet` | `utr_number_last4`, plaintext |

Encryption happens in the loader, before anything is written, so the Parquet
files never hold a readable identifier. `services/query/app/crypto.py` is the
only module that holds a key.

The last four characters are stored in the clear on purpose. They are the only
part the product ever displays, so the request path reads `_last4` and never
touches the ciphertext. Nothing in a response, a page of evidence, a catalog, a
pulse tile, an export or a spoken sentence is produced by decrypting anything.

A null stays null. An empty value stays empty. That is what keeps a row count
and a null check identical to what they were before encryption.

### What is not encrypted, and why

`transaction.description` is not encrypted. It is redacted instead: the loader
runs the Counterparty Resolver over the full narration and then stores the
masked text, so the copy on disk carries no account number and no reference in
its own body. The resolver's structured output is kept as its own columns
(`channel`, `counterparty_canonical`, `counterparty_family`, `ifsc`,
`extracted_reference`), which is what every aggregate reads.

`extracted_reference` holds the reference token the resolver found in a
narration. It is a transaction reference, in the same class as
`transaction_reference_id`, which the product displays on purpose. Neither is
marked sensitive by the schema and neither is encrypted.

The source CSVs and any SQL dump under the data directory are the bank's export,
not the product's storage. They are the input to the loader and are not
encrypted by it. `.gitignore` keeps `data/` and `*.parquet` out of the
repository.

---

## The scheme, and its honest limits

AES-GCM-SIV where the environment's `cryptography` package provides it, plain
AES-GCM with a nonce derived as `HMAC(key, plaintext)` where it does not. Both
are authenticated: a modified ciphertext fails to decrypt rather than decrypting
to something else. The service reports which one is in use at `/health`.

The encryption is **deterministic**: the same plaintext always produces the same
ciphertext under the same key.

**What that buys.** Equality search and grouping still work on the stored
column. A question like "show the transaction with UTR ..." encrypts what the
user asked for and matches it as an equality, and `utr_number IS NULL` still
counts the same rows. Randomised encryption would break both, and the schema
document warns about exactly this.

**What that costs.** Deterministic encryption leaks equality. Someone holding
the Parquet files can see which rows share a UTR, and can confirm a guessed
value by encrypting it themselves if they also hold the key. It hides the value;
it does not hide the pattern of repeats. For these two columns, which are
high-entropy and are looked up by exact value, that is a trade worth making. It
would not be worth making for a low-cardinality column an attacker could
enumerate.

It also does not protect against someone who has both the files and the key.
Encryption at rest is a defence against the files being read on their own: a
stolen disk, a copied backup, a misconfigured bucket.

---

## The key

`VERITAS_ENCRYPTION_KEY`, 32 bytes, base64. Generate one with:

```
python -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"
```

It lives in `.env` locally and in the hosting dashboard in a deployment. It is
never committed. `.env.example` carries a placeholder and this instruction.

**The loader and the query service refuse to start without it.** Storing a
sensitive column in plaintext because a variable was missing is the failure this
is meant to prevent, so it is a loud error rather than a silent fallback. The
one exception is `VERITAS_ENCRYPTION=off`, an explicit opt-out for local
development that logs a warning on every start and reports `"encryption": "off"`
at `/health`.

### Rotating the key

Deterministic encryption is over the whole value, so there is no in-place
re-encryption. A rotation is a reload:

1. Generate a new key.
2. Put it in `VERITAS_ENCRYPTION_KEY`.
3. Re-run the loader over the source data:
   `python -m app.loader --data services/query/data/<dataset>`
4. Restart the query service.

Every aggregate is identical afterwards, because the plaintext did not change.
Only the ciphertext does. A key is identified in the logs by an eight-character
fingerprint, never by the key itself.

---

## The one path that can decrypt

`crypto.reveal(token, reason)`. It decrypts one stored value and writes a
warning to the log naming the key fingerprint and the reason, so a disclosure is
never silent. The value itself is never logged.

**Nothing in the request path calls it.** No endpoint, no query template, no
export reaches it. It exists for a deliberate, audited disclosure — a regulator
asking for one specific record — and it is deliberately awkward to reach so that
it cannot become the normal way to read the column.

---

## The leak guard

`services/query/app/leakguard.py` is a single outbound filter that `/query`,
`/evidence`, `/catalog` and `/pulse` all apply as the last step. It walks the
finished payload and, at every leaf:

- drops any key called `account_number` or `utr_number`, or ending `_plain` or
  `_raw`;
- replaces any string holding a run of eleven or more digits, or a twelve to
  twenty-four character run of mixed letters and digits, with its masked form.

It never touches a number. Every computed figure is a number in the payload, so
scrubbing cannot move a total, a count or a ratio.

The threshold is eleven digits because a shorter run is a transaction
reference, which the product shows on purpose. Narration text is masked at a
lower threshold where it is built, in `masking.py`. Two fields are exempt by
name — the evidence `ref` and the parameterised `sql` — because both are
generated by the product rather than read from the ledger, and an evidence ref
happens to have the same shape as a UTR.

This is a second layer. The per-field masking that builds each response is still
there and is still the primary control; the guard is what catches a field nobody
remembered to mask.

`leakguard.assert_clean(payload)` raises on any leak and is what the tests use.

A plan that names `account_number` or `utr_number` anywhere in its body is
refused with a 422 before anything is computed. There is no field in the plan
contract where either name legitimately appears.

---

## The model boundary

The language model reads and writes words. It never computes a number, never
writes SQL and never sees a raw record.

Two parts of a prompt could carry an identifier: the question a person typed,
and the previous plan, which holds the reference value of an earlier lookup. Both
pass through `sanitiseForModel()` in `apps/web/lib/security/redact.ts`, applied
inside `chat()` in `apps/web/lib/llm/provider.ts`. That is the only function in
the product that reaches a model, so there is no way to build a prompt that
skips it.

It does not mask the identifier, it holds it back. Each one is swapped for a
placeholder (`IDENTIFIER_1`) on the way out, and the real value is put back into
the plan the model returns. The model reasons about the placeholder, the query
service receives the real value, and a UTR lookup still works.

The same module redacts the CSV export, the PDF report and the spoken sentence,
so a caller who passes the wrong columns to an export still cannot produce a
file with an unmasked identifier in it. The CSV injection guard is unchanged and
still runs after redaction.

---

## Out of scope

The problem statement puts these outside the brief, and none of them are built.
This section exists so the document does not imply protection that is not there.

- **Multi-tenant isolation.** There is none. Any caller who can reach the query
  service can query the whole ledger. `entity_id` is a filter, not a boundary.
- **User roles and permissions.** There are no users and no roles. Nothing
  distinguishes one caller from another.
- **Production authentication.** The query service endpoints are unauthenticated.
  Deploying it on a public address would expose the whole ledger, masked but
  complete. It is expected to sit behind a network boundary.
- **Key management.** The key is an environment variable. There is no KMS, no
  envelope encryption, no automatic rotation and no audit trail beyond the log
  line that `reveal` writes.
- **Encryption in transit** beyond whatever TLS the hosting provides.
- **The source data files.** Encryption starts at the loader. Whatever wrote the
  CSVs is responsible for them.
