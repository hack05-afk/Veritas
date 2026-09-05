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

## Setup

Requirements: Node 20 or later, Python 3.11 or later.

```
npm install
python -m venv .venv && . .venv/bin/activate
pip install -r services/query/requirements.txt
cp .env.example .env
```

Generate and load a synthetic ledger, then start both services:

```
cd services/query
PYTHONPATH=. python -m app.synth --rows 100000 --seed 42 --out data/test_100k
PYTHONPATH=. python -m app.loader --data data/test_100k
cd ../.. && make dev
```

The web app is on http://localhost:3000 and the query service on
http://localhost:8000. With no API keys set, `LLM_PROVIDER=fake` answers from
`fixtures/llm/fake_responses.json`, so the whole product runs offline.

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
and the deterministic code.

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

The text model is any OpenAI-compatible endpoint, configured with
`LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY`. It is scored
under a 20B parameter limit, so every candidate is at or under twenty billion
parameters. `/benchmark` shows what each candidate scored and why one was
shipped; the numbers come from `eval/benchmark.json`.

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
- The evaluation numbers above come from the fixture provider, where the plans
  are correct by construction. They measure the computation, the grounding check
  and the guardrails, not the model's own planning accuracy. Run
  `eval/run_eval.py` with a real key for that.
- Voice has been exercised only against fixtures. The clips in `fixtures/voice`
  are generated tones, not recordings.
