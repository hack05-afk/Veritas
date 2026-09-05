# Runbook

## Deploying

The web app and the query service deploy separately.

**Query service.** Build `services/query/Dockerfile` and run it with a writable
volume at `DATA_DIR`. `infra/render.yaml` is a working configuration. Check
`GET /health`: it reports the loaded row count and the resolver coverage, and
both are zero until the loader has run.

**Web app.** Deploy `apps/web` to any Next.js host. `infra/vercel.json` is a
working configuration. Set `QUERY_SERVICE_URL` to the deployed query service,
and set `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` and
`SARVAM_API_KEY`. Without them the app falls back to the fixtures and answers
only the questions in `fixtures/llm/fake_responses.json`.

## Swapping in the real dataset

1. Put the delivered files in `DATA_DIR`. Either `bank.csv`, `account.csv` and
   `transaction.csv`, or a single `.sql` dump of `INSERT` statements.
2. Edit `services/query/schema.yaml` so each logical name points at the
   physical column the delivered data uses. Nothing else in the code refers to
   a physical column name.
3. Load it:

   ```
   cd services/query && PYTHONPATH=. python -m app.loader --data "$DATA_DIR"
   ```

   The loader runs the Counterparty Resolver over every row and writes
   `transactions.parquet`, `accounts.parquet`, `banks.parquet` and `meta.json`.
   It reads the transaction table in blocks, so row count does not drive memory
   use.
4. Restart the query service so it reopens the new Parquet files.
5. Check the load:

   ```
   curl "$QUERY_SERVICE_URL/health"
   ```

   `resolver_coverage` below 0.9 means the narrations in the real data use a
   format the resolver does not know. Add it to `app/resolver.py` and reload;
   the answer stays correct either way, but unresolved rows group under
   `UNKNOWN` rather than under a counterparty name.
6. Run the query tests against the real data. The planted values in the
   synthetic set do not exist there, so run them in shape-only mode:

   ```
   python eval/ground_truth.py
   python eval/run_eval.py --out eval/results_real.json
   ```

   These check shapes and invariants, not planted numbers: that masking holds,
   that a bad plan is a 422, that reconciliation reports gaps rather than
   errors, and that every intent returns the contracted shape.
7. Rerun the evaluation and update the numbers quoted in `docs/`:

   ```
   python eval/ground_truth.py --data "$DATA_DIR"
   python eval/run_eval.py --out eval/results.json
   ```

## When something looks wrong

- **Every answer is a refusal.** The model provider is unreachable or
  `LLM_PROVIDER=fake` is set with a question that is not in the fixtures.
- **The query service answers 503.** The Parquet files are missing. Run the
  loader.
- **A number looks too large.** Check the interpretation line under it. Spend
  is debits including bank charges by default, and the alternative readings
  beside it show what the other choices would give.
