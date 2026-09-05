.PHONY: dev web query test deploy

# Web app on :3000 and the query service on :8000.
dev:
	@echo "web on http://localhost:3000, query service on http://localhost:8000"
	@$(MAKE) -j2 web query

web:
	npm run dev --workspace apps/web

query:
	cd services/query && PYTHONPATH=. python -m uvicorn app.main:app --reload --port 8000

# make test-3 runs the test set for MVP 3.
test-%:
	./internal/tests/run_mvp.sh $*

deploy:
	@echo "Deployment steps and the real-data swap are in infra/RUNBOOK.md"
