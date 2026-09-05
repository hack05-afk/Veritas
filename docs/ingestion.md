# Ingesting the delivered dataset

The synthetic ledger is written as CSV with the column names the service
already uses. The delivered dataset will not be. It arrives as JSON Lines,
under file names that say nothing useful, with renamed columns, dates and
amounts in whatever format the exporting system prefers, and columns the base
schema has no place for.

`services/query/app/ingest.py` reads that. It routes each file to a table by
looking at its keys, resolves column names through an alias table, normalises
values, keeps everything it does not recognise, and writes a report saying
exactly what it did.

## Five commands

```
cd services/query
PYTHONPATH=. python -m app.ingest --input ~/delivery --out data/real --dry-run
PYTHONPATH=. python -m app.ingest --input ~/delivery --out data/real
DATA_DIR=services/query/data/real make dev
curl "$QUERY_SERVICE_URL/health"
python eval/ground_truth.py
```

The first run is a rehearsal: it reads at most a thousand rows from each file,
prints the report and writes nothing. Read that report before the real run.

`--input` accepts a directory, a single `.jsonl`, `.ndjson`, `.csv` or `.json`
file, or a `.zip` of any of those. Files are read in chunks, so the size of the
delivery does not decide how much memory the ingest needs.

## How a file finds its table

File names are not used. Every file is scored against the three tables in
`services/query/schema.yaml` under `routing`. A file is routed to a table when
that table's identity column is present and at least six in ten of its required
columns are, and when no second table scores nearly as well.

A file that matches nothing, or matches two tables equally, is not ingested.
The report names it and lists the keys it saw, so the fix is either an alias in
`schema.yaml` or a line in a mapping file.

## How a column finds its name

Keys are compared with case, spaces, hyphens, dots and camel case removed, so
`TxnId`, `txn id` and `txn_id` are the same key. That key is then looked up in
the `aliases` block of `schema.yaml`. `narration`, `particulars`, `remarks` and
`desc` all become `description`; `amount`, `amt` and `txn_amount` all become
`transaction_amount`.

Values are normalised as they are read:

- **Direction.** `credit`, `debit`, `CR`, `DR`, `C`, `D`, `+` and `-` in any
  case become `credit` or `debit`. When there is no direction column, the sign
  of the amount decides. A debit written as a negative number is stored as type
  `debit` with a positive amount.
- **Dates.** ISO with or without a time, `YYYY-MM-DD HH:MM:SS.ffffff`,
  `DD/MM/YYYY` and `DD-MM-YYYY` are all read. Day first: `03/04/2026` is the
  third of April, because Indian exports write it that way. A month-first date
  is only tried when a day-first reading is impossible.
- **Amounts.** Currency words and symbols, commas and spaces are stripped.
  `(1,234.00)` is negative twelve hundred and thirty four.
- **Blanks.** An empty string is a null, not the text "".

A row that still has no id, no account, no readable date, no readable amount or
no direction is rejected rather than guessed at.

## Columns nobody planned for

Any column the alias table does not recognise is kept. It is written into the
Parquet file as a typed passthrough column and registered in the catalog, so a
query template can use it later without a re-ingest. The end of every run says
which ones nobody uses yet:

```
3 columns were kept but no query template uses them yet: reconciliation_status, vendor_id, gl_code
```

Two of these are not passthroughs but first class, because the service knows
what they mean:

- **A vendor or counterparty column wins over the resolver.** The Counterparty
  Resolver reads a counterparty out of the narration. When the dataset already
  names the vendor, that name becomes the counterparty and the resolver's
  decode is kept beside it as `counterparty_resolved`. The report gives the
  rate at which the two disagree. Neither one quietly replaces the other.
- **A reconciliation status becomes the answer to the unreconciled question.**
  When the column exists, "which transactions are still unreconciled" reads it.
  When it does not, the derived check stands in: a row carrying neither a
  reference number nor a UTR cannot be traced.

The names accepted for both are listed under `extras` in `schema.yaml`.

## The report

Every real run writes `DATA_DIR/ingest_report.json` and prints a readable
summary. It contains:

- rows read and rows written, per table
- which files were routed to which table
- for each table, the columns matched, the columns matched under an alias, the
  columns kept as an extra, and the columns that are missing
- rows rejected, with the top five reasons and one real example of each
- files that could not be routed, with the keys they had
- transactions naming an account that is not in the account table, and
  accounts naming a bank that is not in the bank table, with examples
- duplicate primary keys, per table
- the date range found
- the credit and debit split
- resolver coverage
- the vendor column agreement rate, when there is a vendor column
- the reconciliation status values found, when there is such a column
- what was read from the data dictionary

**A run that rejects more than one percent of rows exits non-zero.** The report
is still written. A bad ingest cannot quietly become a demo.

## When a column is not recognised

Read the report. The column will be in `kept_as_extra` for its table, and the
canonical column it should have filled will be in `missing`. There are two
fixes.

The lasting fix is an alias. Add the source key to the right list under
`aliases` in `services/query/schema.yaml` and run the ingest again. Nothing in
the code changes.

The quick fix is a mapping file, for a name too odd to be worth a permanent
alias:

```yaml
# mapping.yaml
transaction:
  transaction_amount: figure
  transaction_date: when
account:
  account_number: Cust A/c
```

The shape is `{table: {canonical_column: source_key}}`. Only `bank`, `account`
and `transaction` are accepted as tables. An override wins over the alias table
and is also used when deciding which table a file belongs to, so it can rescue
a file that would otherwise be unroutable.

```
PYTHONPATH=. python -m app.ingest --input ~/delivery --out data/real --map mapping.yaml
```

## The data dictionary

If the delivery contains a file whose name mentions a dictionary, a glossary, a
schema or a readme, and it is `.md`, `.csv`, `.json` or `.yaml`, the ingester
reads column descriptions out of it: markdown tables, `name - description`
bullets, a mapping of names to text, or a table with a column name column and a
description column. What it finds goes into `DATA_DIR/catalog_columns.json` and
is served by `/catalog`, so the descriptions are the ones the organisers wrote
rather than ones invented here.

A dictionary that cannot be read is reported and the ingest continues. It never
fails a run.

## What is written

```
DATA_DIR/transactions.parquet    the ledger, enriched and protected
DATA_DIR/accounts.parquet        accounts, with account_number encrypted
DATA_DIR/banks.parquet           banks
DATA_DIR/rollups.parquet         the monthly pre-aggregate
DATA_DIR/meta.json               row counts, date bounds, resolver coverage
DATA_DIR/catalog_columns.json    every column, with its description
DATA_DIR/ingest_report.json      the report described above
```

This is the same set the loader writes, so the service needs no change: point
`DATA_DIR` at it and restart.
