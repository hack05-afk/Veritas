.PHONY: dev web query build deploy

# Web app on :3000 and the query service on :8000. Both in one terminal.
dev:
	@echo "web on http://localhost:3000, query service on http://localhost:8000"
	@$(MAKE) -j2 web query

web:
	npm run dev --workspace apps/web

query:
	cd services/query && PYTHONPATH=. python -m uvicorn app.main:app --reload --port 8000

# Generate and load a synthetic ledger, so the query service has something to read.
data:
	cd services/query && PYTHONPATH=. python -m app.synth --rows 100000 --seed 42 --out data/test_100k
	cd services/query && PYTHONPATH=. python -m app.loader --data data/test_100k

build:
	npm run build --workspace apps/web

deploy:
	@echo "Deployment steps and the real-data swap are in infra/RUNBOOK.md"
