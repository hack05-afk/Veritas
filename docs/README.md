# Veritas

Veritas answers plain-language questions about a company ledger and shows its
working. A question is turned into a structured query plan by a small language
model, the numbers are computed deterministically in DuckDB over the bank,
account and transaction tables, and the answer comes back with the records
behind it, the other reasonable readings of the same question, and a Stable,
Sensitive or Fragile verdict saying whether those readings would change the
number. Questions can be typed or spoken in an Indian language.

The model chooses the plan and writes the sentence. It never computes a number,
never sees a raw record and never writes SQL.

---

## Run it locally

Setup takes about five minutes. It runs with no API keys at all: nothing is
sent anywhere, and the ledger is generated on your machine.

### 1. What you need

| | Version | Check with |
|---|---|---|
| Node | 20 or later | `node --version` |
| Python | 3.11, 3.12 or 3.13 | `python3 --version` |
| Git and make | any recent version | `git --version` |

Python 3.14 does not work yet: DuckDB and pyarrow have no wheels for it. If
`python3 --version` says 3.14, install 3.13 and use `python3.13` in place of
`python3` in step 3.

On Windows, use WSL. The commands below assume macOS or Linux.

### 2. Get the code

```
git clone https://github.com/hack05-afk/Veritas.git
cd Veritas
npm install
```

### 3. Python setup

```
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/query/requirements.txt
```

Keep this virtual environment active in every terminal where you run the query
service. If your prompt does not start with `(.venv)`, run `source
.venv/bin/activate` again.

### 4. Configure

```
cp .env.example .env
```

The defaults are fine. `LLM_PROVIDER=fake` means the app answers from the
fixtures instead of calling a model, which is what makes it work with no keys.

### 5. Build the ledger

There is no data in the repository. Generate a hundred thousand transactions
and load them:

```
make data
```

This takes about ten seconds and writes CSV and Parquet files under
`services/query/data/test_100k`. It is deterministic: the same seed always
produces the same ledger, which is what lets the tests check exact figures.

### 6. Start it

```
make dev
```

Both services start in this one terminal. Leave it running.

### 7. Check it worked

In a second terminal:

```
curl http://localhost:8000/health
```

You should see `{"ok":true,"service":"query","rows":100000,"resolver_coverage":0.9701}`.
If `rows` is `0`, step 5 did not run. Then open
**http://localhost:3000/workspace**.

---

## What to try first

**This matters.** With `LLM_PROVIDER=fake` there is no model, so Veritas only
understands the 39 questions in `fixtures/llm/fake_responses.json`. Anything
else is refused, and that refusal is correct behaviour, not a bug. Set a real
key (below) to ask anything you like.

The quickest way in is to click, not type:

- The **five Ledger Pulse tiles** across the top of `/workspace`. Each one asks
  the question that produced it.
- The **suggested questions** in the left column.

Questions that work as typed:

```
What did we spend last month?
Who were our top five counterparties last quarter?
How much went out through NEFT in June?
What did we receive last quarter?
What is the balance across all our accounts?
Which accounts do not reconcile?
How many transactions have no reference number or UTR?
Find the transaction with reference 7797183088
How much did SELECTION ELECTRONICS receive in June?
```

Ask the first one, then ask **"Compare that with the month before"** to see a
follow-up carry the previous filters. Ask **"How much did we spend on the
marketing category last month?"** to see a refusal: the schema has no category
column and Veritas will not invent one.

The full list of 39 is the keys of `fixtures/llm/fake_responses.json`.

### Pages worth opening

| Page | What it shows |
|---|---|
| `/` | The landing page and the ledger field |
| `/workspace` | Ask questions and watch the working |
| `/workspace?replay=spend_last_month` | A recorded answer, no services needed |
| `/workspace?replay=error` | What a failure looks like |
| `/kit` | Every design system component in every state |
| `/benchmark` | The model comparison |

The `?replay=` pages read a recorded event stream from `fixtures/events/`, so
they work even if the query service is not running.

---

## Using a real model

Everything above runs offline. To ask arbitrary questions, point Veritas at any
OpenAI-compatible endpoint by editing `.env`:

```
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://your-endpoint/v1
LLM_MODEL=your-model-id
LLM_API_KEY=your-key
```

Restart `make dev`. The model is scored under a 20B parameter limit, so every
candidate is at or under twenty billion parameters; `/benchmark` shows what each
one scored and why one was shipped.

For voice, set `SARVAM_API_KEY`. Without it the voice routes return fixture
transcripts and a silent clip, which is enough to exercise the whole call flow.

---

## When something goes wrong

| Symptom | Cause and fix |
|---|---|
| Every question is refused | Expected without a key: only the 39 fixture questions are understood. See "What to try first". |
| `/health` shows `"rows":0` | The loader has not run. `make data`. |
| The workspace shows an error stage | The query service is not running or has no data. Check `curl http://localhost:8000/health`. |
| `ModuleNotFoundError: duckdb` | The virtual environment is not active, or Python is 3.14. `source .venv/bin/activate`. |
| `pip install` fails building pyarrow | Python 3.14. Use 3.13. |
| `Address already in use` | Port 3000 or 8000 is taken. Stop the other process, or run the two services separately with `make web` and `make query`. |
| `make: command not found` | Install make, or run the commands inside the Makefile by hand. |
| Pulse tiles never appear | The query service is unreachable from the web app. Check `QUERY_SERVICE_URL` in `.env`. |

---

## How it fits together

```
apps/web/        Next.js front end, the orchestrator and the voice routes
packages/ui/     Design tokens and components
services/query/  FastAPI, DuckDB and the Counterparty Resolver
contracts/       JSON Schemas and the OpenAPI description
fixtures/        Example payloads for every contract
eval/            Ground truth, test set, scoring and the benchmark runner
docs/            Architecture, sample questions and answers, limitations
infra/           Deploy configuration and the runbook
```

`docs/architecture.md` has the diagram and marks the boundary between the model
and the deterministic code. `infra/RUNBOOK.md` covers deployment and swapping in
a real dataset.

## The schema, and what it does not have

Three tables, one company, one currency.

```
bank(bank_code, bank_name)
account(account_id, entity_id, account_number, program_id, available_balance, bank_code)
transaction(transaction_id, account_id, transaction_date, transaction_type,
            description, transaction_amount, transaction_reference_id, utr_number)
```

There is no category column, no vendor table and no reconciliation flag. Veritas
does not invent them. A counterparty is decoded from the raw bank narration by
the Counterparty Resolver, which reads the eight machine-generated formats the
data uses and produces a channel, a counterparty name, the bank identifiers and
a reference, with a confidence score. On the synthetic ledger it decodes 97 per
cent of rows. Anything it cannot decode is still counted in every total and is
listed separately as unknown, never guessed at.

Physical column names live in `services/query/schema.yaml`. Swapping in a
different dataset means editing that file and reloading; no other file refers to
a physical column name.

## Defaults and thresholds

Every ambiguous word has one documented default and, where another reading is
reasonable, an interpretation axis that gets recomputed beside the answer.

| Concept | Default | Alternative reading |
|---|---|---|
| spend | debits | net of credits |
| bank charges | included in spend | excluded |
| counterparty match | the exact canonical name | the family, its first two words |
| period | calendar month or quarter, relative to the latest transaction date in the data | a trailing window of the same length |
| scope | all accounts of the entity | only the named accounts |
| reference lookup | transaction_reference_id | utr_number, only when the question says UTR |

A vendor payout is a debit on a transfer channel: NEFT, IMPS, UPI, RTGS or FT.
Bank charges and cheque entries are never payouts. A period is always resolved
against the latest transaction date in the data, never against today, and the
resolved dates are returned with the answer.

Variance between two readings is the absolute difference over the larger of the
primary value and one, as a percentage. A difference below one thousand rupees
is not material whatever the percentage says. The verdict thresholds are: under
5 per cent Stable, 5 to 15 per cent Sensitive, above 15 per cent Fragile. A
question with no applicable axis is Stable and marked as a single reading.

Reconciliation is three deterministic checks, because the schema has no
reconciliation column. R1 compares each account's available balance with the net
of its transactions and reports the difference as a gap, never as an error. R2
matches a debit in one account against a credit in another account of the same
entity for the same amount within a day, and lists what is left. R3 lists rows
carrying neither a reference number nor a UTR, which cannot be traced.

## Sensitive data

`account_number` and `utr_number` are shown only as the last four characters
behind a mask, in every response, table, export, spoken sentence and prompt. The
language model never receives either column. Bank narrations carry account
numbers in their own text, so long digit runs inside a description are masked
too. `transaction_reference_id` is plaintext and searchable by design.

## The model

The model does two jobs. It turns a question into a QueryPlan, which is
validated against `contracts/query_plan.schema.json` before anything runs, and
it rewrites the templated explanation. That rewrite is kept only if every digit
in it appears in the answer's `allowed_numbers`; otherwise the template stands.
That check is what makes a wrong number impossible rather than unlikely.

Sarvam is used for speech only, never for text: speech to text with Saaras in
translate mode, translation, and text to speech with Bulbul. Every chat model on
that endpoint is larger than the parameter limit, so it is not used for
planning. Speech is spoken as words, never digits, so an amount becomes "twelve
lakh forty thousand rupees" before it is ever translated or read aloud.

## Evaluation

`eval/test_set.json` holds 44 questions across eight categories: spend,
counterparties, receipts and balance, reconciliation, lookups, follow-ups,
guardrails and voice. `eval/ground_truth.py` computes the right answer for each
one with pandas straight from the raw files, sharing no code with the query
service, so every answer is worked out twice by two independent routes.

```
python eval/ground_truth.py --data services/query/data/test_100k
python eval/run_eval.py --out eval/results.json
```

`docs/sample_qa.md` is written from that run. `docs/failure_case.md` works
through a question this build answers badly.

## Limitations

- Balances in the synthetic ledger are large negative numbers. Available balance
  is defined as the net of an account's transactions plus a planted gap, and
  seventy per cent of generated rows are debits. Real data will not look like
  this.
- The Counterparty Resolver knows the eight narration formats in this dataset.
  A format it has not seen decodes to channel Other and groups under unknown.
  Totals stay correct; the counterparty breakdown loses a row.
- Reconciliation R2 matches on entity, amount and a one-day window. Two
  unrelated transactions for the same amount in the same entity within a day
  will match each other.
- Conversation state is held in memory in one process. Restarting the web app
  loses the thread of a conversation, and it does not survive more than one
  instance.
- The evaluation numbers come from the fixture provider, where the plans are
  correct by construction. They measure the computation, the grounding check and
  the guardrails, not the model's own planning accuracy. Run `eval/run_eval.py`
  with a real key for that.
- Voice has been exercised only against fixtures. The clips in `fixtures/voice`
  are generated tones, not recordings, so the spoken demo needs real audio
  before it will transcribe correctly.
