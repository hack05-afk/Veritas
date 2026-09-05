# Veritas

Veritas answers plain-language questions about a company ledger and shows its
working. A question is turned into a structured query plan, the numbers are
computed deterministically in DuckDB over the bank, account and transaction
tables, and the answer comes back with the records behind it, the other
reasonable readings of the same question, and a Stable, Sensitive or Fragile
verdict saying whether those readings would change the number. Account numbers
and UTRs are masked everywhere. The language model chooses the plan and writes
the sentence; it never computes a number.

## Running it locally

Requirements: Node 20 or later, Python 3.11 or later.

```
npm install
python -m venv .venv && . .venv/bin/activate
pip install -r services/query/requirements.txt
cp .env.example .env
make dev
```

The web app is on http://localhost:3000 and the query service on
http://localhost:8000. `GET /health` on the query service reports the loaded
row count and the Counterparty Resolver coverage.

## Layout

```
apps/web/        Next.js App Router front end and the orchestrator
packages/ui/     Design tokens and components
services/query/  FastAPI and DuckDB query service
contracts/       JSON Schemas and the OpenAPI description
fixtures/        Example payloads for every contract
eval/            Ground truth, test set and benchmark runners
docs/            Architecture, sample questions and answers, limitations
infra/           Deploy configuration and the runbook
```
