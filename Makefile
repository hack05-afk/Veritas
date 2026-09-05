.PHONY: dev web query data build deploy

# Both processes read the repository-root .env. Next only auto-loads a .env
# inside apps/web, and the query service reads none at all, so it is loaded
# here for both. Without it the query service exits: it refuses to start
# without VERITAS_ENCRYPTION_KEY.
LOAD_ENV = if [ -f .env ]; then set -a; . ./.env; set +a; fi;

# The local virtual environment if there is one, otherwise whichever Python is
# on PATH. An absolute path, because the query targets change directory first.
PY := $(shell if [ -x "$(CURDIR)/.venv/bin/python" ]; then echo "$(CURDIR)/.venv/bin/python"; elif command -v python >/dev/null 2>&1; then echo python; else echo python3; fi)

# Web app on :3000 and the query service on :8000. Both in one terminal.
dev:
	@echo "web on http://localhost:3000, query service on http://localhost:8000"
	@$(MAKE) -j2 web query

web:
	@$(LOAD_ENV) npm run dev --workspace apps/web

query:
	@$(LOAD_ENV) cd services/query && PYTHONPATH=. "$(PY)" -m uvicorn app.main:app --reload --port 8000

# Generate and load a synthetic ledger, so the query service has something to read.
data:
	@$(LOAD_ENV) cd services/query && PYTHONPATH=. "$(PY)" -m app.synth --rows 100000 --seed 42 --out data/test_100k
	@$(LOAD_ENV) cd services/query && PYTHONPATH=. "$(PY)" -m app.loader --data data/test_100k

build:
	@$(LOAD_ENV) npm run build --workspace apps/web

deploy:
	@echo "Deployment steps and the real-data swap are in infra/RUNBOOK.md"
